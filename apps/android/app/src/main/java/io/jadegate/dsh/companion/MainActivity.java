package io.jadegate.dsh.companion;

import android.app.Activity;
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
 private WebView web;
 private Pairing connected;
 private TextView status;
 private boolean disposed;
 private int generation;
 private ValueCallback<Uri[]> fileCallback;
 private static final int FILE_REQUEST = 41;

 @Override public void onCreate(Bundle state) {
  super.onCreate(state);
  getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_ADJUST_RESIZE);
  store = new SecureStore(this);
  try {
   String saved = store.read();
   if (saved != null) { showConnection(new Pairing(new JSONObject(saved), "token")); return; }
  } catch (Exception error) { store.clear(); }
  showPairing("");
 }
 private void installContent(View view) {
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
  content.addView(text("连接电脑上的 DSH", 26));
  TextView instructions = text("电脑和 DSH 需要保持运行。\n在电脑的“应用 → 手机控制”生成配对码，粘贴到这里。手机可以查看对话、发送任务并处理确认。\n\n同一 Wi-Fi 或已连通的私有网络均可；请勿把配对码发给其他人。",16);
  instructions.setPadding(0,dp(18),0,dp(18)); content.addView(instructions);
  EditText code = new EditText(this); code.setHint("粘贴电脑生成的配对码"); code.setMinLines(3); code.setMaxLines(6); code.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE | android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS); content.addView(code);
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
      try { store.save(saved.toString()); code.setText(""); showConnection(new Pairing(saved,"token")); }
      catch (Exception error) { pair.setEnabled(true); status.setText("无法保存授权："+error.getMessage()); }
     });
    } catch (Exception error) { runOnUiThread(() -> { if (!disposed && generation == current) { pair.setEnabled(true); status.setText("连接失败。请确认电脑在线、网络互通和防火墙允许连接。\n"+error.getMessage()); } }); }
   });
  });
 }
 @android.annotation.SuppressLint("SetJavaScriptEnabled")
 private void showConnection(Pairing pairing) {
  generation++; connected = pairing;
  LinearLayout root = new LinearLayout(this); root.setOrientation(LinearLayout.VERTICAL); root.setPadding(0,dp(8),0,0);
  LinearLayout toolbar = new LinearLayout(this); toolbar.setGravity(android.view.Gravity.CENTER_VERTICAL);
  status = text("DSH · 正在连接电脑",14); status.setPadding(dp(12),0,0,0); toolbar.addView(status,new LinearLayout.LayoutParams(0,dp(48),1));
  Button reload = button("重连"); toolbar.addView(reload); Button options = button("⋮"); toolbar.addView(options);
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
   @Override public void onPageFinished(WebView view,String url) { if (sameOrigin(Uri.parse(url),pairing)) status.setText("DSH · 已连接"); }
   @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error) { if(request.isForMainFrame()) status.setText("电脑未连接 · 点击重连"); }
   @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response) { if(response.getStatusCode()==401 || response.getStatusCode()==403) status.setText("授权失效 · 请重新配对"); }
  });
  reload.setOnClickListener(v -> { status.setText("正在重新连接…"); web.reload(); });
  options.setOnClickListener(v -> new AlertDialog.Builder(this).setTitle("电脑连接").setMessage(pairing.origin+"\n\n电脑和 DSH 需要保持运行。离开手机后，已提交的任务继续在电脑执行。当前版本不提供后台推送通知。").setPositiveButton("保留连接",null).setNeutralButton("清除此手机的连接",(dialog,which)->forget()).show());
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
  super.onActivityResult(requestCode,resultCode,data);
  if (requestCode==FILE_REQUEST && fileCallback!=null) { fileCallback.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode,data)); fileCallback=null; }
 }
 @Override public void onBackPressed() { if (web!=null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
 @Override protected void onDestroy() { disposed=true; generation++; if(fileCallback!=null)fileCallback.onReceiveValue(null); if(web!=null)web.destroy(); worker.shutdownNow(); super.onDestroy(); }
}
