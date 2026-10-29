package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	host "raypx.local/desktop/internal/desktop"
	"runtime"
	"sync/atomic"
	"testing"
	"time"
)

type approvalUI struct{ visible atomic.Bool }

func (u *approvalUI) IsVisible() bool              { return u.visible.Load() }
func (u *approvalUI) Hide() bool                   { u.visible.Store(false); return true }
func (*approvalUI) PickDirectory() (string, error) { return "", nil }
func (*approvalUI) OpenExternal(string) error      { return nil }

func TestBuiltCLIMaintainsApprovalVisibilityLease(t *testing.T) {
	binary := os.Getenv("RAYPX_MYGO_CLI")
	if binary == "" || runtime.GOOS != "darwin" {
		t.Skip("explicit macOS compiled CLI hook integration gate")
	}
	directory := t.TempDir()
	t.Setenv("RAYPX_HOME", t.TempDir())
	t.Setenv("CODEX_HOME", t.TempDir())
	t.Setenv("CLAUDE_CONFIG_DIR", t.TempDir())
	t.Setenv("RAYPX_TERMINAL_HOST", "")
	args := []string{"--profile", "mygo-approval-test", "--data-dir", directory}
	defer func() { _ = host.Command(binary, append([]string{"daemon", "stop"}, args...)...).Run() }()
	config, _ := host.ParseConfig(nil)
	desktop, err := host.New(config, t.TempDir(), binary, "0.1.0", args, true, &keys{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer desktop.Close()
	ui := &approvalUI{}
	ui.visible.Store(true)
	desktop.UI = ui
	if !desktop.Start() {
		t.Fatal("CLI failed to start")
	}
	request := func(method string, input host.JSON) any {
		t.Helper()
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		value, err := desktop.Engine.Request(ctx, method, input)
		if err != nil {
			t.Fatalf("%s failed: %v", method, err)
		}
		return value
	}
	project := t.TempDir()
	root := request("roots.register", host.JSON{"path": project}).(map[string]any)
	request("agents.configure", host.JSON{"rootId": root["id"], "providers": []string{"claude"}})
	request("approvals.local.configure", host.JSON{"rootIds": []any{root["id"]}, "away": true, "waitSeconds": 60})
	raw, err := os.ReadFile(filepath.Join(directory, "profiles/mygo-approval-test/terminal-hook.json"))
	if err != nil {
		t.Fatal(err)
	}
	var endpoint struct{ Socket, Token string }
	if json.Unmarshal(raw, &endpoint) != nil {
		t.Fatal("Invalid isolated hook endpoint")
	}
	payload, _ := json.Marshal(host.JSON{"provider": "claude", "input": host.JSON{"session_id": "mygo-approval-test", "cwd": root["path"], "hook_event_name": "PermissionRequest", "tool_name": "Bash", "tool_input": host.JSON{"command": "printf synthetic"}}})
	client := &http.Client{Timeout: 10 * time.Second, Transport: &http.Transport{DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "unix", endpoint.Socket)
	}}}
	defer client.CloseIdleConnections()
	result := make(chan error, 1)
	go func() {
		req, _ := http.NewRequest("POST", "http://localhost/hook", bytes.NewReader(payload))
		req.Header.Set("Authorization", "Bearer "+endpoint.Token)
		req.Header.Set("Content-Type", "application/json")
		response, err := client.Do(req)
		if err == nil {
			defer response.Body.Close()
			_, err = io.Copy(io.Discard, response.Body)
		}
		result <- err
	}()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		projection := request("approvals.local.list", host.JSON{}).(map[string]any)
		pending := false
		for _, raw := range projection["requests"].([]any) {
			if raw.(map[string]any)["status"] == "pending" {
				pending = true
			}
		}
		if pending {
			ui.visible.Store(false)
			desktop.Visible(false)
			if err := <-result; err != nil {
				t.Fatal("Hook did not finish after visibility lease release")
			}
			return
		}
		select {
		case err := <-result:
			t.Fatalf("Hook completed before a pending request: %v", err)
		default:
		}
		desktop.UpdateLease()
		time.Sleep(50 * time.Millisecond)
	}
	t.Fatal("Visible Desktop did not maintain its approval lease")
}
