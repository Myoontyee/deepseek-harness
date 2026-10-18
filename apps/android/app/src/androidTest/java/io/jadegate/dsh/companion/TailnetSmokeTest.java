package io.jadegate.dsh.companion;

import android.content.Context;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.Until;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.JSONObject;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class TailnetSmokeTest {
 @Test public void embeddedNodeStartsAndRequestsOfficialLogin() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  try(TailnetClient client=new TailnetClient(context)) {
   assertTrue(client.command("status").getBoolean("ok"));
   client.command("login");
   boolean ready=false;
   for(int i=0;i<20;i++){JSONObject status=client.command("status");String url=status.optString("authUrl");if(url.startsWith("https://login.tailscale.com/")){ready=true;break;}Thread.sleep(1000);}
   assertTrue("Embedded node must provide a real official login URL under the Android app UID",ready);
  }
 }
 @Test public void homeChatsWithoutPairingAndConnectionRemainsInSettings() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  new SecureStore(context,"account").save(new JSONObject().put("issuer","https://platform.deepseek.com").put("token","isolated-ui-fixture").put("accountId","isolated-ui-fixture-account").toString());
  PhoneChatScreen.testConnections=url->new DeepSeekApiTestConnection(url);
  Intent intent=new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK);context.startActivity(intent);
  UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
  assertTrue(device.wait(Until.hasObject(By.text("DeepSeek Harness Desktop")),15000));
  assertTrue(device.wait(Until.hasObject(By.textContains("你好，今天想聊些什么")),15000));
  assertFalse(device.hasObject(By.text("登录 Tailscale，自动发现设备")));
  device.findObject(By.desc("设置")).click();
  assertTrue(device.wait(Until.hasObject(By.text("登录 Tailscale，自动发现设备")),15000));
  assertTrue(device.takeScreenshot(new java.io.File(context.getCacheDir(),"tailnet-home.png")));
 }
 static final class DeepSeekApiTestConnection extends java.net.HttpURLConnection {
  DeepSeekApiTestConnection(java.net.URL url){super(url);}
  @Override public int getResponseCode(){return 200;}
  @Override public java.io.InputStream getInputStream(){return new java.io.ByteArrayInputStream("{\"data\":[{\"id\":\"fixture\",\"api_capabilities\":{\"anthropic_messages\":{}}}]}".getBytes(java.nio.charset.StandardCharsets.UTF_8));}
  @Override public void connect(){}@Override public void disconnect(){}@Override public boolean usingProxy(){return false;}
 }
}
