package io.jadegate.dsh.companion;

import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import android.content.ContentValues;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.zip.*;
import org.json.*;

/** Account-scoped, compressed phone transcripts. A write is atomic even when the process dies. */
final class PhoneChatStore extends SQLiteOpenHelper {
 PhoneChatStore(Context context){super(context,"phone-chats-v1.db",null,1);}
 @Override public void onCreate(SQLiteDatabase db){db.execSQL("CREATE TABLE chats(account TEXT NOT NULL,id TEXT NOT NULL,title TEXT NOT NULL,updated INTEGER NOT NULL,deleted INTEGER NOT NULL DEFAULT 0,body BLOB NOT NULL,PRIMARY KEY(account,id))");}
 @Override public void onUpgrade(SQLiteDatabase db,int from,int to){throw new IllegalStateException("Unsupported chat database upgrade");}
 synchronized void migrateAccount(String from,String to){
  if(from.equals(to))return;SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
  try{ContentValues values=new ContentValues();values.put("account",to);db.updateWithOnConflict("chats",values,"account=?",new String[]{from},SQLiteDatabase.CONFLICT_IGNORE);db.setTransactionSuccessful();}finally{db.endTransaction();}
 }
 synchronized JSONObject create(String account) throws Exception {
  JSONObject chat=new JSONObject().put("id",UUID.randomUUID().toString()).put("title","新对话").put("messages",new JSONArray()).put("annotations",new JSONArray()).put("draft","").put("annotationDraft",new JSONObject()).put("effort","high");
  save(account,chat);return chat;
 }
 synchronized void save(String account,JSONObject chat) throws Exception {
  if(!chat.getString("id").matches("[a-f0-9-]{36}"))throw new IOException("Invalid conversation id");
  byte[] plain=chat.toString().getBytes(StandardCharsets.UTF_8);if(plain.length>8*1024*1024)throw new IOException("对话超过本机存储上限，请新建对话");
  ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(GZIPOutputStream out=new GZIPOutputStream(bytes)){out.write(plain);}
  long updated=System.currentTimeMillis();try(Cursor latest=getReadableDatabase().rawQuery("SELECT MAX(updated) FROM chats",null)){if(latest.moveToFirst())updated=Math.max(updated,latest.getLong(0)+1);}chat.put("updated",updated);
  ContentValues values=new ContentValues();values.put("account",account);values.put("id",chat.getString("id"));values.put("title",chat.optString("title","新对话"));values.put("updated",updated);values.put("deleted",chat.optBoolean("deleted")?1:0);values.put("body",bytes.toByteArray());
  if(getWritableDatabase().insertWithOnConflict("chats",null,values,SQLiteDatabase.CONFLICT_REPLACE)==-1)throw new IOException("无法保存对话");
 }
 synchronized JSONObject read(String account,String id) throws Exception {
  try(Cursor row=getReadableDatabase().rawQuery("SELECT body,updated FROM chats WHERE account=? AND id=?",new String[]{account,id})){
   if(!row.moveToFirst())throw new IOException("未找到此账号的对话");
   ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(GZIPInputStream in=new GZIPInputStream(new ByteArrayInputStream(row.getBlob(0)))){byte[] block=new byte[4096];int count;while((count=in.read(block))!=-1){if(bytes.size()+count>8*1024*1024)throw new IOException("Conversation too large");bytes.write(block,0,count);}}
   JSONObject chat=new JSONObject(bytes.toString("UTF-8"));chat.put("updated",row.getLong(1));return chat;
  }
 }
 synchronized JSONArray list(String account) throws Exception {
  JSONArray result=new JSONArray();try(Cursor rows=getReadableDatabase().rawQuery("SELECT id,title,updated FROM chats WHERE account=? AND deleted=0 ORDER BY updated DESC LIMIT 500",new String[]{account})){while(rows.moveToNext())result.put(new JSONObject().put("id",rows.getString(0)).put("title",rows.getString(1)).put("updated",rows.getLong(2)));}return result;
 }
 synchronized JSONArray changes(String account,long since) throws Exception {
  JSONArray result=new JSONArray();int size=0;
  try(Cursor rows=getReadableDatabase().rawQuery("SELECT id FROM chats WHERE account=? AND updated>? ORDER BY updated LIMIT 20",new String[]{account,Long.toString(since)})){
   while(rows.moveToNext()){JSONObject chat=read(account,rows.getString(0));int next=chat.toString().getBytes(StandardCharsets.UTF_8).length;if(next>3*1024*1024)throw new IOException("此对话过大，暂不能同步到电脑");if(size+next>3*1024*1024)break;result.put(chat);size+=next;}
  }return result;
 }
}
