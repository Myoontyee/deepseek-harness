package io.jadegate.dsh.companion;

import android.content.Context;
import android.content.Intent;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public final class SelectionSmokeTest {
 @Test public void nativeLongPressRetainsTheQuotationInTheCommentEditor() throws Exception {
  Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  SecureStore account=new SecureStore(context,"account");String previous=account.read();
  DeepSeekApi.Connections previousConnections=PhoneChatScreen.testConnections;
  String scope="native-selection-"+java.util.UUID.randomUUID();
  String quotation="这段原文用于验证手机长按添加批注";
  try {
   account.save(new JSONObject().put("issuer","https://platform.deepseek.com").put("token","isolated-selection-fixture").put("accountId",scope).toString());
   try(PhoneChatStore chats=new PhoneChatStore(context)){
    JSONObject chat=chats.create("account:"+scope);
    chat.getJSONArray("messages").put(new JSONObject().put("role","assistant").put("text",quotation).put("status","complete"));chats.save("account:"+scope,chat);
   }
   PhoneChatScreen.testConnections=url->new TailnetSmokeTest.DeepSeekApiTestConnection(url);
   context.startActivity(new Intent(context,MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_CLEAR_TASK));
   UiDevice device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
   UiObject2 text=device.wait(Until.findObject(By.text(quotation)),15000);assertNotNull("The fixture quotation must render",text);text.longClick();
   UiObject2 annotate=device.wait(Until.findObject(By.text("添加批注")),5000);assertNotNull("Android selection menu must offer Add annotation",annotate);annotate.click();
   assertTrue("The inline comment editor must open",device.wait(Until.hasObject(By.desc("批注评论")),5000));
   assertTrue("Original text must remain beside the comment field",device.hasObject(By.text(quotation)));
  }finally{
   InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
    for(Stage stage:Stage.values())for(android.app.Activity activity:new java.util.ArrayList<>(ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(stage)))if(activity instanceof MainActivity)activity.finish();
   });
   PhoneChatScreen.testConnections=previousConnections;if(previous==null)account.clear();else account.save(previous);
  }
 }
}
