package io.jadegate.dsh.companion;

import android.content.Context;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.LinkProperties;
import android.net.LinkAddress;
import java.nio.file.Files;
import java.nio.file.StandardCopyOption;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
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
 private String snapshot="";
 private final AtomicBoolean networkPending=new AtomicBoolean();
 private File snapshotFile(){return new File(context.getFilesDir(),"tailnet-interfaces.json");}
 private boolean writeNetworkSnapshot() throws Exception {
  JSONArray rows=new JSONArray();
  ConnectivityManager manager=(ConnectivityManager)context.getSystemService(Context.CONNECTIVITY_SERVICE);
  for(Network network:manager.getAllNetworks()) {
   NetworkCapabilities capabilities=manager.getNetworkCapabilities(network);
   LinkProperties properties=manager.getLinkProperties(network);
   if(capabilities==null || properties==null || capabilities.hasTransport(NetworkCapabilities.TRANSPORT_VPN) || properties.getInterfaceName()==null)continue;
   JSONArray addresses=new JSONArray();
   for(LinkAddress address:properties.getLinkAddresses()) {if(addresses.length()>=32)break;addresses.put(address.getAddress().getHostAddress()+"/"+address.getPrefixLength());}
   if(addresses.length()==0)continue;
   rows.put(new JSONObject().put("name",properties.getInterfaceName()).put("index",rows.length()+1).put("mtu",properties.getMtu()).put("addresses",addresses));
   if(rows.length()>=16)break;
  }
  String value=rows.toString();if(value.equals(snapshot))return false;
  byte[] bytes=value.getBytes(StandardCharsets.UTF_8);if(bytes.length>65536)throw new IOException("网络信息过大");
  File temporary=new File(context.getFilesDir(),"tailnet-interfaces.tmp");
  Files.write(temporary.toPath(),bytes);
  Files.move(temporary.toPath(),snapshotFile().toPath(),StandardCopyOption.REPLACE_EXISTING,StandardCopyOption.ATOMIC_MOVE);
  snapshot=value;return true;
 }
 void networkChanged(){
  Process child=process;if(closed || child==null || !child.isAlive() || !networkPending.compareAndSet(false,true))return;
  Thread worker=new Thread(()->{try{command("network");}catch(Exception error){/* The next foreground refresh reports connection errors. */}finally{networkPending.set(false);}},"tailnet-network");worker.setDaemon(true);worker.start();
 }
 TailnetClient(Context context) { this.context=context.getApplicationContext(); }
 private void start() throws Exception {
  if(closed)throw new IOException("Tailscale 组件已关闭");
  if(process!=null && process.isAlive())return;
  if(input!=null){try{input.close();}catch(IOException error){/* Previous process is already gone. */}}
  File executable=new File(context.getApplicationInfo().nativeLibraryDir,"libdsh_tailnet.so");
  if(!executable.canExecute())throw new IOException("安装包缺少适合此设备的 Tailscale 组件");
  File state=new File(context.getFilesDir(),"tailnet");
  writeNetworkSnapshot();
  ProcessBuilder builder=new ProcessBuilder(executable.getAbsolutePath(),"--state",state.getAbsolutePath(),"--interfaces",snapshotFile().getAbsolutePath());
  builder.environment().put("GOMAXPROCS","2");
  builder.environment().put("GODEBUG","netdns=cgo");
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
  start();
  boolean changed=writeNetworkSnapshot();
  if(changed && !"network".equals(command.optString("action")))exchange(new JSONObject().put("action","network"));
  return exchange(command);
 }
 private JSONObject exchange(JSONObject command) throws Exception {
  input.write(command.toString());input.newLine();input.flush();
  String line=replies.poll(75,TimeUnit.SECONDS);
  if(line==null){process.destroy();throw new IOException("Tailscale 响应超时，请重试");}
  JSONObject value=new JSONObject(line);
  if(!value.optBoolean("ok"))throw new IOException(value.optString("error","Tailscale 请求未完成"));
  return value;
 }
 JSONObject command(String action) throws Exception {return command(new JSONObject().put("action",action));}
 @Override public void close(){closed=true;Process child=process;if(child!=null)child.destroy();}
}
