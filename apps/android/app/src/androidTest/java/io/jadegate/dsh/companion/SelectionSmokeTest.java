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
   JSONObject state=pageState();
   assertTrue("The inline comment editor must open: "+state,state.getBoolean("open"));
   String selected=state.getString("quote").trim();
   assertTrue("Android's selected word must remain beside the comment field: "+state,!selected.isEmpty()&&quotation.contains(selected));
  }finally{
   InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
    for(Stage stage:Stage.values())for(android.app.Activity activity:new java.util.ArrayList<>(ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(stage)))if(activity instanceof MainActivity)activity.finish();
   });
   PhoneChatScreen.testConnections=previousConnections;if(previous==null)account.clear();else account.save(previous);
  }
 }
 private static JSONObject pageState() throws Exception {
  java.util.concurrent.CountDownLatch done=new java.util.concurrent.CountDownLatch(1);
  java.util.concurrent.atomic.AtomicReference<String> result=new java.util.concurrent.atomic.AtomicReference<>();
  InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{
   for(android.app.Activity activity:ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED)){
    android.webkit.WebView view=findWeb(activity.findViewById(android.R.id.content));if(view==null)continue;
    view.evaluateJavascript("JSON.stringify({open:document.querySelector('#annotation')?.open===true,quote:document.querySelector('#quote')?.textContent||'',helper:typeof window.dshNativeAnnotate})",value->{result.set(value);done.countDown();});return;
   }
   done.countDown();
  });
  assertTrue("WebView must respond after the native menu action",done.await(5,java.util.concurrent.TimeUnit.SECONDS));
  assertNotNull("The foreground Activity must contain its chat WebView",result.get());
  return new JSONObject((String)new org.json.JSONTokener(result.get()).nextValue());
 }
 private static android.webkit.WebView findWeb(android.view.View root){
  if(root instanceof android.webkit.WebView)return (android.webkit.WebView)root;
  if(root instanceof android.view.ViewGroup){android.view.ViewGroup group=(android.view.ViewGroup)root;for(int i=0;i<group.getChildCount();i++){android.webkit.WebView view=findWeb(group.getChildAt(i));if(view!=null)return view;}}
  return null;
 }
}
