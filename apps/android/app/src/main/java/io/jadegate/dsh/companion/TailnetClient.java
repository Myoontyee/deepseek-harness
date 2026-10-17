package io.jadegate.dsh.companion;

import android.content.Context;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.*;
import org.json.JSONObject;

/** Owns the embedded node process. Credentials stay in app-private storage; control uses private pipes. */
final class TailnetClient implements AutoCloseable {
 private final Context context;
 private volatile Process process;
 private BufferedWriter input;
 private BlockingQueue<String> replies;
 private volatile boolean closed;
 TailnetClient(Context context) { this.context=context.getApplicationContext(); }
 private void start() throws Exception {
  if(closed)throw new IOException("Tailscale 组件已关闭");
  if(process!=null && process.isAlive())return;
  if(input!=null){try{input.close();}catch(IOException error){/* Previous process is already gone. */}}
  File executable=new File(context.getApplicationInfo().nativeLibraryDir,"libdsh_tailnet.so");
  if(!executable.canExecute())throw new IOException("安装包缺少适合此设备的 Tailscale 组件");
  File state=new File(context.getFilesDir(),"tailnet");
  ProcessBuilder builder=new ProcessBuilder(executable.getAbsolutePath(),"--state",state.getAbsolutePath());
  builder.environment().put("GOMAXPROCS","2");
  Process child=builder.start(); process=child;if(closed){child.destroy();throw new IOException("Tailscale 组件已关闭");}
  BlockingQueue<String> queue=new ArrayBlockingQueue<>(8); replies=queue;
  input=new BufferedWriter(new OutputStreamWriter(child.getOutputStream(),StandardCharsets.UTF_8));
  Thread reader=new Thread(()->{
   try(Reader source=new InputStreamReader(child.getInputStream(),StandardCharsets.UTF_8)) {
    StringBuilder line=new StringBuilder(); int value;
    while((value=source.read())!=-1){if(value=='\n'){queue.put(line.toString());line.setLength(0);}else{line.append((char)value);if(line.length()>524288)throw new IOException("Response too large");}}
   } catch(Exception error) { /* Request receives the bounded process-exit response below. */ }
   finally {queue.offer("{\"ok\":false,\"error\":\"Tailscale 组件已退出，请重试\"}");}
  },"tailnet-response");reader.setDaemon(true);reader.start();
  Thread stderr=new Thread(()->{try(InputStream source=child.getErrorStream()){byte[] buffer=new byte[2048];while(source.read(buffer)!=-1){}}catch(IOException error){/* Process teardown closes the pipe. */}},"tailnet-log-drain");stderr.setDaemon(true);stderr.start();
 }
 synchronized JSONObject command(JSONObject command) throws Exception {
  start(); input.write(command.toString());input.newLine();input.flush();
  String line=replies.poll(75,TimeUnit.SECONDS);
  if(line==null){process.destroy();throw new IOException("Tailscale 响应超时，请重试");}
  JSONObject value=new JSONObject(line);
  if(!value.optBoolean("ok"))throw new IOException(value.optString("error","Tailscale 请求未完成"));
  return value;
 }
 JSONObject command(String action) throws Exception {return command(new JSONObject().put("action",action));}
 @Override public void close(){closed=true;Process child=process;if(child!=null)child.destroy();}
}
