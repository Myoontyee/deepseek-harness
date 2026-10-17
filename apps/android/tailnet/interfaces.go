package main

import (
 "encoding/json"
 "fmt"
 "io"
 "net"
 "os"
 "tailscale.com/net/netmon"
)

type androidInterface struct {
 Name string `json:"name"`
 Index int `json:"index"`
 MTU int `json:"mtu"`
 Addresses []string `json:"addresses"`
}

// Android app UIDs cannot query netlink; the parent supplies SDK-visible interfaces.
func readInterfaces(path string) ([]netmon.Interface,error) {
 f,err:=os.Open(path);if err!=nil{return nil,err};defer f.Close()
 var rows []androidInterface
 if err=json.NewDecoder(io.LimitReader(f,65537)).Decode(&rows);err!=nil{return nil,err}
 if len(rows)>16{return nil,fmt.Errorf("too many Android interfaces")}
 result:=make([]netmon.Interface,0,len(rows))
 for _,row:=range rows {
  if row.Name=="" || len(row.Name)>128 || row.Index<1 || len(row.Addresses)>32{return nil,fmt.Errorf("invalid Android interface")}
  addresses:=make([]net.Addr,0,len(row.Addresses))
  for _,value:=range row.Addresses {
   ip,network,err:=net.ParseCIDR(value);if err!=nil{return nil,err};network.IP=ip;addresses=append(addresses,network)
  }
  result=append(result,netmon.Interface{Interface:&net.Interface{Name:row.Name,Index:row.Index,MTU:row.MTU,Flags:net.FlagUp|net.FlagRunning},AltAddrs:addresses})
 }
 if len(rows)>0{updateDefaultInterface(rows[0].Name)}else{updateDefaultInterface("")}
 return result,nil
}
