// The native helper owns an app-private tsnet node; only its parent can issue commands on stdin.
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"sort"
	"strings"
	"sync/atomic"
	"time"

	"tailscale.com/ipn/ipnstate"
	"tailscale.com/net/netmon"
	"tailscale.com/tsnet"
)

type command struct {
	Action    string          `json:"action"`
	ID        string          `json:"id"`
	Origin    string          `json:"origin"`
	Pin       string          `json:"pin"`
	Token     string          `json:"token"`
	Body      json.RawMessage `json:"body"`
	Operation string          `json:"operation"`
}
type device struct {
	ID        string   `json:"id"`
	Name      string   `json:"name"`
	OS        string   `json:"os"`
	Addresses []string `json:"addresses"`
	Online    bool     `json:"online"`
	Self      bool     `json:"self"`
	Ready     bool     `json:"ready"`
}

func view(p *ipnstate.PeerStatus, self bool) device {
	name := strings.Split(strings.TrimSpace(p.DNSName), ".")[0]
	if name == "" {
		name = p.HostName
	}
	ips := []string{}
	for _, ip := range p.TailscaleIPs {
		ips = append(ips, ip.String())
	}
	return device{ID: string(p.ID), Name: name, OS: p.OS, Addresses: ips, Online: p.Online, Self: self}
}
func main() {
	state := flag.String("state", "", "private node state directory")
	interfaces := flag.String("interfaces", "", "Android network snapshot")
	flag.Parse()
	if *state == "" {
		fmt.Fprintln(os.Stderr, "private state directory required")
		os.Exit(2)
	}
	if err := os.MkdirAll(*state, 0700); err != nil {
		os.Exit(2)
	}
	netmon.RegisterInterfaceGetter(func() ([]netmon.Interface, error) { return readInterfaces(*interfaces) })
	logf := func(string, ...any) {}
	srv := &tsnet.Server{Dir: *state, Hostname: "deepseek-harness-desktop-android", Logf: logf, UserLogf: logf}
	if err := srv.Start(); err != nil {
		json.NewEncoder(os.Stdout).Encode(map[string]any{"ok": false, "error": "Tailscale startup failed: " + err.Error()})
		return
	}
	defer srv.Close()
	client, err := srv.LocalClient()
	if err != nil {
		return
	}
	var allowed atomic.Value
	allowed.Store("")
	proxyListener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return
	}
	defer proxyListener.Close()
	slots := make(chan struct{}, 8)
	proxy := &http.Server{ReadHeaderTimeout: 5 * time.Second, Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "CONNECT" || r.Host != allowed.Load().(string) || r.Host == "" {
			http.Error(w, "Forbidden", 403)
			return
		}
		select {
		case slots <- struct{}{}:
			defer func() { <-slots }()
		default:
			http.Error(w, "Busy", 429)
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
		defer cancel()
		upstream, err := srv.Dial(ctx, "tcp", r.Host)
		if err != nil {
			http.Error(w, "Unavailable", 502)
			return
		}
		defer upstream.Close()
		hj, ok := w.(http.Hijacker)
		if !ok {
			http.Error(w, "Unsupported", 500)
			return
		}
		downstream, buffer, err := hj.Hijack()
		if err != nil {
			return
		}
		defer downstream.Close()
		buffer.WriteString("HTTP/1.1 200 Connection Established\r\n\r\n")
		if buffer.Flush() != nil {
			return
		}
		go func() { io.Copy(upstream, buffer); upstream.Close() }()
		io.Copy(downstream, upstream)
	})}
	go proxy.Serve(proxyListener)
	defer proxy.Close()
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 4096), 8*1024*1024)
	probes := map[string]probeState{}
	out := json.NewEncoder(os.Stdout)
	for scanner.Scan() {
		var request command
		if err := json.Unmarshal(scanner.Bytes(), &request); err != nil {
			out.Encode(map[string]any{"ok": false, "error": "Invalid command"})
			continue
		}
		if request.Action == "stop" {
			out.Encode(map[string]any{"ok": true})
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 65*time.Second)
		var result any
		switch request.Action {
		case "network":
			srv.Sys().NetMon.Get().InjectEvent()
			result = map[string]any{"ok": true}
		case "login":
			err = client.StartLoginInteractive(ctx)
			result = map[string]any{"ok": err == nil}
		case "logout":
			err = client.Logout(ctx)
			result = map[string]any{"ok": err == nil}
		case "ready":
			readyCtx, readyCancel := context.WithTimeout(ctx, 25*time.Second)
			_, err = srv.Up(readyCtx)
			readyCancel()
			if err != nil {
				err = fmt.Errorf("应用内 Tailscale 暂未就绪，请在设置检查登录或网络后重试")
			}
			result = map[string]any{"ok": err == nil}
		case "pair", "use", "request":
			var status *ipnstate.Status
			status, err = client.Status(ctx)
			if err == nil && status.BackendState != "Running" {
				readyCtx, readyCancel := context.WithTimeout(ctx, 25*time.Second)
				status, err = srv.Up(readyCtx)
				readyCancel()
				if err != nil {
					err = fmt.Errorf("应用内 Tailscale 暂未就绪，请在设置检查登录或网络后重试")
				}
			}
			if err == nil && request.Action == "pair" {
				var selected *ipnstate.PeerStatus
				for _, peer := range status.Peer {
					if string(peer.ID) == request.ID {
						selected = peer
						break
					}
				}
				if selected == nil {
					err = fmt.Errorf("设备已不在当前 Tailscale 列表中")
				} else {
					address := ""
					for _, ip := range selected.TailscaleIPs {
						if ip.Is4() {
							address = ip.String()
							break
						}
					}
					if address == "" {
						err = fmt.Errorf("设备没有可用的 Tailscale IPv4 地址")
					} else {
						transport := &http.Transport{DialContext: srv.Dial, Proxy: nil, DisableKeepAlives: true}
						hc := &http.Client{Transport: transport, Timeout: 60 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
						var req *http.Request
						req, err = http.NewRequestWithContext(ctx, "POST", "http://"+net.JoinHostPort(address, "42873")+"/v1/pair", strings.NewReader("{}"))
						if err == nil {
							req.Header.Set("Content-Type", "application/json")
							var response *http.Response
							response, err = hc.Do(req)
							if err == nil {
								bytes, readErr := io.ReadAll(io.LimitReader(response.Body, 65537))
								response.Body.Close()
								err = readErr
								if len(bytes) > 65536 {
									err = fmt.Errorf("电脑返回的配对资料过长")
								}
								var connection map[string]any
								if err == nil && response.StatusCode != 200 {
									err = pairFailure(response.StatusCode, bytes)
								}
								if err == nil {
									err = json.Unmarshal(bytes, &connection)
								}
								if err == nil {
									origin, _ := connection["url"].(string)
									pin, _ := connection["pin"].(string)
									token, _ := connection["token"].(string)
									u, parseErr := url.Parse(origin)
									if parseErr != nil || u.Scheme != "https" || u.Hostname() != address || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") || !regexp.MustCompile(`^[a-fA-F0-9]{64}$`).MatchString(pin) || !regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`).MatchString(token) {
										err = fmt.Errorf("电脑返回的连接身份无效")
									} else {
										result = map[string]any{"ok": true, "connection": map[string]any{"url": origin, "pin": pin, "token": token, "name": view(selected, false).Name}}
									}
								}
							}
						}
					}
				}
			} else if err == nil {
				var u *url.URL
				u, err = url.Parse(request.Origin)
				if err == nil {
					known := false
					for _, peer := range status.Peer {
						for _, ip := range peer.TailscaleIPs {
							if ip.String() == u.Hostname() {
								known = true
							}
						}
					}
					if !known || u.Scheme != "https" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") {
						err = fmt.Errorf("已保存的电脑不在当前 Tailscale 网络中")
					} else if request.Action == "request" {
						result, err = pinnedRequest(ctx, srv.Dial, request, func(host string) bool { return host == u.Hostname() })
					} else {
						port := u.Port()
						if port == "" {
							port = "443"
						}
						allowed.Store(net.JoinHostPort(u.Hostname(), port))
						result = map[string]any{"ok": true, "proxyPort": proxyListener.Addr().(*net.TCPAddr).Port}
					}
				}
			}
		case "status":
			var status *ipnstate.Status
			status, err = client.Status(ctx)
			if err == nil {
				peers := []device{}
				if status.Self != nil {
					peers = append(peers, view(status.Self, true))
				}
				for _, peer := range status.Peer {
					if len(peers) >= 512 {
						break
					}
					peers = append(peers, view(peer, false))
				}
				probeDevices(ctx, srv.Dial, peers, probes)
				sort.Slice(peers, func(i, j int) bool {
					if peers[i].Self != peers[j].Self {
						return peers[i].Self
					}
					return peers[i].Name < peers[j].Name
				})
				result = map[string]any{"ok": true, "state": status.BackendState, "authUrl": status.AuthURL, "devices": peers}
			}
		default:
			err = fmt.Errorf("unknown command")
		}
		cancel()
		if err != nil {
			result = map[string]any{"ok": false, "error": err.Error()}
		}
		if err = out.Encode(result); err != nil && err != io.EOF {
			return
		}
	}
}
