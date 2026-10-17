package io.jadegate.dsh.companion;

import java.net.InetAddress;
import java.util.LinkedHashSet;

/** Network evidence never treats an ordinary carrier CGNAT address as a VPN. */
final class NetworkEvidence {
 final boolean installed;
 boolean vpnVisible;
 boolean restricted;
 final LinkedHashSet<String> addresses = new LinkedHashSet<>();
 NetworkEvidence(boolean installed) { this.installed=installed; }
 void observe(boolean tunnel, InetAddress address) {
  if (!tunnel || addresses.size()>=4) return;
  byte[] raw=address.getAddress();
  boolean v4=raw.length==4 && (raw[0]&255)==100 && (raw[1]&255)>=64 && (raw[1]&255)<=127;
  boolean v6=raw.length==16 && (raw[0]&255)==0xfd && (raw[1]&255)==0x7a && (raw[2]&255)==0x11 && (raw[3]&255)==0x5c && (raw[4]&255)==0xa1 && (raw[5]&255)==0xe0;
  if(v4 || v6) addresses.add(address.getHostAddress());
 }
 String summary() {
  if(!addresses.isEmpty()) return "检测到符合 Tailscale 地址范围的 VPN 隧道："+String.join("、",addresses)+"。这仅表示本机网络状态，不代表已经获取其他设备列表。";
  if(vpnVisible) return "已检测到 VPN，但系统没有提供可确认的 Tailscale 地址。若 Tailscale 显示 Connected，请检查应用分流是否允许 DSH 使用隧道。";
  if(restricted) return "系统未提供完整的 VPN 网络状态，无法据此判断 Tailscale 是否连通。请打开 Tailscale 检查 Connected 和应用分流设置。";
  if(installed) return "已安装 Tailscale，但 DSH 暂未看到 VPN 连接。请打开 Tailscale 确认 Connected，并检查应用分流是否包含 DSH。返回后会自动刷新。";
  return "尚未检测到 Tailscale 应用。可安装并连接 Tailscale；同一 Wi-Fi 下也可以扫码配对电脑。";
 }
}
