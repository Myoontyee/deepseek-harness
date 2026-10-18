package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestPinnedPhoneUpload(t *testing.T) {
	received := 0
	srv := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received++
		if r.URL.Path != "/_dsh_mobile/phone-sync" || r.Header.Get("Cookie") != "__Host-dsh-device="+strings.Repeat("a", 43) {
			t.Error("wrong scoped request")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"saved":true}`))
	}))
	defer srv.Close()
	sum := sha256.Sum256(srv.Certificate().Raw)
	request := command{Origin: srv.URL, Pin: hex.EncodeToString(sum[:]), Token: strings.Repeat("a", 43), Body: json.RawMessage(`{"chats":[]}`)}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	dial := (&net.Dialer{}).DialContext
	if _, err := pinnedRequest(ctx, dial, request, func(string) bool { return true }); err != nil {
		t.Fatal(err)
	}
	request.Pin = strings.Repeat("0", 64)
	if _, err := pinnedRequest(ctx, dial, request, func(string) bool { return true }); err == nil {
		t.Fatal("accepted changed certificate")
	}
	if received != 1 {
		t.Fatal("sent credentials before certificate validation")
	}
	request.Origin = "https://unlisted.invalid"
	if _, err := pinnedRequest(ctx, dial, request, func(string) bool { return false }); err == nil {
		t.Fatal("accepted unknown device")
	}
}
func TestPairFailureSeparatesApprovalFromRateLimit(t *testing.T) {
	if !strings.Contains(pairFailure(429, []byte(`{"code":"approval_busy"}`)).Error(), "确认窗口") {
		t.Fatal("busy was misdiagnosed")
	}
	if !strings.Contains(pairFailure(429, nil).Error(), "一分钟") {
		t.Fatal("rate limit was misdiagnosed")
	}
	if !strings.Contains(pairFailure(408, nil).Error(), "超时") {
		t.Fatal("timeout was misdiagnosed")
	}
}
