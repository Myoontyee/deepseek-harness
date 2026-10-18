package io.jadegate.dsh.companion;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.json.*;
import static org.junit.Assert.*;
@RunWith(AndroidJUnit4.class)
public final class PhoneChatStoreTest {
 @Test public void restartRetainsDraftsPartialRepliesAndAccountIsolation() throws Exception {
  android.content.Context context=InstrumentationRegistry.getInstrumentation().getTargetContext();
  String account="fixture:"+java.util.UUID.randomUUID(),other=account+":other",id;
  try(PhoneChatStore store=new PhoneChatStore(context)){
   JSONObject chat=store.create(account);id=chat.getString("id");chat.put("draft","unsent").put("annotationDraft",new JSONObject().put("quote","$x$").put("comment","long remark"));
   chat.getJSONArray("messages").put(new JSONObject().put("role","assistant").put("text","partial").put("status","generating"));store.save(account,chat);assertEquals(0,store.list(other).length());
  }
  try(PhoneChatStore store=new PhoneChatStore(context)){
   JSONObject restored=store.read(account,id);assertEquals("unsent",restored.getString("draft"));assertEquals("long remark",restored.getJSONObject("annotationDraft").getString("comment"));assertEquals("partial",restored.getJSONArray("messages").getJSONObject(0).getString("text"));
   try{store.read(other,id);fail("cross-account read");}catch(java.io.IOException expected){}
   long revision=restored.getLong("updated");restored.put("deleted",true);store.save(account,restored);assertEquals(0,store.list(account).length());assertTrue(store.changes(account,revision).getJSONObject(0).getBoolean("deleted"));
  }
 }
}
