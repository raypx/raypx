package tests

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	host "raypx.local/desktop/internal/desktop"
)

func fakeEngine(t *testing.T, mode string) *host.Engine {
	t.Helper()
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	engine := host.NewEngine(binary, "0.1.0", []string{"--host-test-mode=" + mode}, true, host.NewEvents())
	t.Cleanup(engine.Close)
	return engine
}

func TestVersionMismatchSurvivesFailedHandshake(t *testing.T) {
	engine := fakeEngine(t, "mismatch")
	if engine.Start() {
		t.Fatal("mismatched daemon unexpectedly started")
	}
	if engine.Status()["code"] != "HOST_VERSION_MISMATCH" {
		t.Fatal("the replace-owner action lost its mismatch status")
	}
}

func TestProtocolRequiresFinalNewline(t *testing.T) {
	engine := fakeEngine(t, "")
	if !engine.Start() {
		t.Fatal("handshake failed")
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	if _, err := engine.Request(ctx, "broken", host.JSON{}); err == nil {
		t.Fatal("accepted a response that had no protocol delimiter")
	}
}

func TestRetiredProcessDiagnosticsCannotBreakReplacement(t *testing.T) {
	engine := fakeEngine(t, "invalid-tail")
	for range 5 {
		if !engine.Start() {
			t.Fatalf("replacement was poisoned by retired output: %v", engine.Status())
		}
		ctx, cancel := context.WithTimeout(context.Background(), time.Second)
		_, err := engine.Request(ctx, "roots.list", host.JSON{})
		cancel()
		if err != nil || engine.Status()["status"] != "ready" {
			t.Fatal("retired process changed the current engine")
		}
	}
}

func TestCanceledWritersReleaseThePipeAndDoNotLeaveQueuedWorkers(t *testing.T) {
	engine := fakeEngine(t, "stall")
	blocked := make(chan struct{})
	var once sync.Once
	engine.Events.Observe = func(event host.JSON) {
		if event["event"] == "test.writeBlocked" {
			once.Do(func() { close(blocked) })
		}
	}
	if !engine.Start() {
		t.Fatal("handshake failed")
	}
	active, cancel := context.WithCancel(context.Background())
	defer cancel()
	first := make(chan error, 1)
	go func() {
		_, err := engine.Request(active, "large", host.JSON{"data": strings.Repeat("x", host.LineLimit/2)})
		first <- err
	}()
	select {
	case <-blocked:
	case <-time.After(2 * time.Second):
		t.Fatal("test helper did not block its input")
	}
	queued, stop := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer stop()
	if _, err := engine.Request(queued, "queued", host.JSON{}); !errors.Is(err, context.DeadlineExceeded) {
		t.Fatalf("queued cancellation did not return its own deadline: %v", err)
	}
	select {
	case <-first:
		t.Fatal("canceling a queued writer stopped the active operation")
	default:
	}
	cancel()
	select {
	case err := <-first:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("active writer did not release on cancellation: %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("canceled writer remained blocked in the pipe")
	}
}

func TestTerminalConfigurationWaitsForAccountSelection(t *testing.T) {
	selecting := make(chan struct{})
	release := make(chan struct{})
	var releaseOnce sync.Once
	defer releaseOnce.Do(func() { close(release) })
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		close(selecting)
		select {
		case <-release:
		case <-r.Context().Done():
			return
		}
		w.Header().Set("content-type", "application/json")
		_, _ = w.Write([]byte(`{"json":{"id":"selected"}}`))
	}))
	defer server.Close()
	config, err := host.ParseConfig([]byte("base_url='" + server.URL + "'"))
	if err != nil {
		t.Fatal(err)
	}
	binary, _ := os.Executable()
	desktop, err := host.New(config, t.TempDir(), binary, "0.1.0", nil, true, &keys{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer desktop.Close()
	if !desktop.Start() {
		t.Fatal("test CLI did not start")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	selection := make(chan error, 1)
	go func() {
		_, err := desktop.Request(ctx, "control_session", host.JSON{"accountId": "selected"})
		selection <- err
	}()
	select {
	case <-selecting:
	case <-ctx.Done():
		t.Fatal("account verification did not start")
	}
	terminal := make(chan error, 1)
	go func() {
		_, err := desktop.Request(ctx, "terminal_settings", host.JSON{"accountId": "selected"})
		terminal <- err
	}()
	select {
	case <-terminal:
		t.Error("terminal request overtook account verification")
	case <-time.After(30 * time.Millisecond):
	}
	releaseOnce.Do(func() { close(release) })
	if err := <-selection; err != nil {
		t.Fatal(err)
	}
	if err := <-terminal; err != nil {
		t.Fatal(err)
	}
}

func TestCookieRawQuotesAreRejected(t *testing.T) {
	origin, _ := url.Parse("https://example.com")
	if _, err := host.ParseCookie(origin, `better-auth.session_token="quoted"; Secure; HttpOnly; Path=/`, time.Now()); err == nil {
		t.Fatal("parser normalized a raw value that native policy forbids")
	}
}

func TestCookieRecoveryFilesStayBounded(t *testing.T) {
	directory := t.TempDir()
	for index := range 5 {
		name := filepath.Join(directory, "session-v2.enc.corrupt-"+string(rune('a'+index)))
		if err := os.WriteFile(name, []byte("encrypted recovery"), 0600); err != nil {
			t.Fatal(err)
		}
		modified := time.Now().Add(-time.Duration(index) * time.Hour)
		_ = os.Chtimes(name, modified, modified)
	}
	old := filepath.Join(directory, "session-v2.enc.corrupt-expired")
	_ = os.WriteFile(old, nil, 0600)
	_ = os.Chtimes(old, time.Now().Add(-8*24*time.Hour), time.Now().Add(-8*24*time.Hour))
	unrelated := filepath.Join(directory, "session.enc.corrupt-legacy")
	_ = os.WriteFile(unrelated, nil, 0600)
	link := filepath.Join(directory, "session-v2.enc.corrupt-link")
	linked := os.Symlink(unrelated, link) == nil
	if _, err := host.OpenCookies(directory, "https://example.com", &keys{}); err != nil {
		t.Fatal(err)
	}
	entries, _ := os.ReadDir(directory)
	count := 0
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), "session-v2.enc.corrupt-") && entry.Type().IsRegular() {
			count++
		}
	}
	if count != 3 {
		t.Fatalf("expected three bounded recovery files, got %d", count)
	}
	if _, err := os.Stat(old); !os.IsNotExist(err) {
		t.Fatal("expired recovery file survived")
	}
	if _, err := os.Stat(unrelated); err != nil {
		t.Fatal("cleanup removed a different storage format")
	}
	if linked {
		if _, err := os.Lstat(link); err != nil {
			t.Fatal("cleanup removed a symlink")
		}
	}
}

