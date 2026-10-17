package io.jadegate.dsh.companion;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
public final class AccountProofCheck {
 interface Case {void run() throws Exception;}
 static void reject(Case value)throws Exception{try{value.run();}catch(Exception expected){return;}throw new AssertionError("Accepted invalid callback");}
 public static void main(String[] args)throws Exception{
  AccountProof proof=new AccountProof(54321);
  if(proof.state.length()!=43||proof.verifier.length()!=43||proof.state.equals(proof.verifier))throw new AssertionError("Nonce isolation");
  String challenge=Base64.getUrlEncoder().withoutPadding().encodeToString(MessageDigest.getInstance("SHA-256").digest(proof.verifier.getBytes(StandardCharsets.US_ASCII)));
  if(!challenge.equals(proof.challenge()))throw new AssertionError("PKCE hash");
  String query="/oauth/callback?state="+proof.state+"&code="+URLEncoder.encode("code+value", "UTF-8");
  if(!"code+value".equals(proof.callback(query,"127.0.0.1:54321")))throw new AssertionError("Valid callback");
  reject(()->proof.callback(query,"evil.example"));
  reject(()->proof.callback(query,"127.0.0.1:54322"));
  reject(()->proof.callback(query+"&state="+proof.state,"127.0.0.1:54321"));
  reject(()->proof.callback(query+"&code=other","127.0.0.1:54321"));
  reject(()->proof.callback("/oauth/callback?state=wrong&code=secret","127.0.0.1:54321"));
  reject(()->proof.callback("/other?state="+proof.state+"&code=secret","127.0.0.1:54321"));
  reject(()->proof.callback("https://evil.example"+query,"127.0.0.1:54321"));
  reject(()->proof.callback(query+"#fragment","127.0.0.1:54321"));
  reject(()->proof.callback("/oauth/callback?state="+proof.state+"&code=","127.0.0.1:54321"));
  System.out.println("Account PKCE and 9 callback rejection cases passed.");
 }
}
