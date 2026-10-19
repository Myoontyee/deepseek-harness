package io.jadegate.dsh.companion;

import org.json.JSONObject;

/** The screen a cold start restores: a paired computer conversation or the phone chat. */
final class LastView {
 /** Paired-computer page marker. */
 static final String REMOTE="remote";
 /** Local phone chat marker. */
 static final String PHONE="phone";
 private LastView() {}
 /** @param device Paired-computer grant key; "saved" names the legacy single grant. @param session Optional computer Session id. @return Stored remote-view record. */
 static JSONObject remote(String device,String session) throws org.json.JSONException {
  return new JSONObject().put("kind",REMOTE).put("device",device).put("session",session);
 }
 /** @return Stored phone-chat record. */
 static JSONObject phone() throws org.json.JSONException {
  return new JSONObject().put("kind",PHONE);
 }
 /** @param value Raw preference text. @return Parsed record, or null when the text is absent, oversized or not a known view. */
 static JSONObject parse(String value) {
  if(value==null||value.isEmpty()||value.length()>4096)return null;
  try {
   JSONObject view=new JSONObject(value);String kind=view.optString("kind");
   if(!REMOTE.equals(kind)&&!PHONE.equals(kind))return null;
   if(view.optString("device","").length()>200||view.optString("session","").length()>512)return null;
   return view;
  } catch(Exception invalid) { return null; }
 }
 /** @param view Parsed record. @return Whether it names a paired-computer page. */
 static boolean isRemote(JSONObject view) { return view!=null&&REMOTE.equals(view.optString("kind")); }
 /** @param view Parsed record. @return Paired-computer grant key, empty when unknown. */
 static String device(JSONObject view) { return view==null?"":view.optString("device",""); }
 /** @param view Parsed record. @return Computer Session id, empty when the page had none. */
 static String session(JSONObject view) { return view==null?"":view.optString("session",""); }
}