func TestPreloadPreservesJSONKeysWithoutChangingPrototypes(t *testing.T) {
	binary := os.Getenv("RAYPX_MYGO_CLI")
	if binary == "" {
		t.Skip("explicit compiled CLI JavaScript runtime integration gate")
	}
	config, _ := host.ParseConfig(nil)
	desktop, err := host.New(config, t.TempDir(), "/unstarted-cli", "0.1.0", nil, true, &keys{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer desktop.Close()
	if !desktop.Preferences.Save(host.JSON{"__proto__": host.JSON{"injected": "kept-as-data"}, "extra": "</script>\u2028"}) {
		t.Fatal("test preferences were not saved")
	}
	script := `globalThis.window={};` + desktop.Preload() + `const raw=window.__raypxDevicePreferences.raw;process.stdout.write(JSON.stringify({own:Object.hasOwn(raw,"__proto__"),clean:Object.getPrototypeOf(raw)===Object.prototype,frozen:Object.isFrozen(raw)&&Object.isFrozen(raw["__proto__"]),extra:raw.extra}));`
	command := host.Command(binary, "--eval", script)
	command.Env = append(command.Environ(), "BUN_BE_BUN=1")
	command.Dir = t.TempDir()
	bytes, err := command.Output()
	if err != nil {
		t.Fatal("compiled runtime could not evaluate native preload")
	}
	var result host.JSON
	if json.Unmarshal(bytes, &result) != nil || result["own"] != true || result["clean"] != true || result["frozen"] != true || result["extra"] != "</script>\u2028" {
		t.Fatalf("preload changed JSON semantics: %s", bytes)
	}
}
