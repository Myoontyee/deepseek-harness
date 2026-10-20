package io.jadegate.dsh.companion;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import static org.junit.Assert.assertEquals;

/** Remote conversations keep their workspace identity even when only a directory is known. */
public final class RemoteCatalogTest {
 private static JSONObject envelope(JSONObject value)throws Exception{return new JSONObject().put("result",new JSONObject().put("ok",true).put("value",value));}
 private static JSONObject session(String id,String title,String cwd)throws Exception{return new JSONObject().put("sessionId",id).put("cwd",cwd).put("projections",new JSONObject().put("values",new JSONObject().put("title",title)));}
 @Test public void groupsRegisteredWorkspaceAndDirectoryFallback() throws Exception {
  JSONObject sessions=envelope(new JSONObject().put("items",new JSONArray()
   .put(session("a","注册对话","E:\\work\\alpha"))
   .put(session("b","目录对话","F:\\scratch\\beta"))));
  JSONObject workspaces=envelope(new JSONObject().put("items",new JSONArray().put(new JSONObject().put("workspaceId","workspace-a").put("title","Alpha").put("path","E:\\work\\alpha").put("sessionIds",new JSONArray().put("a")))));
  JSONArray rows=RemoteCatalog.rows(sessions,workspaces);
  assertEquals(2,rows.length());
  assertEquals("workspace-a",rows.getJSONObject(0).getString("workspaceId"));
  assertEquals("Alpha",rows.getJSONObject(0).getString("workspaceTitle"));
  assertEquals("directory:f:/scratch/beta",rows.getJSONObject(1).getString("workspaceId"));
  assertEquals("beta",rows.getJSONObject(1).getString("workspaceTitle"));
 }
 @Test public void directoryFallbackIsStableOnWindowsCaseAndTrailingSlash() throws Exception {
  JSONObject sessions=envelope(new JSONObject().put("items",new JSONArray().put(session("a","对话","e:\\WORK\\alpha\\"))));
  JSONObject workspaces=envelope(new JSONObject().put("items",new JSONArray().put(new JSONObject().put("workspaceId","workspace-a").put("title","Alpha").put("path","E:\\work\\alpha").put("sessionIds",new JSONArray()))));
  JSONArray rows=RemoteCatalog.rows(sessions,workspaces);
  assertEquals("workspace-a",rows.getJSONObject(0).getString("workspaceId"));
  assertEquals("Alpha",rows.getJSONObject(0).getString("workspaceTitle"));
 }
 @Test public void skipsBlankSubagentAndBoundsRows() throws Exception {
  JSONArray items=new JSONArray().put(new JSONObject().put("sessionId","blank").put("blank",true)).put(new JSONObject().put("sessionId","child").put("origin",new JSONObject().put("kind","subagent"))).put(session("keep","保留","E:\\work"));
  JSONArray rows=RemoteCatalog.rows(envelope(new JSONObject().put("items",items)),null);
  assertEquals(1,rows.length());
  assertEquals("keep",rows.getJSONObject(0).getString("id"));
 }
 @Test public void malformedWorkspaceResponseStillFallsBackToDirectory() throws Exception {
  JSONObject sessions=envelope(new JSONObject().put("items",new JSONArray().put(session("a","对话","E:\\work\\alpha"))));
  JSONArray rows=RemoteCatalog.rows(sessions,new JSONObject().put("result",new JSONObject().put("ok",true).put("value",new JSONObject())));
  assertEquals("directory:e:/work/alpha",rows.getJSONObject(0).getString("workspaceId"));
  assertEquals("alpha",rows.getJSONObject(0).getString("workspaceTitle"));
 }
}
