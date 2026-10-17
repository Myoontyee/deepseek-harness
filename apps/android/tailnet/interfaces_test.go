package main

import (
 "os"
 "path/filepath"
 "testing"
)

func TestAndroidInterfacesPreserveHostAddresses(t *testing.T) {
 path:=filepath.Join(t.TempDir(),"interfaces.json")
 if err:=os.WriteFile(path,[]byte(`[{"name":"wlan0","index":1,"mtu":1500,"addresses":["192.168.4.12/24","2001:db8::5/64"]}]`),0600);err!=nil{t.Fatal(err)}
 rows,err:=readInterfaces(path);if err!=nil{t.Fatal(err)}
 if len(rows)!=1 || rows[0].AltAddrs==nil{t.Fatal("SDK addresses must bypass netlink")}
 addresses,err:=rows[0].Addrs();if err!=nil{t.Fatal(err)}
 if len(addresses)!=2 || addresses[0].String()!="192.168.4.12/24" || addresses[1].String()!="2001:db8::5/64"{t.Fatalf("host addresses lost: %v",addresses)}
}
func TestAndroidInterfacesRejectInvalidAddress(t *testing.T) {
 path:=filepath.Join(t.TempDir(),"interfaces.json")
 if err:=os.WriteFile(path,[]byte(`[{"name":"wlan0","index":1,"addresses":["invalid"]}]`),0600);err!=nil{t.Fatal(err)}
 if _,err:=readInterfaces(path);err==nil{t.Fatal("invalid SDK snapshot accepted")}
}
