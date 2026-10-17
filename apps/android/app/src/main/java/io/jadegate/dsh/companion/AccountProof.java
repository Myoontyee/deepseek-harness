package io.jadegate.dsh.companion;

import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HashMap;
import java.util.Map;

/** PKCE proof and one loopback callback; no browser cookie or password enters the application. */
final class AccountProof {
 final String verifier = nonce();
 final String state = nonce();
 final String redirect;
 AccountProof(int port) { redirect = "http://127.0.0.1:" + port + "/oauth/callback"; }
 static String nonce() {
  byte[] value = new byte[32]; new SecureRandom().nextBytes(value);
  return Base64.getUrlEncoder().withoutPadding().encodeToString(value);
 }
 String challenge() throws Exception {
  return Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
 }
 String callback(String target, String host) throws Exception {
  URI expected = new URI(redirect);
  if (!expected.getRawAuthority().equals(host)) throw new Exception("Invalid callback host");
  URI uri = new URI(target);
  if (uri.isAbsolute() || uri.getRawAuthority() != null || uri.getFragment() != null || !"/oauth/callback".equals(uri.getPath())) throw new Exception("Invalid callback path");
  Map<String,String> params = new HashMap<>();
  for (String part : (uri.getRawQuery() == null ? "" : uri.getRawQuery()).split("&")) {
   String[] pair = part.split("=", 2);
   String key = URLDecoder.decode(pair[0], "UTF-8");
   if (params.containsKey(key)) throw new Exception("Duplicate callback parameter");
   params.put(key, pair.length == 2 ? URLDecoder.decode(pair[1], "UTF-8") : "");
  }
  String received = params.get("state"), code = params.get("code");
  if (received == null || !MessageDigest.isEqual(state.getBytes(StandardCharsets.UTF_8), received.getBytes(StandardCharsets.UTF_8)) || code == null || code.isEmpty() || code.length() > 4096) throw new Exception("Invalid callback proof");
  return code;
 }
}
