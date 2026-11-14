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
		if input["action"] == "release" {
			json.NewEncoder(os.Stdout).Encode(host.JSON{"released": true})
			os.Exit(0)
		}
		if input["action"] == "reset_sessions" {
			if marker := os.Getenv("RAYPX_TEST_RESET"); marker != "" {
				_ = os.WriteFile(marker, []byte("reset"), 0600)
			}
			if os.Getenv("RAYPX_TEST_RESET_FAILURE") == "1" {
				os.Stderr.Write([]byte(`{"code":"SESSION_STORAGE_UNAVAILABLE"}`))
				os.Exit(1)
			}
			json.NewEncoder(os.Stdout).Encode(host.JSON{"reset": true})
			os.Exit(0)
		}
		var address host.JSON
		json.Unmarshal([]byte(os.Getenv("RAYPX_TEST_NATIVE_ADDRESS")), &address)
		version := "test"
		if mode == "wrong-version" {
			version = "other"
		}
		json.NewEncoder(os.Stdout).Encode(host.JSON{"version": version, "protocolVersion": 1, "nativeCapability": strings.Repeat("n", 72), "nativeAddress": address})
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
		if input["action"] == "quit" && os.Getenv("RAYPX_TEST_EXPIRED_QUIT") == "1" {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(host.JSON{"error": host.JSON{"code": "FORBIDDEN"}})
			return
		}
		if input["action"] == "pick" && os.Getenv("RAYPX_TEST_SLOW_PICK") == "1" {
			time.Sleep(3200 * time.Millisecond)
		}
		if input["action"] == "notifications" && os.Getenv("RAYPX_TEST_NATIVE_ERROR") != "" {
			w.WriteHeader(http.StatusForbidden)
			json.NewEncoder(w).Encode(host.JSON{"error": host.JSON{"code": os.Getenv("RAYPX_TEST_NATIVE_ERROR")}})
			return
		}
		if input["action"] == "visible" && os.Getenv("RAYPX_TEST_BLOCK_VISIBLE") == "1" {
			<-r.Context().Done()
			return
		}
		if input["action"] == "pick" && os.Getenv("RAYPX_TEST_PICK") != "" {
			if os.Getenv("RAYPX_TEST_PICK") == "refused" {
				w.WriteHeader(403)
				return
			}
			json.NewEncoder(w).Encode(host.JSON{"error": host.JSON{"code": "AUTHENTICATION_REQUIRED"}})
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
		// Use a short path even when macOS gives TMPDIR a long per-user path.
		directory, err := os.MkdirTemp("/tmp", "raypx-ipc-")
		if err != nil {
			t.Fatal(err)
		}
		t.Cleanup(func() {
			if err := os.RemoveAll(directory); err != nil {
				t.Error(err)
			}
		})
		socket := filepath.Join(directory, "native.sock")
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
	if (<-requests)["action"] != "quit" {
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

func TestNativeDeadlinesAndBusinessErrorsPreserveReadiness(t *testing.T) {
	client, _ := nativeFixture(t, false)
	if !client.Start() {
		t.Fatal(client.Status())
	}
	t.Setenv("RAYPX_TEST_SLOW_PICK", "1")
	if _, err := client.Native(context.Background(), host.JSON{"action": "pick", "path": t.TempDir()}); err != nil {
		t.Fatal("directory registration retained the old response header deadline", err)
	}
	t.Setenv("RAYPX_TEST_NATIVE_ERROR", "FORBIDDEN")
	if _, err := client.Native(context.Background(), host.JSON{"action": "notifications"}); err == nil || err.Error() != "FORBIDDEN" {
		t.Fatal("bounded business code was lost", err)
	}
	t.Setenv("RAYPX_TEST_BLOCK_VISIBLE", "1")
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if _, err := client.Native(ctx, host.JSON{"action": "visible", "active": true}); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatal("caller deadline was lost", err)
	}
	if _, err := client.Native(context.Background(), host.JSON{"action": "visible", "active": true}); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatal("control request deadline was lost", err)
	}
	if client.Status()["status"] != "ready" {
		t.Fatal("business/timeout error poisoned host", client.Status())
	}
}

func TestFailedRefreshKeepsPreviousDescriptor(t *testing.T) {
	client, _ := nativeFixture(t, false)
	if !client.Start() {
		t.Fatal(client.Status())
	}
	t.Setenv("RAYPX_TEST_BOOTSTRAP_MODE", "wrong-version")
	if client.Refresh() {
		t.Fatal("invalid replacement accepted")
	}
	if client.Status()["status"] != "ready" {
		t.Fatal("working binding was discarded")
	}
	if _, err := client.Channel(context.Background()); err != nil {
		t.Fatal("working capability lost", err)
	}
	t.Setenv("RAYPX_TEST_BOOTSTRAP_MODE", "")
	if !client.Refresh() {
		t.Fatal("ready binding could not refresh")
	}
}

