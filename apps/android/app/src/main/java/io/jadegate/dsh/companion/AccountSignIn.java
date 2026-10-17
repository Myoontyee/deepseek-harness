package io.jadegate.dsh.companion;

import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.TimeZone;
import javax.net.ssl.HttpsURLConnection;

/** The desktop provider's public Platform PKCE flow, carried by the system browser on Android. */
final class AccountSignIn implements AutoCloseable {
 interface Browser { void open(String url); }
 private static final String ORIGIN = "https://platform.deepseek.com";
 private volatile boolean closed;
 private volatile ServerSocket callback;
 private volatile HttpsURLConnection request;
 private final String version;
 AccountSignIn(String version) { this.version = version; }
 JSONObject login(Browser browser, String deviceId) throws Exception {
  try (ServerSocket server = new ServerSocket(0, 4, InetAddress.getByName("127.0.0.1"))) {
   callback = server; server.setSoTimeout(1000);
   AccountProof proof = new AccountProof(server.getLocalPort());
   JSONObject init = json("/auth-api/v0/dsh/auth_init", new JSONObject().put("code_challenge", proof.challenge()).put("code_challenge_method", "S256").put("state", proof.state).put("redirect_uri", proof.redirect).put("locale", "zh_CN").put("login_source", "web"), null);
   URI authorize = new URI(init.getString("authorize_url"));
   if (!ORIGIN.equals(authorize.getScheme()+"://"+authorize.getRawAuthority()) || !"/dsh/authorize".equals(authorize.getPath()) || authorize.getFragment()!=null || authorize.getUserInfo()!=null) throw new IOException("官方授权地址无效");
   double lifetime = init.getDouble("expires_in");
   if (!Double.isFinite(lifetime) || lifetime <= 0) throw new IOException("官方授权已过期");
   long deadline = System.currentTimeMillis() + (long)Math.min(300000, lifetime * 1000);
   if (closed) throw new IOException("登录已取消");
   browser.open(authorize.toString());
   String code = null;
   while (!closed && System.currentTimeMillis() < deadline && code == null) {
    try (Socket socket = server.accept()) {
     socket.setSoTimeout(3000);
     BufferedReader in = new BufferedReader(new InputStreamReader(new BoundedInputStream(socket.getInputStream(),8192),StandardCharsets.US_ASCII));
     String first=in.readLine(), host=null, line; int lines=0;
     while ((line=in.readLine())!=null && !line.isEmpty()) {
      if (++lines>32) throw new IOException("Invalid callback headers");
      if (line.regionMatches(true,0,"Host:",0,5)) { if(host!=null) throw new IOException("Duplicate host"); host=line.substring(5).trim(); }
     }
     try {
      String[] parts=first==null?new String[0]:first.split(" ");
      if(parts.length!=3 || !"GET".equals(parts[0])) throw new IOException("Invalid callback request");
      code=proof.callback(parts[1],host);
      reply(socket,200,"授权已收到，请返回 DSH 手机端。连接电脑仍需要电脑端确认授权。");
     } catch(Exception invalid) { reply(socket,400,"无效的登录回调，请返回 DSH 重试。"); }
    } catch(SocketTimeoutException polling) { /* Bound the wait by the authorization deadline. */ }
   }
   if(closed || code==null) throw new IOException(closed?"登录已取消":"登录已超时，请重新登录");
   JSONObject result=json("/auth-api/v0/dsh/auth_exchange",new JSONObject().put("code",code).put("code_verifier",proof.verifier).put("redirect_uri",proof.redirect).put("device_id",deviceId).put("device_model","Android "+android.os.Build.MODEL).put("os_version","Android "+android.os.Build.VERSION.RELEASE),null);
   String token=result.getString("token");
   if(!token.matches("[\\x21-\\x7e]+")) throw new IOException("官方未返回有效登录凭据");
   if(closed) throw new IOException("登录已取消");
   return new JSONObject().put("token",token).put("issuer",ORIGIN).put("deviceId",deviceId);
  } finally { callback=null; }
 }
 void logout(String token) throws Exception { json("/auth-api/v0/users/logout",new JSONObject(),token); }
 private JSONObject json(String path, JSONObject body, String token) throws Exception {
  if(closed) throw new IOException("登录已取消");
  HttpsURLConnection connection=(HttpsURLConnection)new URL(ORIGIN+path).openConnection(); request=connection;
  connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(20000);
  connection.setRequestProperty("Content-Type","application/json"); connection.setRequestProperty("x-client-bundle-id","");
  connection.setRequestProperty("x-client-platform","web"); connection.setRequestProperty("x-client-version",version);
  connection.setRequestProperty("x-client-locale","zh_CN"); connection.setRequestProperty("x-client-timezone-offset",String.valueOf(TimeZone.getDefault().getOffset(System.currentTimeMillis())/1000));
  if(token!=null) connection.setRequestProperty("x-dsh-auth-token",token);
  connection.setRequestMethod("POST"); connection.setDoOutput(true);
  byte[] bytes=body.toString().getBytes(StandardCharsets.UTF_8); connection.setFixedLengthStreamingMode(bytes.length);
  try {
   try(OutputStream out=connection.getOutputStream()) { out.write(bytes); }
   int status=connection.getResponseCode();
   if(status==429) throw new IOException("官方登录请求暂被限流，请稍后重试");
   if(status!=200) throw new IOException("官方登录服务请求失败（"+status+"），请稍后重试");
   ByteArrayOutputStream data=new ByteArrayOutputStream();
   try(InputStream in=new BoundedInputStream(connection.getInputStream(),65536)) { byte[] chunk=new byte[4096]; int n; while((n=in.read(chunk))!=-1) data.write(chunk,0,n); }
   JSONObject envelope=new JSONObject(data.toString("UTF-8")); JSONObject result=envelope.optJSONObject("data");
   if(envelope.optInt("code",-1)!=0 || result==null || result.optInt("biz_code",-1)!=0) throw new IOException("官方未批准此次登录，请重新登录");
   Object payload=result.opt("biz_data");
   return payload instanceof JSONObject?(JSONObject)payload:new JSONObject();
  } finally { connection.disconnect(); if(request==connection)request=null; }
 }
 private static void reply(Socket socket,int status,String message) throws IOException {
  byte[] body=message.getBytes(StandardCharsets.UTF_8);
  OutputStream out=socket.getOutputStream();
  out.write(("HTTP/1.1 "+status+" "+(status==200?"OK":"Bad Request")+"\r\nContent-Type: text/plain; charset=utf-8\r\nCache-Control: no-store\r\nReferrer-Policy: no-referrer\r\nConnection: close\r\nContent-Length: "+body.length+"\r\n\r\n").getBytes(StandardCharsets.US_ASCII)); out.write(body); out.flush();
 }
 @Override public void close() {
  closed=true; HttpsURLConnection current=request; if(current!=null)current.disconnect();
  ServerSocket server=callback; if(server!=null)try{server.close();}catch(IOException error){ /* Already closing. */ }
 }
 private static final class BoundedInputStream extends FilterInputStream {
  private int remaining;
  BoundedInputStream(InputStream input,int limit){super(input);remaining=limit;}
  @Override public int read() throws IOException { int value=super.read();if(value!=-1 && --remaining<0)throw new IOException("Response too large");return value; }
  @Override public int read(byte[] bytes,int offset,int length) throws IOException { int count=in.read(bytes,offset,Math.min(length,remaining+1)); if(count>0 && (remaining-=count)<0)throw new IOException("Response too large");return count; }
 }
}
