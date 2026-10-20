package main

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"sync"
	"time"
)

type dialer func(context.Context, string, string) (net.Conn, error)

func pairFailure(status int, body []byte) error {
	var response struct {
		Code string `json:"code"`
	}
	_ = json.Unmarshal(body, &response)
	switch status {
	case 429:
		if response.Code == "approval_busy" {
			return fmt.Errorf("电脑上已有一个连接确认窗口，请先处理该窗口；无需反复点击")
		}
		return fmt.Errorf("连接尝试过于频繁，请等待一分钟后重试")
	case 408, 504:
		return fmt.Errorf("电脑确认已超时，请重新连接，并在电脑上点允许")
	case 403:
		return fmt.Errorf("电脑拒绝了本次连接，或当前 Tailscale 访问策略不允许连接")
	case 404:
		return fmt.Errorf("电脑客户端不支持此连接方式，请更新电脑安装包")
	default:
		return fmt.Errorf("电脑连接服务返回 %d，请稍后重试", status)
	}
}
func pinnedRequest(ctx context.Context, dial dialer, request command, known func(string) bool) (any, error) {
	u, err := url.Parse(request.Origin)
	if err != nil || u.Scheme != "https" || u.User != nil || u.RawQuery != "" || u.Fragment != "" || (u.Path != "" && u.Path != "/") || !known(u.Hostname()) {
		return nil, fmt.Errorf("已授权电脑不在当前 Tailscale 网络中")
	}
	if !regexp.MustCompile(`^[a-fA-F0-9]{64}$`).MatchString(request.Pin) || !regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`).MatchString(request.Token) {
		return nil, fmt.Errorf("电脑连接身份无效，请重新授权")
	}
	if len(request.Body) > 4*1024*1024 {
		return nil, fmt.Errorf("手机对话同步内容过大")
	}
	expected := strings.ToLower(request.Pin)
	transport := &http.Transport{DialContext: dial, Proxy: nil, DisableKeepAlives: true, TLSClientConfig: &tls.Config{MinVersion: tls.VersionTLS12, InsecureSkipVerify: true, VerifyConnection: func(state tls.ConnectionState) error {
		if len(state.PeerCertificates) == 0 {
			return fmt.Errorf("缺少电脑证书")
		}
		cert := state.PeerCertificates[0]
		sum := sha256.Sum256(cert.Raw)
		now := time.Now()
		if hex.EncodeToString(sum[:]) != expected || now.Before(cert.NotBefore) || now.After(cert.NotAfter) {
			return fmt.Errorf("电脑身份验证失败，请重新配对")
		}
		return nil
	}}}
	defer transport.CloseIdleConnections()
	client := &http.Client{Transport: transport, Timeout: 30 * time.Second, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	path := "/_dsh_mobile/phone-sync"
	bodyText := string(request.Body)
	catalog := ""
	if request.Operation == "sessions" || request.Operation == "workspaces" {
		method := "session/list"
		args := `{"_request":{}}`
		if request.Operation == "workspaces" {
			method = "workspace/list"
			args = `{}`
		}
		path = "/api/" + method
		var id [16]byte
		if _, err = rand.Read(id[:]); err != nil {
			return nil, err
		}
		rpc := fmt.Sprintf("%x-%x-%x-%x-%x", id[0:4], id[4:6], id[6:8], id[8:10], id[10:])
		bodyText = `{"type":"client-request","rpcId":"` + rpc + `","method":"` + method + `","payload":{"args":` + args + `}}`
		client.Timeout = 10 * time.Second
		catalog = request.Operation
	} else if request.Operation != "" {
		return nil, fmt.Errorf("不支持的电脑操作")
	}
	req, err := http.NewRequestWithContext(ctx, "POST", strings.TrimRight(request.Origin, "/")+path, strings.NewReader(bodyText))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", "__Host-dsh-device="+request.Token)
	response, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("无法连接已授权电脑，请确认电脑在线：%w", err)
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, 4*1024*1024+1))
	if err != nil || len(body) > 4*1024*1024 {
		return nil, fmt.Errorf("电脑响应无效或过大")
	}
	if response.StatusCode != 200 {
		if response.StatusCode == 401 {
			return nil, fmt.Errorf("电脑授权已失效，请在设置重新授权")
		}
		return nil, fmt.Errorf("同步未完成（%d），请更新电脑客户端或稍后重试", response.StatusCode)
	}
	var result map[string]any
	if json.Unmarshal(body, &result) != nil {
		return nil, fmt.Errorf("电脑响应不是有效数据")
	}
	if catalog != "" {
		return map[string]any{"ok": true, catalog: result}, nil
	}
	if result["saved"] != true {
		return nil, fmt.Errorf("电脑没有确认保存手机记录")
	}
	return map[string]any{"ok": true}, nil
}

type probeState struct {
	ready   bool
	expires time.Time
}

func probeDevices(ctx context.Context, dial dialer, peers []device, cache map[string]probeState) {
	ctx, cancel := context.WithTimeout(ctx, 8*time.Second)
	defer cancel()
	var work sync.WaitGroup
	slots := make(chan struct{}, 3)
	var mutex sync.Mutex
	for i := range peers {
		peer := &peers[i]
		if peer.Self || !peer.Online || peer.OS == "android" || peer.OS == "ios" {
			continue
		}
		mutex.Lock()
		saved, ok := cache[peer.ID]
		mutex.Unlock()
		if ok && time.Now().Before(saved.expires) {
			peer.Ready = saved.ready
			continue
		}
		work.Add(1)
		go func() {
			defer work.Done()
			select {
			case slots <- struct{}{}:
				defer func() { <-slots }()
			case <-ctx.Done():
				return
			}
			ready := false
			for _, address := range peer.Addresses {
				if strings.Contains(address, ":") {
					continue
				}
				probe, cancel := context.WithTimeout(ctx, 2*time.Second)
				transport := &http.Transport{DialContext: dial, Proxy: nil, DisableKeepAlives: true}
				client := &http.Client{Transport: transport, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
				req, _ := http.NewRequestWithContext(probe, "GET", "http://"+net.JoinHostPort(address, "42873")+"/v1/status", nil)
				response, err := client.Do(req)
				if err == nil {
					var status struct {
						Service  string `json:"service"`
						Protocol int    `json:"protocol"`
					}
					err = json.NewDecoder(io.LimitReader(response.Body, 4096)).Decode(&status)
					response.Body.Close()
					ready = response.StatusCode == 200 && err == nil && status.Service == "deepseek-harness-desktop" && status.Protocol == 1
				}
				cancel()
				transport.CloseIdleConnections()
				break
			}
			peer.Ready = ready
			mutex.Lock()
			cache[peer.ID] = probeState{ready, time.Now().Add(30 * time.Second)}
			mutex.Unlock()
		}()
	}
	work.Wait()
}