func TestTransportFailureAndAdministrativeOwnerRelease(t *testing.T) {
	client, _ := nativeFixture(t, false)
	if !client.Start() {
		t.Fatal(client.Status())
	}
	input := filepath.Join(t.TempDir(), "release")
	t.Setenv("RAYPX_TEST_BOOTSTRAP_INPUT", input)
	// Refresh with an unused local port so the existing native capability cannot be used.
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	port := listener.Addr().(*net.TCPAddr).Port
	listener.Close()
	t.Setenv("RAYPX_TEST_NATIVE_ADDRESS", `{"port":`+strconv.Itoa(port)+`}`)
	if !client.Refresh() {
		t.Fatal("synthetic bootstrap failed")
	}
	if _, err := client.Native(context.Background(), host.JSON{"action": "notifications"}); err == nil || client.Status()["status"] != "error" {
		t.Fatal("transport failure did not change availability", err)
	}
	client.Close()
	raw, err := os.ReadFile(input)
	if err != nil {
		t.Fatal(err)
	}
	var capture struct{ Input host.JSON }
	if json.Unmarshal(raw, &capture) != nil || capture.Input["action"] != "release" || len(capture.Input["ownerId"].(string)) != 64 {
		t.Fatal("owner cleanup missing")
	}
}

func TestExpiredQuitCapabilityStillReleasesNativeOwner(t *testing.T) {
	client, _ := nativeFixture(t, false)
	if !client.Start() {
		t.Fatal(client.Status())
	}
	input := filepath.Join(t.TempDir(), "release")
	t.Setenv("RAYPX_TEST_BOOTSTRAP_INPUT", input)
	t.Setenv("RAYPX_TEST_EXPIRED_QUIT", "1")
	client.Close()
	raw, err := os.ReadFile(input)
	if err != nil {
		t.Fatal(err)
	}
	var capture struct{ Input host.JSON }
	if json.Unmarshal(raw, &capture) != nil || capture.Input["action"] != "release" {
		t.Fatal("expired capability blocked owner cleanup")
	}
}

func TestSessionResetRequiresWritableKeyAndSuccessfulDatabaseClear(t *testing.T) {
	for _, mode := range []string{"key-failure", "database-failure", "success"} {
		t.Run(mode, func(t *testing.T) {
			_, _ = nativeFixture(t, false)
			marker := filepath.Join(t.TempDir(), "reset")
			t.Setenv("RAYPX_TEST_RESET", marker)
			if mode == "database-failure" {
				t.Setenv("RAYPX_TEST_RESET_FAILURE", "1")
			}
			binary, _ := os.Executable()
			config, _ := host.ParseConfig(nil)
			key := []byte(strings.Repeat("k", 32))
			desktop, err := host.New(config, t.TempDir(), host.Options{
				CLI:        host.CLIConfig{Binary: binary, Version: "test"},
				SessionKey: func(string, bool) ([]byte, error) { return key, nil },
				ResetSessionKey: func(string) ([]byte, error) {
					if mode == "key-failure" {
						return nil, errors.New("vault unavailable")
					}
					return key, nil
				},
			})
			if err != nil {
				t.Fatal(err)
			}
			defer desktop.Close()
			if !desktop.Client.Start() {
				t.Fatal(desktop.Client.Status())
			}
			if desktop.Client.ResetSessions() != (mode == "success") {
				t.Fatal("reset result misreported")
			}
			_, err = os.Stat(marker)
			if (err == nil) != (mode != "key-failure") {
				t.Fatal("database reset preceded writable key")
			}
		})
	}
}

func TestNativeOperationFailureKeepsTheChannel(t *testing.T) {
	t.Setenv("RAYPX_TEST_PICK", "operation")
	client, _ := nativeFixture(t, false)
	if !client.Start() {
		t.Fatal(client.Status())
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, err := client.Native(ctx, host.JSON{"action": "pick", "path": "/project"})
	var operation *host.NativeError
	if !errors.As(err, &operation) || operation.Code != "AUTHENTICATION_REQUIRED" {
		t.Fatalf("expected the daemon's operation code, got %v", err)
	}
	// A rejected directory is the renderer's problem to show, not a lost host.
	if client.Status()["status"] != "ready" {
		t.Fatal(client.Status())
	}
	if _, err := client.Native(ctx, host.JSON{"action": "visible", "active": true}); err != nil {
		t.Fatal(err)
	}
}
func TestRefusedNativeCapabilityRetiresTheChannel(t *testing.T) {
	t.Setenv("RAYPX_TEST_PICK", "refused")
	client, _ := nativeFixture(t, false)
	if !client.Start() {
		t.Fatal(client.Status())
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_, err := client.Native(ctx, host.JSON{"action": "pick", "path": "/project"})
	var operation *host.NativeError
	if err == nil || errors.As(err, &operation) {
		t.Fatalf("expected a transport failure, got %v", err)
	}
	if client.Status()["code"] != "HOST_UNAVAILABLE" {
		t.Fatal(client.Status())
	}
}
