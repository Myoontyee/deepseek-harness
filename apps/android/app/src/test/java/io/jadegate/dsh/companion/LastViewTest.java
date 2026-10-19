package io.jadegate.dsh.companion;

import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

/** Cold-start preference records must round-trip and reject anything a relaunch cannot open. */
public final class LastViewTest {
 @Test public void remoteRecordKeepsGrantAndSession() throws Exception {
  JSONObject view=LastView.parse(LastView.remote("node-1","session-a").toString());
  assertTrue(LastView.isRemote(view));
  assertEquals("node-1",LastView.device(view));
  assertEquals("session-a",LastView.session(view));
 }
 @Test public void phoneRecordParsesAsPhone() throws Exception {
  JSONObject view=LastView.parse(LastView.phone().toString());
  assertNotNull(view);
  assertEquals(LastView.PHONE,view.getString("kind"));
  assertEquals("",LastView.device(view));
  assertEquals("",LastView.session(view));
  assertFalse(LastView.isRemote(view));
 }
 @Test public void acceptedLengthLimitsStillParse() throws Exception {
  JSONObject view=LastView.parse(new JSONObject().put("kind","remote").put("device","x".repeat(200)).put("session","y".repeat(512)).toString());
  assertNotNull(view);
  assertEquals(200,LastView.device(view).length());
  assertEquals(512,LastView.session(view).length());
 }
 @Test public void malformedOrOversizedRecordsAreIgnored() {
  assertNull(LastView.parse(null));
  assertNull(LastView.parse(""));
  assertNull(LastView.parse("not json"));
  assertNull(LastView.parse("{\"kind\":\"elsewhere\"}"));
  assertNull(LastView.parse("{\"kind\":\"remote\",\"device\":\""+"x".repeat(201)+"\"}"));
  assertNull(LastView.parse("{\"kind\":\"remote\",\"session\":\""+"x".repeat(513)+"\"}"));
  assertNull(LastView.parse("x".repeat(4097)));
 }
 @Test public void missingFieldsStayEmpty() {
  JSONObject view=LastView.parse("{\"kind\":\"remote\"}");
  assertTrue(LastView.isRemote(view));
  assertEquals("",LastView.device(view));
  assertEquals("",LastView.session(view));
 }
}
