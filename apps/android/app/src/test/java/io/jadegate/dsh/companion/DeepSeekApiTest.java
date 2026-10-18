package io.jadegate.dsh.companion;
import org.junit.Test;
import static org.junit.Assert.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import org.json.*;

public class DeepSeekApiTest {
 static InputStream bytes(String value){return new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8));}
 static String event(String value){return "event: ignored\ndata: "+value+"\n\n";}
 @Test public void fragmentedStreamRetainsReasoningSignatureAndUsage() throws Exception {
  String stream=event("{\"type\":\"message_start\",\"message\":{\"usage\":{\"input_tokens\":12}}}")
   +event("{\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"thinking\",\"thinking\":\"\"}}")
   +event("{\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"thinking_delta\",\"thinking\":\"思考\"}}")
   +event("{\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"signature_delta\",\"signature\":\"proof\"}}")
   +event("{\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}")
   +event("{\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"text_delta\",\"text\":\"你好 $x$\"}}")
   +event("{\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"max_tokens\"},\"usage\":{\"output_tokens\":8}}")
   +"data: {\"type\":\"message_stop\"}";
  InputStream fragmented=new FilterInputStream(bytes(stream)){@Override public int read(byte[]b,int off,int len)throws IOException{return super.read(b,off,Math.min(1,len));}};
  String[] latest={"",""};DeepSeekApi.Reply reply=DeepSeekApi.decode(fragmented,(blocks,text,thinking)->{latest[0]=text;latest[1]=thinking;},()->false);
  assertEquals("你好 $x$",latest[0]);assertEquals("思考",latest[1]);assertEquals("proof",reply.blocks.getJSONObject(0).getString("signature"));assertEquals(12,reply.usage.getInt("input_tokens"));assertEquals(8,reply.usage.getInt("output_tokens"));assertEquals("max_tokens",reply.stopReason);
 }
 @Test public void incompleteOrCancelledStreamsDoNotBecomeComplete() throws Exception {
  try{DeepSeekApi.decode(bytes(event("{\"type\":\"ping\"}")),(a,b,c)->{},()->false);fail();}catch(DeepSeekApi.Failure expected){assertEquals("INTERRUPTED",expected.code);}
  try{DeepSeekApi.decode(bytes(""),(a,b,c)->{},()->true);fail();}catch(DeepSeekApi.Failure expected){assertEquals("CANCELLED",expected.code);}
 }
 @Test public void replayIsModelScopedAndAnnotationsAreInTheLoggedUserText() throws Exception {
  JSONArray history=new JSONArray().put(new JSONObject().put("role","user").put("text","> selected\n\nmy note"))
   .put(new JSONObject().put("role","assistant").put("text","answer").put("status","complete").put("model","a").put("blocks",new JSONArray("[{\"type\":\"thinking\",\"thinking\":\"private replay\",\"signature\":\"s\"},{\"type\":\"text\",\"text\":\"answer\"}]")));
  JSONObject same=DeepSeekApi.request("a","high",100,history),other=DeepSeekApi.request("b","off",100,history);
  assertEquals("s",same.getJSONArray("messages").getJSONObject(1).getJSONArray("content").getJSONObject(0).getString("signature"));
  assertEquals(1,other.getJSONArray("messages").getJSONObject(1).getJSONArray("content").length());assertFalse(other.has("output_config"));assertTrue(other.toString().contains("my note"));
 }
 @Test public void versionGatesRespectReleaseAndPrereleaseOrdering(){assertTrue(DeepSeekApi.versionAtLeast("0.2.1-rc.2","0.2.1-rc.1"));assertFalse(DeepSeekApi.versionAtLeast("0.2.1-rc.2","0.2.1"));assertFalse(DeepSeekApi.versionAtLeast("0.2.1-rc.2","0.2.1-rc.10"));assertFalse(DeepSeekApi.versionAtLeast("0.2.1-rc.2","invalid"));}
 static final class Fake extends HttpURLConnection {
  final int status;final String body;boolean disconnected;final ByteArrayOutputStream written=new ByteArrayOutputStream();
  Fake(URL url,int status,String body){super(url);this.status=status;this.body=body;}
  @Override public int getResponseCode(){return status;}@Override public InputStream getInputStream(){return bytes(body);}@Override public OutputStream getOutputStream(){return written;}@Override public void disconnect(){disconnected=true;}@Override public boolean usingProxy(){return false;}@Override public void connect(){}
 }
 @Test public void modelsUseOfficialGrantAndDoNotFollowRedirects() throws Exception {
  Fake[] connection={null};try(DeepSeekApi api=new DeepSeekApi("0.2.1-rc.2","fixture",url->{assertEquals("https://api.deepseek.com/models",url.toString());return connection[0]=new Fake(url,302,"");})){
   try{api.models("test-grant");fail();}catch(DeepSeekApi.Failure expected){assertEquals("REDIRECT",expected.code);}
  }assertEquals("test-grant",connection[0].getRequestProperty("x-dsh-auth-token"));assertFalse(connection[0].getInstanceFollowRedirects());assertTrue(connection[0].disconnected);
 }
 @Test public void unsupportedAndFutureModelsCannotBeSelected() throws Exception {
  String listing="{\"data\":[{\"id\":\"a\",\"api_capabilities\":{\"anthropic_messages\":{}},\"client_requirements\":{\"deepseek-harness\":{\"min_version\":\"0.2.2\"}}},{\"id\":\"b\",\"api_capabilities\":{\"anthropic_messages\":{}}},{\"id\":\"unsupported\"}]}";
  try(DeepSeekApi api=new DeepSeekApi("0.2.1-rc.2","fixture",url->new Fake(url,200,listing))){JSONArray models=api.models("test-grant");assertEquals(2,models.length());assertFalse(models.getJSONObject(0).getBoolean("available"));assertTrue(models.getJSONObject(1).getBoolean("available"));}
 }
}
