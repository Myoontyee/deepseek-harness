package io.jadegate.dsh.companion;
import java.net.InetAddress;
public final class NetworkEvidenceCheck {
 public static void main(String[] args) throws Exception {
  NetworkEvidence cellular=new NetworkEvidence(true);cellular.observe(false,InetAddress.getByName("100.100.252.18"));check(cellular.addresses.isEmpty());
  NetworkEvidence vpn=new NetworkEvidence(true);vpn.observe(true,InetAddress.getByName("100.100.252.18"));check(vpn.addresses.size()==1);
  vpn.observe(true,InetAddress.getByName("100.128.1.1"));check(vpn.addresses.size()==1);
  vpn.observe(true,InetAddress.getByName("fd7a:115c:a1e0::123"));check(vpn.addresses.size()==2);
  vpn.observe(true,InetAddress.getByName("fd7a:115c:abcd::123"));check(vpn.addresses.size()==2);
  NetworkEvidence unknown=new NetworkEvidence(true);unknown.vpnVisible=true;check(unknown.summary().contains("已检测到 VPN"));
  unknown.vpnVisible=false;unknown.restricted=true;check(unknown.summary().contains("无法据此判断"));
  check(new NetworkEvidence(false).summary().contains("尚未检测到 Tailscale 应用"));
  System.out.println("Network evidence checks passed");
 }
 private static void check(boolean condition){if(!condition)throw new AssertionError("Incorrect network evidence");}
}
