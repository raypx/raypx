package tests

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	host "raypx.local/desktop/internal/desktop"
	"strconv"
	"strings"
	"testing"
	"time"
)

// Reuse this test binary as a finite, versioned bundled CLI. All fixtures are synthetic.
func TestMain(m *testing.M) {
	if len(os.Args) > 2 && os.Args[1] == "daemon" {
		if os.Args[2] == "restart" {
			if marker := os.Getenv("RAYPX_TEST_RESTART"); marker != "" {
				_ = os.WriteFile(marker, []byte("replaced"), 0600)
			}
			os.Stdout.Write([]byte(`{"running":true}`))
			os.Exit(0)
		}
		var input host.JSON
		if json.NewDecoder(io.LimitReader(os.Stdin, 64*1024)).Decode(&input) != nil {
			os.Exit(2)
		}
		mode := os.Getenv("RAYPX_TEST_BOOTSTRAP_MODE")
		if mode == "stall" {
			if marker := os.Getenv("RAYPX_TEST_STARTED"); marker != "" {
				_ = os.WriteFile(marker, []byte("started"), 0600)
			}
			time.Sleep(time.Hour)
			os.Exit(2)
		}
		if mode == "mismatch" {
			if _, err := os.Stat(os.Getenv("RAYPX_TEST_RESTART")); err != nil {
				os.Stderr.Write([]byte(`{"code":"HOST_VERSION_MISMATCH","message":"private diagnostic"}`))
				os.Exit(1)
			}
		}
		if mode == "oversized" {
			os.Stdout.Write([]byte(strings.Repeat("x", 64*1024+1)))
			os.Exit(0)
		}
		if input["action"] == "prepare" {
			json.NewEncoder(os.Stdout).Encode(host.JSON{"createKey": os.Getenv("RAYPX_TEST_HAS_SESSION") == "", "profileDirectory": os.Getenv("RAYPX_TEST_PROFILE")})
			os.Exit(0)
		}
		if log := os.Getenv("RAYPX_TEST_BOOTSTRAP_INPUT"); log != "" {
			raw, _ := json.Marshal(host.JSON{"input": input, "args": os.Args})
			_ = os.WriteFile(log, raw, 0600)
		}
		var address host.JSON
		json.Unmarshal([]byte(os.Getenv("RAYPX_TEST_NATIVE_ADDRESS")), &address)
		version := "test"
		if mode == "wrong-version" {
			version = "other"
		}
		json.NewEncoder(os.Stdout).Encode(host.JSON{"version": version, "protocolVersion": 1, "nativeCapability": strings.Repeat("n", 72), "nativeAddress": address, "features": host.JSON{"localTerminalApprovals": true}})
		os.Exit(0)
	}
	os.Exit(m.Run())
}
func nativeFixture(t *testing.T, unix bool) (*host.DaemonClient, <-chan host.JSON) {
	t.Helper()
	requests := make(chan host.JSON, 32)
	server := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" || r.URL.Path != "/desktop/native" || r.Header.Get("Authorization") != "Bearer "+strings.Repeat("n", 72) || r.Header.Get("Origin") != "" {
			t.Error("native authority changed")
			w.WriteHeader(403)
			return
		}
		var input host.JSON
		if json.NewDecoder(r.Body).Decode(&input) != nil {
			w.WriteHeader(400)
			return
		}
		requests <- input
		if input["action"] == "visible" && os.Getenv("RAYPX_TEST_BLOCK_VISIBLE") == "1" {
			<-r.Context().Done()
			return
		}
		value := any(true)
		if input["action"] == "channel" {
			value = host.JSON{"protocol": 1, "url": "ws://127.0.0.1:12345/desktop", "capability": strings.Repeat("r", 72), "expiresAt": time.Now().Add(time.Second * 30).Format(time.RFC3339Nano)}
		}
		json.NewEncoder(w).Encode(host.JSON{"result": value})
	}))
	address := host.JSON{}
	if unix {
		socket := filepath.Join(t.TempDir(), "native.sock")
		listener, err := net.Listen("unix", socket)
		if err != nil {
			t.Fatal(err)
		}
		server.Listener.Close()
		server.Listener = listener
		address["socket"] = socket
	} else {
		address["port"] = server.Listener.Addr().(*net.TCPAddr).Port
	}
	server.Start()
	t.Cleanup(server.Close)
	raw, _ := json.Marshal(address)
	t.Setenv("RAYPX_TEST_NATIVE_ADDRESS", string(raw))
	t.Setenv("RAYPX_TEST_PROFILE", t.TempDir())
	binary, _ := os.Executable()
	config, _ := host.ParseConfig(nil)
	client := host.NewDaemonClient(host.CLIConfig{Binary: binary, Version: "test"}, config, "mygo://"+config.Scope, nil)
	t.Cleanup(client.Close)
	return client, requests
}
func TestFiniteBootstrapAndNativeCapability(t *testing.T) {
	client, requests := nativeFixture(t, false)
	if !client.Start() {
		t.Fatal(client.Status())
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	value, err := client.Channel(ctx)
	if err != nil {
		t.Fatal(err)
	}
	raw, _ := json.Marshal(value)
	if strings.Contains(string(raw), strings.Repeat("n", 72)) {
		t.Fatal("native capability escaped to renderer")
	}
	if (<-requests)["action"] != "channel" {
		t.Fatal("channel request missing")
	}
	client.Close()
	if (<-requests)["action"] != "release" {
		t.Fatal("native binding not released")
	}
	if client.Start() {
		t.Fatal("closed bootstrap reused")
	}
	if _, err := client.Channel(ctx); err == nil {
		t.Fatal("closed channel reused")
	}
}
func TestFiniteBootstrapUsesPrivateUnixIPC(t *testing.T) {
	if os.PathSeparator == '\\' {
		t.Skip("POSIX Unix transport")
	}
	client, _ := nativeFixture(t, true)
	if !client.Start() {
		t.Fatal(client.Status())
	}
	if _, err := client.Channel(context.Background()); err != nil {
		t.Fatal(err)
	}
}
func TestMismatchRequiresExplicitOwnerReplacement(t *testing.T) {
	client, _ := nativeFixture(t, false)
	t.Setenv("RAYPX_TEST_BOOTSTRAP_MODE", "mismatch")
	t.Setenv("RAYPX_TEST_RESTART", filepath.Join(t.TempDir(), "restart"))
	if client.Start() || client.Status()["code"] != "HOST_VERSION_MISMATCH" {
		t.Fatal("mismatch disappeared")
	}
	if !client.ReplaceOwner() {
		t.Fatal("explicit owner replacement failed")
	}
}
func TestBootstrapRejectsWrongVersionAndOversizedOutput(t *testing.T) {
	for _, mode := range []string{"wrong-version", "oversized"} {
		t.Run(mode, func(t *testing.T) {
			client, _ := nativeFixture(t, false)
			t.Setenv("RAYPX_TEST_BOOTSTRAP_MODE", mode)
			if client.Start() {
				t.Fatal("invalid bootstrap admitted")
			}
		})
	}
}
func TestCloseCancelsFiniteBootstrap(t *testing.T) {
	client, _ := nativeFixture(t, false)
	marker := filepath.Join(t.TempDir(), "started")
	t.Setenv("RAYPX_TEST_BOOTSTRAP_MODE", "stall")
	t.Setenv("RAYPX_TEST_STARTED", marker)
	done := make(chan bool, 1)
	go func() { done <- client.Start() }()
	deadline := time.Now().Add(time.Second * 3)
	for {
		if _, err := os.Stat(marker); err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("bootstrap never started")
		}
		time.Sleep(10 * time.Millisecond)
	}
	closed := make(chan struct{})
	go func() { client.Close(); close(closed) }()
	select {
	case <-closed:
	case <-time.After(2 * time.Second):
		t.Fatal("blocked bootstrap held shutdown")
	}
	if <-done {
		t.Fatal("stale bootstrap became ready")
	}
}
func TestUnavailableKeysStayInMemory(t *testing.T) {
	for _, hasSession := range []bool{false, true} {
		t.Run(strconv.FormatBool(hasSession), func(t *testing.T) {
			_, _ = nativeFixture(t, false)
			if hasSession {
				t.Setenv("RAYPX_TEST_HAS_SESSION", "1")
			}
			input := filepath.Join(t.TempDir(), "input")
			t.Setenv("RAYPX_TEST_BOOTSTRAP_INPUT", input)
			binary, _ := os.Executable()
			config, _ := host.ParseConfig(nil)
			called := false
			client := host.NewDaemonClient(host.CLIConfig{Binary: binary, Version: "test"}, config, "mygo://"+config.Scope, func(profile string, create bool) ([]byte, error) {
				called = true
				if !filepath.IsAbs(profile) || create == hasSession {
					t.Error("unsafe key creation")
				}
				return nil, errors.New("vault unavailable")
			})
			defer client.Close()
			if !client.Start() || !called {
				t.Fatal("memory-only startup failed")
			}
			raw, _ := os.ReadFile(input)
			var capture struct {
				Input host.JSON
				Args  []string
			}
			json.Unmarshal(raw, &capture)
			if _, exists := capture.Input["key"]; exists {
				t.Fatal("unavailable key supplied")
			}
		})
	}
}

