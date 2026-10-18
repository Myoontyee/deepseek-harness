package io.jadegate.dsh.companion;

import java.net.URI;
import java.util.Locale;

/** Select the app-owned node only for saved Tailnet endpoints; never resolve arbitrary hostnames. */
final class ConnectionRoute {
 static boolean embedded(boolean requested,boolean savedNode,String origin) {
  if(requested)return true;
  if(!savedNode)return false;
  try {
   String host=new URI(origin).getHost();if(host==null)return false;
   host=host.toLowerCase(Locale.ROOT).replace("[","").replace("]","");
   if(host.startsWith("fd7a:115c:a1e0:"))return true;
   String[] parts=host.split("\\.");if(parts.length!=4||!parts[0].equals("100"))return false;
   int second=Integer.parseInt(parts[1]);if(second<64||second>127)return false;
   for(String part:parts){if(!part.matches("[0-9]{1,3}")||Integer.parseInt(part)>255||!String.valueOf(Integer.parseInt(part)).equals(part))return false;}
   return true;
  }catch(Exception invalid){return false;}
 }
}
