package io.jadegate.dsh.companion;

import org.junit.Test;
import static org.junit.Assert.*;

public final class ConnectionRouteTest {
 @Test public void oldTailnetGrantsUseTheSavedAppNode(){
  assertTrue(ConnectionRoute.embedded(false,true,"https://100.64.0.1:42874"));
  assertTrue(ConnectionRoute.embedded(false,true,"https://100.127.255.255:42874"));
  assertTrue(ConnectionRoute.embedded(false,true,"https://[fd7a:115c:a1e0::1]:42874"));
 }
 @Test public void routingDoesNotTurnLanOrPublicHostsIntoTailnetPeers(){
  for(String origin:new String[]{"https://192.168.1.5:42874","https://100.63.1.1","https://100.128.0.1","https://100.064.0.1","https://100.64.0.999","https://example.com","not a uri"})assertFalse(origin,ConnectionRoute.embedded(false,true,origin));
 }
 @Test public void embeddedGrantsRemainExplicitAndLanStillWorksWithoutNode(){
  assertFalse(ConnectionRoute.embedded(false,false,"https://100.100.1.2:42874"));
  assertTrue(ConnectionRoute.embedded(true,false,"https://100.100.1.2:42874"));
 }
}