func TestAvailableKeyTravelsOnlyOnStdin(t *testing.T) {
	_, _ = nativeFixture(t, false)
	input := filepath.Join(t.TempDir(), "input")
	t.Setenv("RAYPX_TEST_BOOTSTRAP_INPUT", input)
	binary, _ := os.Executable()
	config, _ := host.ParseConfig(nil)
	key := []byte(strings.Repeat("k", 32))
	client := host.NewDaemonClient(host.CLIConfig{Binary: binary, Version: "test"}, config, "mygo://"+config.Scope, func(string, bool) ([]byte, error) { return key, nil })
	defer client.Close()
	if !client.Start() {
		t.Fatal(client.Status())
	}
	raw, err := os.ReadFile(input)
	if err != nil {
		t.Fatal(err)
	}
	var capture struct {
		Input host.JSON
		Args  []string
	}
	if json.Unmarshal(raw, &capture) != nil || capture.Input["key"] != base64.StdEncoding.EncodeToString(key) {
		t.Fatal("key missing from private stdin")
	}
	for _, arg := range capture.Args {
		if strings.Contains(arg, string(key)) || strings.Contains(arg, base64.StdEncoding.EncodeToString(key)) {
			t.Fatal("key exposed in command arguments")
		}
	}
}

func TestOldSessionsRemainUntouched(t *testing.T) {
	directory := t.TempDir()
	files := []string{"mygo-sessions-v3.sqlite", "mygo-sessions-v3.sqlite-wal", "mygo-sessions-v3.sqlite-shm"}
	for _, name := range files {
		if err := os.WriteFile(filepath.Join(directory, name), []byte("retired synthetic data"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	config, _ := host.ParseConfig(nil)
	desktop, err := host.New(config, directory, host.Options{CLI: host.CLIConfig{Binary: "/never-started"}})
	if err != nil {
		t.Fatal(err)
	}
	desktop.Close()
	for _, name := range files {
		raw, err := os.ReadFile(filepath.Join(directory, name))
		if err != nil || string(raw) != "retired synthetic data" {
			t.Fatal("old credentials changed")
		}
	}
}

func TestNativeIPCShutdownCancelsInFlightRequests(t *testing.T) {
	client, requests := nativeFixture(t, false)
	if !client.Start() {
		t.Fatal(client.Status())
	}
	t.Setenv("RAYPX_TEST_BLOCK_VISIBLE", "1")
	done := make(chan error, 1)
	go func() {
		_, err := client.Native(context.Background(), host.JSON{"action": "visible", "active": true})
		done <- err
	}()
	select {
	case <-requests:
	case <-time.After(time.Second):
		t.Fatal("native request never started")
	}
	client.Close()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("cancelled request succeeded")
		}
	case <-time.After(time.Second):
		t.Fatal("native request survived shutdown")
	}
}
