package io.jadegate.dsh.companion;

import android.app.Activity;
import android.content.*;
import android.net.Uri;
import android.webkit.*;
import androidx.webkit.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;
import org.json.*;

/** The native bridge exists only on the packaged local chat origin, never on a paired computer. */
final class PhoneChatScreen implements AutoCloseable {
 static DeepSeekApi.Connections testConnections;
 interface Host {void settings();void changed();void ready();void remoteChats();void remoteOpen(String device,String session);void devices(JSONObject request);}
 final WebView view;
 private final Activity activity;
 private final PhoneChatStore store;
 private final JSONObject account;
 private final Host host;
 private final ExecutorService jobs=Executors.newSingleThreadExecutor();
 private final ExecutorService inference=Executors.newSingleThreadExecutor();
 private volatile DeepSeekApi active;
 private volatile boolean closed;
 private JSONObject chat;
 private JSONArray models=new JSONArray();
 private String scope;
 private JavaScriptReplyProxy reply;
 private boolean generating;
 private String generatingId="";
 private JSONObject verifiedAccount;
 PhoneChatScreen(Activity activity,PhoneChatStore store,JSONObject account,Host host) throws Exception {
  this.activity=activity;this.store=store;this.account=account;this.host=host;
  scope=scope(account);
  view=new SelectionWebView(activity);WebSettings settings=view.getSettings();settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(false);
  settings.setUseWideViewPort(true);settings.setLoadWithOverviewMode(true);
  settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setSupportMultipleWindows(false);
  WebViewAssetLoader assets=new WebViewAssetLoader.Builder().addPathHandler("/assets/",new WebViewAssetLoader.AssetsPathHandler(activity)).build();
  view.setWebViewClient(new WebViewClient(){
   @Override public void onPageFinished(WebView web,String url){if(url.equals("https://appassets.androidplatform.net/assets/chat/index.html"))((SelectionWebView)web).installSelection();}
   @Override public WebResourceResponse shouldInterceptRequest(WebView web,WebResourceRequest request){
    Uri uri=request.getUrl();if("https".equals(uri.getScheme())&&"appassets.androidplatform.net".equals(uri.getHost())&&uri.getUserInfo()==null&&uri.getPort()==-1){WebResourceResponse response=assets.shouldInterceptRequest(uri);if(response!=null)return response;}
    return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
   }
   @Override public boolean shouldOverrideUrlLoading(WebView web,WebResourceRequest request){
    Uri uri=request.getUrl();if(request.isForMainFrame()&&request.hasGesture()&&("https".equals(uri.getScheme())||"http".equals(uri.getScheme()))){try{activity.startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception error){error("无法打开浏览器");}}return true;
   }
  });
  view.setWebChromeClient(new WebChromeClient(){@Override public void onPermissionRequest(PermissionRequest request){request.deny();}});
  if(!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER))throw new IOException("请更新 Android System WebView 后使用手机聊天");
  WebViewCompat.addWebMessageListener(view,"phone",Collections.singleton("https://appassets.androidplatform.net"),(web,message,origin,main,proxy)->{
   if(!main||closed)return;String data=message.getData();if(data==null||data.length()>1024*1024){error("操作内容过大");return;}
   reply=proxy;jobs.execute(()->{try{dispatch(new JSONObject(data));}catch(Exception failure){error(failure.getMessage()==null?"操作失败，请重试":failure.getMessage());}});
  });
  view.loadUrl("https://appassets.androidplatform.net/assets/chat/index.html");
 }
 static String scope(JSONObject account) throws Exception {
  String id=account.optString("accountId");if(!id.isEmpty())return "account:"+id;
  // Older grants have no user ID. Keep them separate rather than exposing another account's history.
  byte[] digest=MessageDigest.getInstance("SHA-256").digest(account.getString("token").getBytes(StandardCharsets.UTF_8));StringBuilder hex=new StringBuilder();for(byte value:digest)hex.append(String.format(Locale.ROOT,"%02x",value));return "grant:"+hex;
 }
 static void identify(JSONObject account) throws Exception {
  HttpURLConnection connection=(HttpURLConnection)new URL("https://platform.deepseek.com/auth-api/v0/users/current").openConnection();
  connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(10000);connection.setReadTimeout(10000);connection.setRequestProperty("x-dsh-auth-token",account.getString("token"));
  try{if(connection.getResponseCode()!=200)throw new IOException("无法确认账号身份");ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream in=connection.getInputStream()){byte[] block=new byte[4096];int count;while((count=in.read(block))!=-1){if(bytes.size()+count>1024*1024)throw new IOException("账号响应过大");bytes.write(block,0,count);}}
   JSONObject response=new JSONObject(bytes.toString("UTF-8")),data=response.getJSONObject("data");if(response.getInt("code")!=0||data.getInt("biz_code")!=0)throw new IOException("官方账号未完成授权");
   JSONObject user=data.getJSONObject("biz_data");String id=user.optString("id");if(id.isEmpty()||id.length()>256)throw new IOException("账号身份无效");account.put("accountId",id);
  }finally{connection.disconnect();}
 }
 private DeepSeekApi api(){return BuildConfig.DEBUG&&testConnections!=null?new DeepSeekApi(BuildConfig.HARNESS_VERSION,account.optString("deviceId","android"),testConnections):new DeepSeekApi(BuildConfig.HARNESS_VERSION,account.optString("deviceId","android"));}
 private void emit(JSONObject event){activity.runOnUiThread(()->{if(!closed&&reply!=null)reply.postMessage(event.toString());});}
 private void error(String text){try{emit(new JSONObject().put("type","error").put("message",text));}catch(JSONException impossible){throw new IllegalStateException(impossible);}}
 void remote(String device,String name,JSONArray sessions,String error){try{emit(new JSONObject().put("type","remote").put("device",device).put("name",name).put("sessions",sessions).put("error",error));}catch(JSONException impossible){throw new IllegalStateException(impossible);}}
 void devices(JSONObject value){try{emit(new JSONObject(value.toString()).put("type","devices"));}catch(JSONException invalid){error("设备状态暂不可读");}}
 void showRemoteDevice(){try{emit(new JSONObject().put("type","showRemoteDevice"));}catch(JSONException impossible){throw new IllegalStateException(impossible);}}
 void cachedRemote(String device,String name,JSONArray sessions){try{emit(new JSONObject().put("type","remote").put("device",device).put("name",name).put("sessions",sessions).put("refreshing",true));}catch(JSONException impossible){throw new IllegalStateException(impossible);}}
 void back(Runnable fallback){view.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(d){d.close();return true}const drawer=document.getElementById('drawer');if(drawer&&!drawer.hidden){document.getElementById('closeHistory').click();return true}return false})()",result->{if(!"true".equals(result))fallback.run();});}
 private synchronized void save() throws Exception {store.save(scope,chat);}
 private synchronized void state() throws Exception {emit(new JSONObject().put("type","state").put("chat",new JSONObject(chat.toString())).put("chats",store.list(scope)).put("models",models).put("generating",generating&&chat.getString("id").equals(generatingId)));}
 private void loadModels(){inference.execute(()->{try(DeepSeekApi api=api()){JSONArray result=api.models(account.getString("token"));synchronized(this){models=result;activity.getSharedPreferences("models",0).edit().putString(scope,result.toString()).apply();state();}
   if(account.optString("accountId").isEmpty())try{JSONObject resolved=new JSONObject(account.toString());identify(resolved);synchronized(this){verifiedAccount=resolved;migrateIdentity();}}catch(Exception failure){/* Keep grant-scoped offline history until a later successful profile request. */}
  }catch(Exception failure){error(failure.getMessage());}});}
 private synchronized void migrateIdentity() throws Exception {
  if(closed||generating||verifiedAccount==null)return;
  SecureStore saved=new SecureStore(activity,"account");String current=saved.read();
  if(current==null||!new JSONObject(current).optString("token").equals(account.getString("token")))return;
  String target=scope(verifiedAccount);store.migrateAccount(scope,target);saved.save(verifiedAccount.toString());account.put("accountId",verifiedAccount.getString("accountId"));scope=target;verifiedAccount=null;
  activity.getSharedPreferences("models",0).edit().putString(scope,models.toString()).apply();state();host.changed();
 }
 private synchronized void dispatch(JSONObject request) throws Exception {
  String action=request.getString("action");
  switch(action){
   case "init":{
    JSONArray chats=store.list(scope);String remembered=activity.getSharedPreferences("options",0).getString("lastPhoneChat","");chat=null;
     if(!remembered.isEmpty())for(int i=0;i<chats.length();i++)if(chats.getJSONObject(i).getString("id").equals(remembered)){chat=store.read(scope,remembered);break;}
     if(chat==null)chat=chats.length()==0?store.create(scope):store.read(scope,chats.getJSONObject(0).getString("id"));remember(chat.getString("id"));
    models=new JSONArray(activity.getSharedPreferences("models",0).getString(scope,"[]"));
    // A killed process may leave a partial assistant turn; preserve its content and make interruption visible.
    JSONArray messages=chat.getJSONArray("messages");for(int i=0;i<messages.length();i++){JSONObject item=messages.getJSONObject(i);if(item.optString("status").equals("generating"))item.put("status","interrupted").put("error","上次生成已中断，收到的内容已保留");}
    save();state();loadModels();activity.runOnUiThread(host::ready);break;
   }
   case "devices":activity.runOnUiThread(()->host.devices(request));break;
   case "showRemoteDevice":showRemoteDevice();break;
   case "models":loadModels();break;
   case "remoteChats":activity.runOnUiThread(host::remoteChats);break;
   case "remoteOpen":{
    String device=request.getString("device"),session=request.getString("id");if(device.length()>200||session.isEmpty()||session.length()>512)throw new IOException("远程对话信息无效");activity.runOnUiThread(()->host.remoteOpen(device,session));break;
   }
   case "copy":{
    String text=request.getString("text");activity.runOnUiThread(()->((android.content.ClipboardManager)activity.getSystemService(Context.CLIPBOARD_SERVICE)).setPrimaryClip(ClipData.newPlainText("DeepSeek",text)));break;
   }
   case "new":chat=store.create(scope);remember(chat.getString("id"));state();break;
   case "open":chat=store.read(scope,request.getString("id"));remember(chat.getString("id"));state();break;
   case "settings":activity.runOnUiThread(host::settings);break;
   case "draft":
    chat.put("draft",request.optString("text")).put("model",request.optString("model")).put("effort",request.optString("effort","high"));
    if(request.has("annotationDraft"))chat.put("annotationDraft",request.getJSONObject("annotationDraft"));save();break;
   case "annotation":{
    JSONObject note=request.getJSONObject("note");String quote=note.optString("quote"),comment=note.optString("comment"),id=note.optString("id");
    if(quote.isEmpty()||quote.length()>100000||comment.length()>100000)throw new IOException("批注内容为空或过长");
    JSONArray notes=chat.getJSONArray("annotations");JSONObject saved=null;for(int i=0;i<notes.length();i++)if(notes.getJSONObject(i).optString("id").equals(id))saved=notes.getJSONObject(i);
    if(saved==null){saved=new JSONObject().put("id",UUID.randomUUID().toString());notes.put(saved);}saved.put("quote",quote).put("comment",comment).put("sent",false);chat.put("annotationDraft",new JSONObject());save();state();host.changed();break;
   }
   case "deleteAnnotation":{
    JSONArray notes=chat.getJSONArray("annotations");for(int i=notes.length()-1;i>=0;i--)if(notes.getJSONObject(i).getString("id").equals(request.getString("id")))notes.remove(i);save();state();host.changed();break;
   }
   case "delete":if(generating)throw new IOException("请先停止生成");chat.put("deleted",true);save();JSONArray remaining=store.list(scope);chat=remaining.length()==0?store.create(scope):store.read(scope,remaining.getJSONObject(0).getString("id"));remember(chat.getString("id"));state();host.changed();break;
   case "stop":if(active!=null)active.close();break;
   case "send":send(request);break;
   default:throw new IOException("不支持的手机聊天操作");
  }
 }
 private synchronized void send(JSONObject request) throws Exception {
  if(generating)throw new IOException("请等待当前回答完成，或先停止生成");
  String text=request.optString("text").trim(),model=request.getString("model"),effort=request.getString("effort");
  JSONObject choice=null;for(int i=0;i<models.length();i++)if(models.getJSONObject(i).getString("id").equals(model))choice=models.getJSONObject(i);
  if(choice==null||!choice.optBoolean("available"))throw new IOException("请刷新并选择账号可用的模型");
  StringBuilder input=new StringBuilder(text);JSONArray notes=chat.getJSONArray("annotations");
  int unsent=0;for(int i=0;i<notes.length();i++)if(!notes.getJSONObject(i).optBoolean("sent"))unsent++;
  if(unsent>0){
   input.append("\n\n（以下 ").append(unsent).append(" 条批注相互独立；每条评论只针对自己的引文，未写评论的引文仅作为整体请求的目标。）");
   int number=0;
   for(int i=0;i<notes.length();i++){JSONObject note=notes.getJSONObject(i);if(note.optBoolean("sent"))continue;number++;
    input.append("\n\n**批注 ").append(number).append("**\n> ").append(note.getString("quote").replace("\n","\n> "));
    String comment=note.optString("comment").trim();if(!comment.isEmpty())input.append("\n\n评论：").append(comment);}
  }
  if(input.toString().trim().isEmpty())throw new IOException("请输入消息或添加批注");
  JSONArray history=new JSONArray(chat.getJSONArray("messages").toString());JSONObject user=new JSONObject().put("role","user").put("text",input.toString()).put("at",System.currentTimeMillis());history.put(user);
  JSONObject payload=DeepSeekApi.request(model,effort,Math.min(16384,choice.getInt("maxTokens")),history);
  if(payload.toString().getBytes(StandardCharsets.UTF_8).length>8*1024*1024)throw new IOException("对话过长，请新建对话");
  JSONObject turn=new JSONObject().put("role","assistant").put("text","").put("thinking","").put("model",model).put("effort",effort).put("status","generating");
  JSONArray messages=chat.getJSONArray("messages");messages.put(user);messages.put(turn);chat.put("draft","").put("model",model).put("effort",effort);
  for(int i=0;i<notes.length();i++)notes.getJSONObject(i).put("sent",true);
  if(messages.length()==2)chat.put("title",input.substring(0,Math.min(60,input.length())).replace('\n',' '));
  save();generating=true;generatingId=chat.getString("id");JSONObject target=chat;String id=generatingId;state();
  DeepSeekApi api=api();active=api;
  inference.execute(()->{
   long[] last={0,0};try{
    DeepSeekApi.Reply response=api.generate(account.optString("token"),id,payload,(blocks,answer,thinking)->{synchronized(this){
     turn.put("text",answer).put("thinking",thinking).put("blocks",new JSONArray(blocks.toString()));long now=System.currentTimeMillis();
     if(now-last[1]>=1000){last[1]=now;store.save(scope,target);}
     if(now-last[0]>=160){last[0]=now;emit(new JSONObject().put("type","turn").put("id",id).put("turn",new JSONObject(turn.toString())));}
    }});
    synchronized(this){turn.put("blocks",response.blocks).put("usage",response.usage).put("status","complete");if(response.stopReason.equals("max_tokens"))turn.put("error","达到本次输出上限，可继续追问");}
   }catch(Exception failure){synchronized(this){try{turn.put("status",api.cancelled()?"stopped":"interrupted").put("error",api.cancelled()?"已停止生成":failure instanceof DeepSeekApi.Failure?failure.getMessage():"网络连接中断，已保留收到的内容，请重试");}catch(JSONException impossible){throw new IllegalStateException(impossible);}}}
   finally{api.close();synchronized(this){generating=false;active=null;try{store.save(scope,target);migrateIdentity();state();host.changed();}catch(Exception failure){error("无法保存回答，请保留当前页面并释放手机存储空间");}}}
  });
 }
 private void remember(String id) { activity.getSharedPreferences("options",0).edit().putString("lastPhoneChat",id).apply(); }
 @Override public synchronized void close(){closed=true;if(active!=null)active.close();jobs.shutdown();inference.shutdown();view.destroy();}
}
