// The native helper owns an app-private tsnet node; only its parent can issue commands on stdin.
package main

import (
 "bufio"
 "context"
 "encoding/json"
 "flag"
 "fmt"
 "io"
 "os"
 "sort"
 "strings"
 "time"

 _ "tailscale.com/feature/androidbin"
 "tailscale.com/tsnet"
 "tailscale.com/ipn/ipnstate"
)

type command struct { Action string `json:"action"` }
type device struct {
 ID string `json:"id"`
 Name string `json:"name"`
 OS string `json:"os"`
 Addresses []string `json:"addresses"`
 Online bool `json:"online"`
 Self bool `json:"self"`
}
func view(p *ipnstate.PeerStatus, self bool) device {
 name:=strings.Split(strings.TrimSpace(p.DNSName),".")[0]
 if name=="" {name=p.HostName}
 ips:=[]string{}
 for _,ip:=range p.TailscaleIPs {ips=append(ips,ip.String())}
 return device{string(p.ID),name,p.OS,ips,p.Online,self}
}
func main() {
 state:=flag.String("state","","private node state directory")
 flag.Parse()
 if *state=="" {fmt.Fprintln(os.Stderr,"private state directory required");os.Exit(2)}
 if err:=os.MkdirAll(*state,0700);err!=nil {os.Exit(2)}
 logf:=func(string,...any){}
 srv:=&tsnet.Server{Dir:*state,Hostname:"deepseek-harness-desktop-android",Logf:logf,UserLogf:logf}
 if err:=srv.Start();err!=nil {json.NewEncoder(os.Stdout).Encode(map[string]any{"ok":false,"error":"Tailscale startup failed: "+err.Error()});return}
 defer srv.Close()
 client,err:=srv.LocalClient()
 if err!=nil {return}
 scanner:=bufio.NewScanner(os.Stdin);scanner.Buffer(make([]byte,4096),65536)
 out:=json.NewEncoder(os.Stdout)
 for scanner.Scan() {
  var request command
  if err:=json.Unmarshal(scanner.Bytes(),&request);err!=nil {out.Encode(map[string]any{"ok":false,"error":"Invalid command"});continue}
  if request.Action=="stop" {out.Encode(map[string]any{"ok":true});return}
  ctx,cancel:=context.WithTimeout(context.Background(),15*time.Second)
  var result any
  switch request.Action {
  case "login":
   err=client.StartLoginInteractive(ctx)
   result=map[string]any{"ok":err==nil}
  case "logout":
   err=client.Logout(ctx)
   result=map[string]any{"ok":err==nil}
  case "status":
   var status *ipnstate.Status
   status,err=client.Status(ctx)
   if err==nil {
    peers:=[]device{}
    if status.Self!=nil {peers=append(peers,view(status.Self,true))}
    for _,peer:=range status.Peer {if len(peers)>=512 {break};peers=append(peers,view(peer,false))}
    sort.Slice(peers,func(i,j int)bool {if peers[i].Self!=peers[j].Self{return peers[i].Self};return peers[i].Name<peers[j].Name})
    result=map[string]any{"ok":true,"state":status.BackendState,"authUrl":status.AuthURL,"devices":peers}
   }
  default: err=fmt.Errorf("unknown command")
  }
  cancel()
  if err!=nil {result=map[string]any{"ok":false,"error":err.Error()}}
  if err=out.Encode(result);err!=nil && err!=io.EOF {return}
 }
}
