package io.jadegate.dsh.companion;

import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;

/** Display-only grouping of an authorized computer's conversations by workspace. */
final class RemoteCatalog {
 private RemoteCatalog(){}

 /** Converts session/list and optional workspace/list responses into bounded remote rows. */
 static JSONArray rows(JSONObject sessions,JSONObject workspaces)throws Exception{
  JSONObject value=sessions.getJSONObject("result").getJSONObject("value");
  JSONArray items=value.getJSONArray("items");
  Map<String,String> members=new HashMap<>(),paths=new HashMap<>(),titles=new HashMap<>();
  if(workspaces!=null)readWorkspaces(workspaces,members,paths,titles);
  JSONArray rows=new JSONArray();
  for(int i=0;i<items.length()&&rows.length()<500;i++){
   JSONObject item=items.optJSONObject(i);
   if(item==null)continue;
   String id=item.optString("sessionId");
   if(id.isEmpty()||id.length()>512||item.optBoolean("blank")||subagent(item.opt("origin")))continue;
   String path=item.optString("cwd",""),workspace=members.get(id);
   if(workspace==null&&!path.isEmpty())workspace=paths.get(directoryKey(path));
   if(workspace==null)workspace="directory:"+directoryKey(path);
   String title=titles.get(workspace);
   if(title==null)title=path.isEmpty()?"其他对话":path.replace('\\','/').replaceAll("/+$","").replaceAll("^.*/","");
   if(title.isEmpty())title="其他对话";
   JSONObject projections=item.optJSONObject("projections"),values=projections==null?null:projections.optJSONObject("values");
   String name=values==null?"":values.optString("title","");
   rows.put(new JSONObject().put("id",id).put("title",name.isEmpty()?id:name).put("running",item.optBoolean("running")).put("workspaceId",workspace).put("workspaceTitle",title).put("workspacePath",path));
  }
  java.util.HashSet<String> represented=new java.util.HashSet<>();
  for(int i=0;i<rows.length();i++)represented.add(rows.getJSONObject(i).getString("workspaceId"));
  for(String id:new java.util.TreeSet<>(titles.keySet()))if(!represented.contains(id)&&rows.length()<500)rows.put(new JSONObject().put("id","").put("title","").put("emptyWorkspace",true).put("workspaceId",id).put("workspaceTitle",titles.get(id)));
  return rows;
 }
 private static boolean subagent(Object origin){
  if(origin instanceof JSONObject)return "subagent".equals(((JSONObject)origin).optString("kind"));
  return "subagent".equals(origin);
 }
 private static void readWorkspaces(JSONObject response,Map<String,String> members,Map<String,String> paths,Map<String,String> titles)throws Exception{
  JSONObject baseline=response.getJSONObject("result").getJSONObject("value");
  JSONArray items=baseline.optJSONArray("items");
  if(items==null)return;
  for(int i=0;i<items.length();i++){
   JSONObject item=items.optJSONObject(i);
   if(item==null)continue;
   String id=item.optString("workspaceId"),path=item.optString("path"),name=item.optString("title");
   if(id.isEmpty()||path.isEmpty())continue;
   titles.put(id,name.isEmpty()?path:name);
   paths.put(directoryKey(path),id);
   JSONArray sessionIds=item.optJSONArray("sessionIds");
   if(sessionIds==null)continue;
   for(int j=0;j<sessionIds.length();j++){String session=sessionIds.optString(j);if(!session.isEmpty())members.put(session,id);}
  }
 }
 private static String directoryKey(String path){
  String normalized=path.replace('\\','/').replaceAll("/+$","");
  return normalized.matches("^[a-zA-Z]:/.*")?normalized.toLowerCase(Locale.ROOT):normalized;
 }
}
