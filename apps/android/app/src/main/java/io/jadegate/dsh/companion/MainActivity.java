package io.jadegate.dsh.companion;

import android.app.Activity;
import com.google.zxing.integration.android.IntentIntegrator;
import com.google.zxing.integration.android.IntentResult;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslCertificate;
import android.net.http.SslError;
import android.os.Bundle;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.*;
import android.widget.*;
import org.json.JSONObject;
import java.io.ByteArrayInputStream;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Personal device client: only the explicitly paired computer may load in the WebView. */
public final class MainActivity extends Activity {
 private final ExecutorService worker = Executors.newSingleThreadExecutor();
 private SecureStore store;
 private TailnetClient tailnet;
 private final android.os.Handler tailnetHandler=new android.os.Handler(android.os.Looper.getMainLooper());
 private Runnable tailnetPoll;
 private boolean tailnetLoginRequested;
 private boolean foreground;
 private String openedTailnetAuth="";
 private SecureStore accountStore;
 private AccountSignIn signIn;
 private boolean connectionFailed;
 private android.net.ConnectivityManager networkManager;
 private android.net.ConnectivityManager.NetworkCallback networkCallback;
 private long lastReconnect;
 private WebView web;
 private EditText pairingInput;
 private Pairing connected;
 private TextView status;
 private final java.util.ArrayList<TextView> networkStatusViews = new java.util.ArrayList<>();
 private volatile boolean disposed;
 private volatile int generation;
 private ValueCallback<Uri[]> fileCallback;
 private static final int FILE_REQUEST = 41;

 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
  store = new SecureStore(this);
  tailnet = new TailnetClient(this);
  accountStore = new SecureStore(this,"account");
  showStart();
 }
 private String appVersion() {
  try { return getPackageManager().getPackageInfo(getPackageName(),0).versionName; }
  catch(Exception error) { throw new IllegalStateException("Application version unavailable",error); }
 }
 private boolean signedIn() {
  try { String value=accountStore.read(); return value!=null && new JSONObject(value).optString("issuer").equals("https://platform.deepseek.com") && !new JSONObject(value).optString("token").isEmpty(); }
  catch(Exception error) { accountStore.clear(); return false; }
 }
 private void showStart() {
  if(!signedIn()) { showLogin(""); return; }
  showHome("");
 }
 private LinearLayout page(String title) {
  LinearLayout content=new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(dp(24),dp(32),dp(24),dp(24));
  ScrollView scroll=new ScrollView(this);scroll.addView(content);installContent(scroll);content.addView(text(title,26));return content;
 }
 private void showLogin(String notice) {
  generation++; final int current=generation;
  if(web!=null) { web.stopLoading();web.destroy();web=null; }
  connected=null; connectionFailed=false;
  LinearLayout content=page("DeepSeek Harness Desktop");
  TextView intro=text("登录 DeepSeek，继续处理你的工作",21);intro.setPadding(0,dp(28),0,dp(16));content.addView(intro);
  content.addView(text("查看电脑上的对话和文件，选中文字，添加备注与批示。任务由你连接的电脑执行。",16));
  TextView privacy=text("登录在 DeepSeek 官方浏览器页面完成，本应用不收集账号密码。首次控制电脑仍需在电脑上确认授权。",14);privacy.setPadding(0,dp(18),0,dp(18));content.addView(privacy);
  Button login=button("登录 DeepSeek 官方账号");content.addView(login);
  Button cancel=button("取消本次登录");cancel.setVisibility(View.GONE);content.addView(cancel);
  TextView progress=text(notice,14);content.addView(progress);
  cancel.setOnClickListener(v->{if(signIn!=null)signIn.close();signIn=null;showLogin("已取消登录，可以重新开始。");});
  login.setOnClickListener(v->{
   login.setEnabled(false);cancel.setVisibility(View.VISIBLE);progress.setText("正在打开 DeepSeek 官方授权页面…完成后请返回此应用。");
   final AccountSignIn attempt=new AccountSignIn(appVersion());signIn=attempt;
   worker.execute(()->{
    try {
     String device=getSharedPreferences("identity",MODE_PRIVATE).getString("device",null);
     if(device==null) { device=java.util.UUID.randomUUID().toString();if(!getSharedPreferences("identity",MODE_PRIVATE).edit().putString("device",device).commit())throw new Exception("无法保存设备标识"); }
     JSONObject result=attempt.login(url->runOnUiThread(()->{
      if(disposed || generation!=current || signIn!=attempt)return;
      try { startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(url))); }
      catch(Exception error) { attempt.close();progress.setText("没有可用浏览器，请安装或启用系统浏览器后重试。"); }
     }),device);
     runOnUiThread(()->{
      if(disposed || generation!=current || signIn!=attempt)return;
      try { accountStore.save(result.toString());signIn=null;attempt.close();showStart(); }
      catch(Exception error) { login.setEnabled(true);cancel.setVisibility(View.GONE);progress.setText("无法保存登录，请重试。"); }
     });
    } catch(Exception error) { runOnUiThread(()->{if(!disposed && generation==current && signIn==attempt){signIn=null;login.setEnabled(true);cancel.setVisibility(View.GONE);progress.setText("登录未完成："+error.getMessage());}}); }
   });
  });
 }
 private void showHome(String notice) {
  if(web!=null){web.stopLoading();web.destroy();web=null;}connected=null;
  generation++; LinearLayout content=page("DeepSeek Harness Desktop");
  TextView intro=text("连接电脑后，可以阅读对话和文件、选中文字并添加备注批示。",18);intro.setPadding(0,dp(24),0,dp(20));content.addView(intro);
  content.addView(text("已登录 DeepSeek",14));
  addTailnetPanel(content);
  Button settings=button("备用：扫码连接电脑");content.addView(settings);settings.setOnClickListener(v->showPairing(""));
  try {
   String saved=store.read();
   if(saved!=null){Pairing pairing=new Pairing(new JSONObject(saved),"token");Button open=button("打开已配对电脑");content.addView(open);open.setOnClickListener(v->openSavedConnection(pairing));}
  } catch(Exception error) { notice="保存的连接暂不可用，请在设置重新配对。"; }
  addNetworkControls(content);content.addView(text(notice,14));
  Button account=button("账号设置");content.addView(account);account.setOnClickListener(v->accountSettings());
  Button about=button("关于 DeepSeek Harness Desktop");content.addView(about);about.setOnClickListener(v->new AlertDialog.Builder(this).setTitle("DeepSeek Harness Desktop").setMessage("版本 "+appVersion()).setPositiveButton("确定",null).show());
 }
 private void addTailnetPanel(LinearLayout content) {
  final int current=generation;
  TextView heading=text("Tailscale 设备",20);heading.setPadding(0,dp(18),0,dp(8));content.addView(heading);
  TextView progress=text("正在检查应用内 Tailscale 登录…",15);content.addView(progress);
  Button login=button("登录 Tailscale，自动发现设备");content.addView(login);
  Button logout=button("退出应用内 Tailscale");logout.setVisibility(View.GONE);content.addView(logout);
  TextView explanation=text("首次在应用内授权 Tailscale；之后自动恢复登录并显示该账号可见的设备。",14);content.addView(explanation);
  LinearLayout rows=new LinearLayout(this);rows.setOrientation(LinearLayout.VERTICAL);content.addView(rows);
  final boolean[] busy={false};final String[] lastRows={""};
  Runnable poll=new Runnable(){public void run(){
   if(disposed || generation!=current || busy[0])return;busy[0]=true;
   worker.execute(()->{try{
    JSONObject result=tailnet.command("status");
    runOnUiThread(()->{
     busy[0]=false;if(disposed || generation!=current)return;
     String state=result.optString("state");boolean running=state.equals("Running");
     progress.setText(running?"Tailscale 已连接 · 设备列表自动更新":state.equals("NeedsMachineAuth")?"请在 Tailscale 管理页面批准此设备":"请登录应用内的 Tailscale，以读取设备列表");
     logout.setVisibility(running?View.VISIBLE:View.GONE);login.setVisibility(running?View.GONE:View.VISIBLE);explanation.setVisibility(running?View.GONE:View.VISIBLE);
     String auth=result.optString("authUrl");
     if(tailnetLoginRequested && !auth.isEmpty() && !auth.equals(openedTailnetAuth)) {
      Uri uri=Uri.parse(auth);
      if("https".equals(uri.getScheme()) && "login.tailscale.com".equals(uri.getHost()) && uri.getUserInfo()==null){openedTailnetAuth=auth;try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}catch(Exception error){progress.setText("请启用系统浏览器后重新登录");}}
     }
     if(running)tailnetLoginRequested=false;
     org.json.JSONArray peers=result.optJSONArray("devices");String fingerprint=running&&peers!=null?peers.toString():"";
     if(!fingerprint.equals(lastRows[0])) {
      lastRows[0]=fingerprint;rows.removeAllViews();
      if(running && peers!=null)for(int i=0;i<peers.length();i++) {
       JSONObject peer=peers.optJSONObject(i);if(peer==null)continue;
       String name=peer.optString("name");boolean self=peer.optBoolean("self");
       LinearLayout row=new LinearLayout(MainActivity.this);row.setOrientation(LinearLayout.VERTICAL);row.setPadding(dp(12),dp(12),dp(12),dp(12));
       row.addView(text(name,18));row.addView(text(peer.optString("os")+" · "+(self?"此应用":peer.optBoolean("online")?"在线":"离线"),14));
       if(!self){Button connect=button("连接此电脑");row.addView(connect);connect.setOnClickListener(v->connectTailnetPeer(peer,progress,connect));}
       rows.addView(row);
      }
     }
     if(foreground&&tailnetPoll==this)tailnetHandler.postDelayed(this,running?10000:2000);
    });
   }catch(Exception error){runOnUiThread(()->{busy[0]=false;if(!disposed&&generation==current){progress.setText("Tailscale 暂不可用："+error.getMessage());login.setVisibility(View.VISIBLE);}});}});
  }};
  tailnetPoll=poll;tailnetHandler.post(poll);
  logout.setOnClickListener(v->new AlertDialog.Builder(this).setMessage("退出应用内 Tailscale 后，需重新登录才能显示设备列表和连接电脑。").setPositiveButton("退出",(d,w)->worker.execute(()->{try{tailnet.command("logout");runOnUiThread(()->{if(!disposed&&generation==current){tailnetLoginRequested=false;tailnetHandler.removeCallbacks(poll);tailnetHandler.post(poll);}});}catch(Exception error){runOnUiThread(()->{if(!disposed&&generation==current)progress.setText(error.getMessage());});}})).setNegativeButton("取消",null).show());
  login.setOnClickListener(v->{login.setEnabled(false);tailnetLoginRequested=true;openedTailnetAuth="";worker.execute(()->{try{tailnet.command("login");runOnUiThread(()->{if(!disposed&&generation==current){login.setEnabled(true);tailnetHandler.removeCallbacks(poll);tailnetHandler.post(poll);}});}catch(Exception error){runOnUiThread(()->{if(!disposed&&generation==current){login.setEnabled(true);progress.setText(error.getMessage());}});}});});
 }
 private void connectTailnetPeer(JSONObject peer,TextView progress,Button button) {
  final int current=generation;button.setEnabled(false);progress.setText("正在联系 "+peer.optString("name")+"，请在电脑确认连接…");
  worker.execute(()->{try{
   if(disposed||generation!=current)return;
   JSONObject response=tailnet.command(new JSONObject().put("action","pair").put("id",peer.getString("id")));
   JSONObject saved=response.getJSONObject("connection").put("tailnet",true);new Pairing(saved,"token");
   runOnUiThread(()->{if(disposed||generation!=current)return;try{store.save(saved.toString());openSavedConnection(new Pairing(saved,"token"));}catch(Exception error){button.setEnabled(true);progress.setText(error.getMessage());}});
  }catch(Exception error){runOnUiThread(()->{if(!disposed&&generation==current){button.setEnabled(true);progress.setText("连接未完成："+error.getMessage());}});}});
 }
 private boolean automaticReconnect() { return getSharedPreferences("options",MODE_PRIVATE).getBoolean("autoReconnect",true); }
 private String networkSummary() {
  NetworkEvidence evidence=new NetworkEvidence(getPackageManager().getLaunchIntentForPackage("com.tailscale.ipn")!=null);
  try {
   android.net.ConnectivityManager manager=(android.net.ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
   for(android.net.Network network:manager.getAllNetworks()) {
    android.net.NetworkCapabilities capabilities=manager.getNetworkCapabilities(network);
    if(capabilities==null || !capabilities.hasTransport(android.net.NetworkCapabilities.TRANSPORT_VPN))continue;
    evidence.vpnVisible=true;
    android.net.LinkProperties properties=manager.getLinkProperties(network);
    if(properties!=null)for(android.net.LinkAddress address:properties.getLinkAddresses())evidence.observe(true,address.getAddress());
   }
  } catch(Exception error) { evidence.restricted=true; }
  // Some devices omit VPN LinkProperties. Inspect only named tunnel interfaces, not cellular CGNAT addresses.
  try {
   java.util.Enumeration<java.net.NetworkInterface> interfaces=java.net.NetworkInterface.getNetworkInterfaces();
   if(interfaces!=null)while(interfaces.hasMoreElements()) {
    java.net.NetworkInterface entry=interfaces.nextElement();String name=entry.getName();
    if(!entry.isUp() || !(name.startsWith("tun") || name.startsWith("wg") || name.startsWith("tailscale")))continue;
    java.util.Enumeration<java.net.InetAddress> addresses=entry.getInetAddresses();
    while(addresses.hasMoreElements())evidence.observe(true,addresses.nextElement());
   }
  } catch(Exception error) { evidence.restricted=true; }
  return evidence.summary();
 }
 private TextView networkLabel() { TextView label=text(networkSummary(),14);networkStatusViews.add(label);return label; }
 private void refreshNetworkLabels() {
  if(disposed || networkStatusViews.isEmpty())return;
  String summary=networkSummary();for(TextView label:networkStatusViews)label.setText(summary);
 }
 private void openTailscale() {
  Intent intent=getPackageManager().getLaunchIntentForPackage("com.tailscale.ipn");
  if(intent!=null)startActivity(intent);
  else new AlertDialog.Builder(this).setMessage("请先安装 Tailscale，再返回此处连接。手机与电脑在同一 Wi-Fi 时，也可直接扫码配对。").setPositiveButton("确定",null).show();
 }
 private void addNetworkControls(LinearLayout content) {
  content.addView(networkLabel());
  LinearLayout actions=new LinearLayout(this);
  Button open=button("打开 Tailscale");actions.addView(open,new LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1));open.setOnClickListener(v->openTailscale());
  Button refresh=button("刷新网络状态");actions.addView(refresh,new LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1));refresh.setOnClickListener(v->refreshNetworkLabels());
  content.addView(actions);
 }
 @Override protected void onResume(){super.onResume();refreshNetworkLabels();if(tailnetPoll!=null){tailnetHandler.removeCallbacks(tailnetPoll);tailnetHandler.post(tailnetPoll);}}
 private void accountSettings() {
  new AlertDialog.Builder(this).setTitle("DeepSeek 账号").setMessage("已保存官方授权登录。电脑控制授权独立管理。退出账号前，请先保存未发送的备注。")
   .setPositiveButton("保留登录",null).setNeutralButton("退出本机账号",(dialog,which)->{
    final String saved;try{saved=accountStore.read();}catch(Exception error){showLogin("无法读取账号，请重试。");return;}
    accountStore.clear();showLogin("已退出本机账号。");final int logoutGeneration=generation;
    if(saved!=null)worker.execute(()->{try(AccountSignIn account=new AccountSignIn(appVersion())){account.logout(new JSONObject(saved).getString("token"));}catch(Exception error){runOnUiThread(()->{if(!disposed&&generation==logoutGeneration&&!signedIn())Toast.makeText(this,"本机已退出；官方授权撤销暂未完成，可在官方账号管理设备。",Toast.LENGTH_LONG).show();});}});
   }).show();
 }
 private void connectionSettings() {
  LinearLayout content=new LinearLayout(this);content.setOrientation(LinearLayout.VERTICAL);content.setPadding(dp(20),dp(8),dp(20),dp(8));
  TextView networkStatus=networkLabel();content.addView(networkStatus);
  Switch automatic=new Switch(this);automatic.setText("网络恢复后自动重连已授权电脑");automatic.setChecked(automaticReconnect());content.addView(automatic);
  automatic.setOnCheckedChangeListener((button,checked)->getSharedPreferences("options",MODE_PRIVATE).edit().putBoolean("autoReconnect",checked).apply());
  Button detect=button("重新检测 Tailscale 网络");content.addView(detect);detect.setOnClickListener(v->new AlertDialog.Builder(this).setMessage(networkSummary()).setPositiveButton("确定",null).show());
  Button tailscale=button("打开 Tailscale");content.addView(tailscale);tailscale.setOnClickListener(v->{Intent intent=getPackageManager().getLaunchIntentForPackage("com.tailscale.ipn");if(intent!=null)startActivity(intent);else new AlertDialog.Builder(this).setMessage("请先安装并登录 Tailscale，再返回此处检测。程序不会扫描整个私有网络或替新电脑授予控制权限。").setPositiveButton("确定",null).show();});
  Button forget=button("清除此手机的电脑授权");content.addView(forget);forget.setOnClickListener(v->new AlertDialog.Builder(this).setMessage("请先保存未发送的备注。清除本机凭据后，需要重新扫码配对。电脑上的撤销入口仍可立即断开设备。").setPositiveButton("清除",(d,w)->forget()).setNegativeButton("取消",null).show());
  if(connected!=null)content.addView(text("已配对电脑："+Uri.parse(connected.origin).getHost()+"\n首次连接其他电脑，请先保存备注，再重新配对。",14));
  AlertDialog connectionDialog=new AlertDialog.Builder(this).setTitle("设置 → 连接").setView(content).setPositiveButton("完成",null)
   .setNeutralButton("设备列表",(dialog,which)->new AlertDialog.Builder(this).setMessage("更换电脑会关闭当前页面。请先保存未发送的备注批示。").setPositiveButton("已保存，继续",(d,w)->showHome("")).setNegativeButton("取消",null).show())
   .setNegativeButton("账号设置",(dialog,which)->accountSettings()).show();
  connectionDialog.setOnDismissListener(dialog->networkStatusViews.remove(networkStatus));
 }
 @Override protected void onStart() {
  super.onStart();foreground=true;networkManager=(android.net.ConnectivityManager)getSystemService(CONNECTIVITY_SERVICE);
  networkCallback=new android.net.ConnectivityManager.NetworkCallback(){@Override public void onAvailable(android.net.Network network){runOnUiThread(()->{
   refreshNetworkLabels();
   if(!disposed && web!=null && connected!=null && connectionFailed && automaticReconnect() && signedIn() && System.currentTimeMillis()-lastReconnect>5000){lastReconnect=System.currentTimeMillis();connectionFailed=false;status.setText("网络已恢复，正在重连已授权电脑…");web.reload();}
  });}
   @Override public void onLost(android.net.Network network){runOnUiThread(()->refreshNetworkLabels());}
   @Override public void onCapabilitiesChanged(android.net.Network network,android.net.NetworkCapabilities capabilities){runOnUiThread(()->refreshNetworkLabels());}
   @Override public void onLinkPropertiesChanged(android.net.Network network,android.net.LinkProperties properties){runOnUiThread(()->refreshNetworkLabels());}
  };
  try { networkManager.registerNetworkCallback(new android.net.NetworkRequest.Builder().removeCapability(android.net.NetworkCapabilities.NET_CAPABILITY_NOT_VPN).build(),networkCallback); } catch(SecurityException unavailable){networkCallback=null;}
 }
 @Override protected void onStop(){foreground=false;if(tailnetPoll!=null)tailnetHandler.removeCallbacks(tailnetPoll);if(networkManager!=null&&networkCallback!=null){networkManager.unregisterNetworkCallback(networkCallback);networkCallback=null;}super.onStop();}
 private void annotateSelection() {
  if(web==null || connected==null || !sameOrigin(Uri.parse(web.getUrl()==null?"":web.getUrl()),connected))return;
  String script="(()=>{const s=getSelection();if(!s||s.isCollapsed||!s.anchorNode)return false;const e=s.anchorNode.nodeType===1?s.anchorNode:s.anchorNode.parentElement;if(!e||e.closest('input,textarea,[contenteditable=true]'))return false;e.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch'}));let n=0;const pick=()=>{const b=[...document.querySelectorAll('button[role=menuitem]')].find(x=>/^(添加注释|Add annotation)$/i.test(x.textContent.trim()));if(b){b.click();return;}if(++n<12)requestAnimationFrame(pick);};requestAnimationFrame(pick);return true;})()";
  web.evaluateJavascript(script,result->{if("false".equals(result))Toast.makeText(this,"先长按选中对话或文件中的文字，再点添加注释。",Toast.LENGTH_LONG).show();});
 }
 @Override public void onActionModeStarted(android.view.ActionMode mode){super.onActionModeStarted(mode);if(web!=null&&connected!=null)mode.getMenu().add("添加注释").setShowAsActionFlags(android.view.MenuItem.SHOW_AS_ACTION_IF_ROOM).setOnMenuItemClickListener(item->{annotateSelection();new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(()->mode.finish(),300);return true;});}

 private void installContent(View view) {
  networkStatusViews.clear();
  if(tailnetPoll!=null){tailnetHandler.removeCallbacks(tailnetPoll);tailnetPoll=null;}
  int left=view.getPaddingLeft(),top=view.getPaddingTop(),right=view.getPaddingRight(),bottom=view.getPaddingBottom();
  view.setOnApplyWindowInsetsListener((target,insets)-> { target.setPadding(left+insets.getSystemWindowInsetLeft(),top+insets.getSystemWindowInsetTop(),right+insets.getSystemWindowInsetRight(),bottom+insets.getSystemWindowInsetBottom()); return insets; });
  setContentView(view); view.requestApplyInsets();
 }
 private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
 private TextView text(String value, int size) { TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(Color.rgb(30,35,45)); return view; }
 private Button button(String value) { Button view = new Button(this); view.setText(value); view.setAllCaps(false); return view; }
 private void showPairing(String notice) {
  generation++;
  if (web != null) { web.stopLoading(); web.destroy(); web = null; }
  connected = null;
  LinearLayout content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(dp(24),dp(32),dp(24),dp(24));
  ScrollView scroll = new ScrollView(this); scroll.addView(content); installContent(scroll);
  content.addView(text("设置 → 连接电脑", 26));
  Button back=button("返回");content.addView(back);back.setOnClickListener(v->showHome(""));
  addNetworkControls(content);
  content.addView(text("下一步：在电脑开启手机控制，再扫描 DSH 二维码。网络连通和电脑授权是两个步骤。",16));
  try { String saved=store.read();if(saved!=null){Pairing previous=new Pairing(new JSONObject(saved),"token");Button reopen=button("重连已配对电脑");content.addView(reopen);reopen.setOnClickListener(v->openSavedConnection(previous));} } catch(Exception error) { /* A new pairing remains available if the saved grant is unreadable. */ }
  TextView instructions = text("电脑和 DSH 需要保持运行。\n在电脑的“应用 → 手机控制”生成二维码，优先扫码连接；配对码也可以粘贴到这里。手机可以查看对话、发送任务并处理确认。\n\n同一 Wi-Fi 或已连通的私有网络均可；请勿把配对码发给其他人。",16);
  instructions.setPadding(0,dp(18),0,dp(18)); content.addView(instructions);
  EditText code = new EditText(this); code.setHint("粘贴电脑生成的配对码"); code.setMinLines(3); code.setMaxLines(6); code.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE | android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS); content.addView(code);
  pairingInput = code;
  Button scan = button("扫描电脑上的二维码"); content.addView(scan);
  scan.setOnClickListener(v -> new IntentIntegrator(this).setDesiredBarcodeFormats(IntentIntegrator.QR_CODE).setPrompt("扫描电脑 DSH 的配对二维码").setBeepEnabled(false).initiateScan());
  Button pair = button("配对并连接"); content.addView(pair);
  status = text(notice,14); content.addView(status);
  int current = generation;
  pair.setOnClickListener(v -> {
   final Pairing request;
   try { request = Pairing.decode(code.getText().toString().trim()); }
   catch (Exception error) { status.setText(error.getMessage()); return; }
   pair.setEnabled(false); status.setText("正在验证电脑并配对…");
   worker.execute(() -> {
    try {
     JSONObject saved = request.pair(android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL);
     runOnUiThread(() -> {
      if (disposed || generation != current) return;
      try { store.save(saved.toString()); code.setText(""); openSavedConnection(new Pairing(saved,"token")); }
      catch (Exception error) { pair.setEnabled(true); status.setText("无法保存授权："+error.getMessage()); }
     });
    } catch (Exception error) { runOnUiThread(() -> { if (!disposed && generation == current) { pair.setEnabled(true); status.setText("连接失败。请确认电脑在线、网络互通和防火墙允许连接。\n"+error.getMessage()); } }); }
   });
  });
 }
 private void openSavedConnection(Pairing pairing) {
  if(!pairing.embedded) {
   if(androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.PROXY_OVERRIDE))androidx.webkit.ProxyController.getInstance().clearProxyOverride(this::runOnUiThread,()->showConnection(pairing));
   else showConnection(pairing);
   return;
  }
  final int current=generation;
  worker.execute(()->{try{
   JSONObject transport=tailnet.command(new JSONObject().put("action","use").put("origin",pairing.origin));int port=transport.getInt("proxyPort");
   runOnUiThread(()->{if(disposed||generation!=current)return;
    if(!androidx.webkit.WebViewFeature.isFeatureSupported(androidx.webkit.WebViewFeature.PROXY_OVERRIDE)){showHome("请先更新 Android System WebView，再打开内置 Tailscale 连接。");return;}
    androidx.webkit.ProxyConfig config=new androidx.webkit.ProxyConfig.Builder().addProxyRule("http://127.0.0.1:"+port).build();
    androidx.webkit.ProxyController.getInstance().setProxyOverride(config,this::runOnUiThread,()->{if(!disposed&&generation==current)showConnection(pairing);});
   });
  }catch(Exception error){runOnUiThread(()->{if(!disposed&&generation==current)showHome("连接未完成："+error.getMessage());});}});
 }
 @android.annotation.SuppressLint("SetJavaScriptEnabled")
 private void showConnection(Pairing pairing) {
  generation++; connected = pairing; pairingInput = null; connectionFailed=false;
  LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(0,dp(8),0,0);
  LinearLayout toolbar = new LinearLayout(this); toolbar.setGravity(android.view.Gravity.CENTER_VERTICAL);
  status = text("正在连接电脑",14); status.setPadding(dp(12),0,0,0); toolbar.addView(status,new LinearLayout.LayoutParams(0,dp(48),1));
  Button annotate = button("批注");toolbar.addView(annotate);annotate.setOnClickListener(v->annotateSelection());
  Button reload = button("重连"); toolbar.addView(reload); Button options = button("设置"); toolbar.addView(options);
  root.addView(toolbar);
  web = new WebView(this); root.addView(web,new LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT,0,1)); installContent(root);
  WebSettings settings = web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
  settings.setAllowFileAccess(false); settings.setAllowContentAccess(false); settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setSupportMultipleWindows(false);
  settings.setUserAgentString(settings.getUserAgentString()+" DSH-Companion/1");
  CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  web.setWebChromeClient(new WebChromeClient() {
   @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
   @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
    if (fileCallback != null) fileCallback.onReceiveValue(null);
    fileCallback = callback;
    Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT); intent.addCategory(Intent.CATEGORY_OPENABLE); intent.setType("*/*"); intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE);
    try { startActivityForResult(intent, FILE_REQUEST); } catch(Exception e) { fileCallback.onReceiveValue(null); fileCallback=null; }
    return true;
   }
  });
  web.setWebViewClient(new WebViewClient() {
   @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
    if (sameOrigin(request.getUrl(), pairing)) return false;
    if (request.isForMainFrame() && request.hasGesture() && ("https".equals(request.getUrl().getScheme()) || "http".equals(request.getUrl().getScheme()))) {
     new AlertDialog.Builder(MainActivity.this).setMessage("在外部浏览器打开此链接？\n"+request.getUrl().getHost()).setPositiveButton("打开", (dialog,which)-> { try { startActivity(new Intent(Intent.ACTION_VIEW,request.getUrl())); } catch(Exception ignored) {} }).setNegativeButton("取消",null).show();
    }
    return true;
   }
   @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
    if (sameOrigin(request.getUrl(), pairing)) return null;
    return new WebResourceResponse("text/plain","UTF-8",403,"Blocked",java.util.Collections.emptyMap(),new ByteArrayInputStream(new byte[0]));
   }
   @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
    // No general certificate exception. A physically paired SHA-256 identity is the trust anchor.
    // Pin match plus certificate validity is mandatory, including on every redirect/subresource.
    boolean accepted = false;
    try {
     Bundle data = SslCertificate.saveState(error.getCertificate()); byte[] der = data.getByteArray("x509-certificate");
     if (der != null && sameOrigin(Uri.parse(error.getUrl()),pairing)) {
      X509Certificate certificate = (X509Certificate)CertificateFactory.getInstance("X.509").generateCertificate(new ByteArrayInputStream(der));
      accepted = pairing.accepts(certificate);
     }
    } catch(Exception ignored) {}
    if (accepted) handler.proceed();
    else { handler.cancel(); status.setText("电脑身份验证失败，请重新配对"); }
   }
   @Override public void onPageFinished(WebView view,String url) { if (sameOrigin(Uri.parse(url),pairing)) {connectionFailed=false;status.setText("已连接电脑");} }
   @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error) { if(request.isForMainFrame()) {connectionFailed=true;status.setText("电脑未连接 · 网络恢复后自动重连");} }
   @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response) { if(response.getStatusCode()==401 || response.getStatusCode()==403) status.setText("授权失效 · 请重新配对"); }
  });
  reload.setOnClickListener(v -> { status.setText("正在重新连接…"); web.reload(); });
  options.setOnClickListener(v -> connectionSettings());
  CookieManager.getInstance().setCookie(pairing.origin,"__Host-dsh-device="+pairing.secret+"; Path=/; Secure; HttpOnly; SameSite=Strict", ok -> {
   if (disposed || web==null || connected!=pairing) return;
   if (!ok) { status.setText("无法保存连接凭据，请重新配对"); return; }
   CookieManager.getInstance().flush(); web.loadUrl(pairing.origin+"/");
  });
 }
 private boolean sameOrigin(Uri uri, Pairing pairing) {
  Uri origin=Uri.parse(pairing.origin);
  return "https".equals(uri.getScheme()) && origin.getHost().equals(uri.getHost()) && normalizedPort(origin)==normalizedPort(uri) && uri.getUserInfo()==null;
 }
 private int normalizedPort(Uri uri) { return uri.getPort()==-1?443:uri.getPort(); }
 private void forget() {
  store.clear();
  if (web!=null) { web.stopLoading(); web.clearCache(true); web.clearHistory(); }
  CookieManager.getInstance().removeAllCookies(null); WebStorage.getInstance().deleteAllData();
  showPairing("本机保存的授权已清除。需要立即撤销所有活动连接时，请在电脑的“手机控制”中移除设备。");
 }
 @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
  IntentResult scan = IntentIntegrator.parseActivityResult(requestCode,resultCode,data);
  if (scan != null) {
   if (scan.getContents() != null && pairingInput != null) {
    try { Pairing.decode(scan.getContents()); pairingInput.setText(scan.getContents()); status.setText("已读取二维码，请点击配对并连接，并在电脑确认授权。"); }
    catch (Exception error) { status.setText("这不是有效的 DSH 配对二维码"); }
   }
   return;
  }
  super.onActivityResult(requestCode,resultCode,data);
  if (requestCode==FILE_REQUEST && fileCallback!=null) { fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode,data)); fileCallback=null; }
 }
 @Override public void onBackPressed() { if (web!=null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
 @Override protected void onDestroy() { disposed=true; generation++;if(tailnet!=null)tailnet.close();tailnetHandler.removeCallbacksAndMessages(null); if(signIn!=null)signIn.close(); if(fileCallback!=null)fileCallback.onReceiveValue(null); if(web!=null)web.destroy(); worker.shutdownNow(); super.onDestroy(); }
}
