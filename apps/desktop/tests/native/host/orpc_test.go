package tests

import (
	"bufio"
	"context"
	"encoding/json"
	"os/exec"
	"strings"
	"testing"
	"time"

	host "raypx.local/desktop/internal/desktop"
)

// Exercise the Go wire adapter against the actual TS oRPC router used by API.
func TestGoTransportAgainstTypeScriptORPC(t *testing.T) {
	bun, err := exec.LookPath("bun")
	if err != nil {
		t.Fatal("The pinned Bun runtime is required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Minute)
	defer cancel()
	cmd := host.Command(bun, "run", "../fixtures/orpc-server.ts")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = cmd.Process.Kill(); _ = cmd.Wait() }()
	ready := make(chan string, 1)
	go func() {
		scanner := bufio.NewScanner(stdout)
		if scanner.Scan() {
			ready <- scanner.Text()
		} else {
			ready <- ""
		}
	}()
	var line string
	select {
	case line = <-ready:
	case <-ctx.Done():
		t.Fatal("oRPC fixture did not start")
	}
	var metadata struct{ Origin string }
	if json.Unmarshal([]byte(line), &metadata) != nil || metadata.Origin == "" {
		t.Fatal("Missing oRPC fixture origin")
	}
	api := host.NewAPI(metadata.Origin, host.MemoryCookies(metadata.Origin))
	first, err := api.RPC(ctx, "account/get", host.JSON{})
	if err != nil {
		t.Fatal(err)
	}
	if first.(map[string]any)["authenticated"] != false {
		t.Fatal("Unexpected initial cookie")
	}
	second, err := api.RPC(ctx, "account/get", host.JSON{})
	if err != nil {
		t.Fatal(err)
	}
	if second.(map[string]any)["authenticated"] != true {
		t.Fatal("Native cookie did not reach TS router")
	}
	grant, err := api.RPC(ctx, "hosts/authorize", host.JSON{"deviceId": "fixture-device", "epoch": 1})
	if err != nil {
		t.Fatal(err)
	}
	credential := grant.(map[string]any)["credential"]
	revoked, err := api.RPC(ctx, "hosts/revoke", host.JSON{"credential": credential})
	if err != nil || revoked.(map[string]any)["revoked"] != true {
		t.Fatal("Native revoke failed")
	}
	for _, row := range []struct{ device, code string }{{"unauthorized", "AUTH_REQUIRED"}, {"not-found", "NOT_FOUND"}, {"forbidden", "FORBIDDEN"}, {"legacy", "MISSING_PROCEDURE"}, {"redirect", "Invalid native API response"}} {
		_, err := api.RPC(ctx, "hosts/authorize", host.JSON{"deviceId": row.device})
		if err == nil || err.Error() != row.code {
			t.Errorf("%s: expected %s, got %v", row.device, row.code, err)
		}
	}
	for _, mode := range []string{"date", "forged-error"} {
		_, err := api.RPC(ctx, "account/get", host.JSON{"mode": mode})
		if err == nil || strings.Contains(err.Error(), "private-server-detail") {
			t.Errorf("Unsupported/private response escaped for %s", mode)
		}
	}
	_, err = api.Request(ctx, host.JSON{"path": "/rpc/hosts/authorize", "method": "POST", "headers": host.JSON{}, "body": "{}"}, false)
	if err == nil {
		t.Fatal("Renderer obtained native host authorization")
	}
}
