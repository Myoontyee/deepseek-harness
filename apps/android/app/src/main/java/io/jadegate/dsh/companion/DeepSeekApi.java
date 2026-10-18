package io.jadegate.dsh.companion;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.json.*;

/** The same account-authenticated Messages route used by the Desktop provider. */
final class DeepSeekApi implements AutoCloseable {
 interface Connections { HttpURLConnection open(URL url) throws IOException; }
 interface Progress { void update(JSONArray blocks, String text, String thinking) throws Exception; }
 static final class Failure extends IOException {
  final String code; final int status;
  Failure(String code,int status,String message){super(message);this.code=code;this.status=status;}
 }
 static final class Reply {
  final JSONArray blocks;final JSONObject usage;final String stopReason;
  Reply(JSONArray blocks,JSONObject usage,String stopReason){this.blocks=blocks;this.usage=usage;this.stopReason=stopReason;}
 }
 private final String version,device;
 private final Connections connections;
 private volatile HttpURLConnection active;
 private volatile boolean cancelled;
 DeepSeekApi(String version,String device){this(version,device,url->(HttpURLConnection)url.openConnection());}
 DeepSeekApi(String version,String device,Connections connections){this.version=version;this.device=device;this.connections=connections;}

 private HttpURLConnection open(String path,String token,String session) throws IOException {
  if(cancelled)throw new Failure("CANCELLED",0,"已停止生成");
  if(token==null || !token.matches("[\\x21-\\x7e]+"))throw new Failure("AUTH",401,"请先登录 DeepSeek 官方账号");
  HttpURLConnection connection=connections.open(new URL("https://api.deepseek.com"+path));
  active=connection;connection.setInstanceFollowRedirects(false);connection.setConnectTimeout(15000);connection.setReadTimeout(120000);
  connection.setRequestProperty("x-dsh-auth-token",token);
  connection.setRequestProperty("User-Agent","deepseek-harness/"+version+" (+https://github.com/deepseek-ai/deepseek-harness)");
  connection.setRequestProperty("x-deepseek-harness-user-id",device);
  if(session!=null)connection.setRequestProperty("x-deepseek-harness-session-id",session);
  return connection;
 }
 private Failure failure(int status){
  if(cancelled)return new Failure("CANCELLED",0,"已停止生成");
  if(status==401)return new Failure("AUTH",status,"DeepSeek 登录已失效，请在设置中重新登录");
  if(status==402)return new Failure("QUOTA",status,"账户额度不足，请前往 DeepSeek 账户查看余额");
  if(status==403)return new Failure("PERMISSION",status,"该账号暂时无法使用此模型，请检查账户权限或更新客户端");
  if(status==429)return new Failure("RATE_LIMIT",status,"模型请求过于频繁，请稍后重试");
  if(status>=300&&status<400)return new Failure("REDIRECT",status,"模型服务返回了跳转，已停止发送登录凭据");
  if(status==400||status==413)return new Failure("REQUEST",status,"模型未接受请求；请检查模型、思考强度或对话长度");
  return new Failure("SERVICE",status,"DeepSeek 服务请求失败（"+status+"），请稍后重试");
 }
 JSONArray models(String token) throws Exception {
  HttpURLConnection connection=open("/models",token,null);
  connection.setRequestMethod("GET");connection.setRequestProperty("Accept","application/json");
  try{
   int status=connection.getResponseCode();if(status!=200)throw failure(status);
   JSONObject envelope=new JSONObject(readText(connection.getInputStream(),1024*1024));
   JSONArray source=envelope.getJSONArray("data"),result=new JSONArray();Set<String>seen=new HashSet<>();
   for(int i=0;i<source.length()&&result.length()<128;i++){
    JSONObject item=source.optJSONObject(i);if(item==null)continue;
    String id=item.optString("id");if(id.isEmpty()||id.length()>256||!seen.add(id))continue;
    JSONObject capabilities=item.optJSONObject("api_capabilities");
    if(capabilities==null||capabilities.optJSONObject("anthropic_messages")==null)continue;
    JSONObject requirements=item.optJSONObject("client_requirements");
    JSONObject own=requirements==null?null:requirements.optJSONObject("deepseek-harness");
    boolean valid=(!item.has("client_requirements")||requirements!=null)&& (requirements==null||!requirements.has("deepseek-harness")||own!=null)
      && (own==null||!own.has("min_version")||(own.opt("min_version") instanceof String&&!own.getString("min_version").isEmpty()));
    String minimum=own==null?"":own.optString("min_version");
    boolean available=valid&&(minimum.isEmpty()||versionAtLeast(version,minimum));
    int max=item.optInt("max_output_tokens",16384);if(max<1)continue;
    if(item.has("input_modalities")&&!item.getJSONArray("input_modalities").toString().contains("\"text\""))continue;
    if(item.has("output_modalities")&&!item.getJSONArray("output_modalities").toString().contains("\"text\""))continue;
    result.put(new JSONObject().put("id",id).put("name",item.optString("name",id)).put("available",available)
      .put("reason",available?"":"该模型要求更新客户端至 "+minimum)
      .put("maxTokens",Math.min(65536,max)));
   }
   if(result.length()==0)throw new Failure("MODELS",200,"账户未返回本客户端可使用的模型");
   return result;
  }finally{connection.disconnect();if(active==connection)active=null;}
 }
 static boolean versionAtLeast(String actual,String required){
  String pattern="[0-9]+\\.[0-9]+\\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\\+[0-9A-Za-z.-]+)?";
  if(!actual.matches(pattern)||!required.matches(pattern)||actual.length()>100||required.length()>100)return false;
  String[]a=actual.split("\\+",2)[0].split("-",2),b=required.split("\\+",2)[0].split("-",2);
  String[]ac=a[0].split("\\."),bc=b[0].split("\\.");
  for(int i=0;i<3;i++){int c=new java.math.BigInteger(ac[i]).compareTo(new java.math.BigInteger(bc[i]));if(c!=0)return c>0;}
  if(a.length==1||b.length==1)return a.length==1;
  String[]ap=a[1].split("\\."),bp=b[1].split("\\.");
  for(int i=0;i<Math.min(ap.length,bp.length);i++){
   boolean an=ap[i].matches("[0-9]+"),bn=bp[i].matches("[0-9]+");
   int c=an&&bn?new java.math.BigInteger(ap[i]).compareTo(new java.math.BigInteger(bp[i])):an!=bn?(an?-1:1):ap[i].compareTo(bp[i]);
   if(c!=0)return c>0;
  }
  return ap.length>=bp.length;
 }
 static JSONObject request(String model,String effort,int maxTokens,JSONArray history) throws Exception {
  if(!Arrays.asList("off","low","high","max").contains(effort))throw new Failure("REQUEST",0,"思考强度无效");
  if(model==null||model.isEmpty()||model.length()>256||maxTokens<1||maxTokens>65536)throw new Failure("REQUEST",0,"模型参数无效");
  JSONArray messages=new JSONArray();
  for(int i=0;i<history.length();i++){
   JSONObject source=history.getJSONObject(i);String role=source.getString("role");
   if(!role.equals("user")&&!role.equals("assistant"))continue;
   String text=source.optString("text");if(text.isEmpty())continue;
   JSONArray blocks;
   if(role.equals("assistant")&&source.optString("status").equals("complete")&&model.equals(source.optString("model"))&&source.optJSONArray("blocks")!=null)blocks=new JSONArray(source.getJSONArray("blocks").toString());
   else blocks=new JSONArray().put(new JSONObject().put("type","text").put("text",text));
   JSONObject last=messages.length()==0?null:messages.getJSONObject(messages.length()-1);
   if(last!=null&&role.equals(last.getString("role"))){for(int j=0;j<blocks.length();j++)last.getJSONArray("content").put(blocks.get(j));}
   else messages.put(new JSONObject().put("role",role).put("content",blocks));
  }
  JSONObject result=new JSONObject().put("model",model).put("stream",true).put("messages",messages).put("max_tokens",maxTokens)
    .put("thinking",new JSONObject().put("type",effort.equals("off")?"disabled":"enabled"));
  if(!effort.equals("off"))result.put("output_config",new JSONObject().put("effort",effort));
  return result;
 }
 Reply generate(String token,String session,JSONObject payload,Progress progress) throws Exception {
  byte[]bytes=payload.toString().getBytes(StandardCharsets.UTF_8);
  if(bytes.length>8*1024*1024)throw new Failure("REQUEST",0,"这段对话太长，请新建对话后继续");
  HttpURLConnection connection=open("/v1/messages",token,session);
  connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setFixedLengthStreamingMode(bytes.length);
  connection.setRequestProperty("Content-Type","application/json");connection.setRequestProperty("Accept","text/event-stream");
  connection.setRequestProperty("anthropic-version","2023-06-01");
  try{
   try(OutputStream out=connection.getOutputStream()){out.write(bytes);}
   int status=connection.getResponseCode();if(status!=200)throw failure(status);
   try(InputStream stream=connection.getInputStream()){return decode(stream,progress,()->cancelled);}
  }finally{connection.disconnect();if(active==connection)active=null;}
 }
 interface Cancelled { boolean get(); }
 static Reply decode(InputStream input,Progress progress,Cancelled cancelled) throws Exception {
  BufferedReader reader=new BufferedReader(new InputStreamReader(input,StandardCharsets.UTF_8));
  JSONArray blocks=new JSONArray();JSONObject usage=new JSONObject();String stop="";boolean complete=false;
  StringBuilder data=new StringBuilder();long total=0;
  while(!cancelled.get()){
   String line=line(reader,1024*1024);if(line==null){if(data.length()==0)break;line="";}
   total+=line.length();if(total>32*1024*1024)throw new Failure("RESPONSE",0,"模型响应超过本机安全上限");
   if(!line.isEmpty()){if(line.startsWith("data:")){if(data.length()>0)data.append('\n');data.append(line.substring(5).trim());if(data.length()>1024*1024)throw new Failure("RESPONSE",0,"模型事件过大");}continue;}
   if(data.length()==0)continue;
   String encoded=data.toString();data.setLength(0);if(encoded.equals("[DONE]")){complete=true;break;}
   JSONObject event=new JSONObject(encoded);String type=event.optString("type");
   if(type.equals("error"))throw new Failure("STREAM",0,"模型服务中断了生成，请稍后重试");
   if(type.equals("message_start")){JSONObject message=event.optJSONObject("message");if(message!=null&&message.optJSONObject("usage")!=null)usage=message.getJSONObject("usage");}
   if(type.equals("content_block_start")){
    int index=event.getInt("index");if(index<0||index>1024||index!=blocks.length())throw new Failure("RESPONSE",0,"模型返回了无效内容顺序");
    JSONObject block=event.getJSONObject("content_block");String kind=block.getString("type");
    if(!kind.equals("text")&&!kind.equals("thinking"))throw new Failure("RESPONSE",0,"手机聊天暂不执行模型工具调用");
    blocks.put(new JSONObject(block.toString()));
   }
   if(type.equals("content_block_delta")){
    JSONObject block=blocks.getJSONObject(event.getInt("index")),delta=event.getJSONObject("delta");String kind=delta.optString("type");
    String key=kind.equals("text_delta")?"text":kind.equals("thinking_delta")?"thinking":kind.equals("signature_delta")?"signature":"";
    if(!key.isEmpty())block.put(key,block.optString(key)+delta.getString(key));
   }
   if(type.equals("content_block_start")||type.equals("content_block_delta")){
    StringBuilder text=new StringBuilder(),thinking=new StringBuilder();
    for(int i=0;i<blocks.length();i++){JSONObject block=blocks.getJSONObject(i);text.append(block.optString("text"));thinking.append(block.optString("thinking"));}
    progress.update(blocks,text.toString(),thinking.toString());
   }
   if(type.equals("message_delta")){
    JSONObject delta=event.optJSONObject("delta");if(delta!=null)stop=delta.optString("stop_reason",stop);
    JSONObject change=event.optJSONObject("usage");if(change!=null){Iterator<String>keys=change.keys();while(keys.hasNext()){String key=keys.next();usage.put(key,change.get(key));}}
   }
   if(type.equals("message_stop")){complete=true;break;}
  }
  if(cancelled.get())throw new Failure("CANCELLED",0,"已停止生成");
  if(!complete)throw new Failure("INTERRUPTED",0,"网络连接中断，已保存收到的内容");
  return new Reply(blocks,usage,stop);
 }
 private static String line(BufferedReader reader,int limit) throws IOException {
  StringBuilder value=new StringBuilder();int c;
  while((c=reader.read())!=-1){if(c=='\n')return value.toString();if(c!='\r')value.append((char)c);if(value.length()>limit)throw new IOException("Response line too large");}
  return value.length()==0?null:value.toString();
 }
 private static String readText(InputStream input,int limit) throws IOException {
  try(InputStream source=input;ByteArrayOutputStream output=new ByteArrayOutputStream()){
   byte[]bytes=new byte[4096];int count;while((count=source.read(bytes))!=-1){if(output.size()+count>limit)throw new IOException("Response too large");output.write(bytes,0,count);}
   return output.toString("UTF-8");
  }
 }
 @Override public void close(){cancelled=true;HttpURLConnection connection=active;if(connection!=null)connection.disconnect();}
 boolean cancelled(){return cancelled;}
}
