package io.jadegate.dsh.companion;

import android.util.Base64;
import org.json.JSONObject;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.cert.X509Certificate;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

final class Pairing {
 final String origin;
 final String pin;
 final String secret;
 Pairing(JSONObject json, String field) throws Exception {
  URI uri = new URI(json.getString("url"));
  if (!"https".equals(uri.getScheme()) || uri.getHost() == null || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null || !(uri.getPath().isEmpty() || uri.getPath().equals("/"))) throw new Exception("连接地址必须是电脑生成的 HTTPS 地址");
  origin = uri.getScheme() + "://" + uri.getRawAuthority();
  pin = json.getString("pin").toLowerCase(java.util.Locale.ROOT);
  secret = json.getString(field);
  if (!pin.matches("[0-9a-f]{64}") || !secret.matches("[A-Za-z0-9_-]{43}")) throw new Exception("配对资料不完整，请重新从电脑复制");
 }
 static Pairing decode(String code) throws Exception {
  if (!code.startsWith("dsh-pair-v1:")) throw new Exception("请粘贴电脑 DSH 的完整配对码");
  if (code.length() > 4096) throw new Exception("配对码过长");
  return new Pairing(new JSONObject(new String(Base64.decode(code.substring(12), Base64.URL_SAFE | Base64.NO_WRAP | Base64.NO_PADDING), StandardCharsets.UTF_8)), "code");
 }
 static String fingerprint(X509Certificate cert) throws Exception {
  StringBuilder result = new StringBuilder();
  for (byte b : MessageDigest.getInstance("SHA-256").digest(cert.getEncoded())) result.append(String.format(java.util.Locale.ROOT, "%02x", b & 255));
  return result.toString();
 }
 boolean accepts(X509Certificate cert) {
  try { cert.checkValidity(); return MessageDigest.isEqual(pin.getBytes(StandardCharsets.US_ASCII), fingerprint(cert).getBytes(StandardCharsets.US_ASCII)); }
  catch (Exception error) { return false; }
 }
 JSONObject pair(String label) throws Exception {
  SSLContext tls = SSLContext.getInstance("TLS");
  tls.init(null, new TrustManager[]{new X509TrustManager() {
   public X509Certificate[] getAcceptedIssuers() { return new X509Certificate[0]; }
   public void checkClientTrusted(X509Certificate[] chain, String kind) throws java.security.cert.CertificateException { throw new java.security.cert.CertificateException("client certificates unsupported"); }
   public void checkServerTrusted(X509Certificate[] chain, String kind) throws java.security.cert.CertificateException {
    if (chain.length == 0 || !accepts(chain[0])) throw new java.security.cert.CertificateException("电脑证书已改变，请重新配对");
   }
  }}, null);
  HttpsURLConnection connection = (HttpsURLConnection) new URL(origin + "/_dsh_mobile/pair").openConnection();
  connection.setSSLSocketFactory(tls.getSocketFactory());
  connection.setHostnameVerifier((name, session) -> { try { return name.equals(new URI(origin).getHost()) && accepts((X509Certificate)session.getPeerCertificates()[0]); } catch(Exception e) { return false; } });
  connection.setConnectTimeout(15000); connection.setReadTimeout(20000); connection.setInstanceFollowRedirects(false);
  connection.setRequestMethod("POST"); connection.setDoOutput(true); connection.setRequestProperty("Content-Type", "application/json");
  byte[] body = new JSONObject().put("code", secret).put("label", label).toString().getBytes(StandardCharsets.UTF_8);
  connection.setFixedLengthStreamingMode(body.length);
  try {
   try (java.io.OutputStream out = connection.getOutputStream()) { out.write(body); }
   if (connection.getResponseCode() != 200) throw new Exception("配对码已过期、已使用或电脑拒绝了配对，请在电脑重新生成");
   byte[] bytes;
   try (java.io.InputStream in = connection.getInputStream()) { java.io.ByteArrayOutputStream out = new java.io.ByteArrayOutputStream(); byte[] chunk = new byte[1024]; int count; while ((count = in.read(chunk)) != -1) { out.write(chunk, 0, count); if (out.size() > 8192) break; } bytes = out.toByteArray(); }
   if (bytes.length > 8192) throw new Exception("电脑响应过长");
   JSONObject response = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
   JSONObject saved = new JSONObject().put("url", origin).put("pin", pin).put("token", response.getString("token"));
   new Pairing(saved, "token"); return saved;
  } finally { connection.disconnect(); }
 }
}
