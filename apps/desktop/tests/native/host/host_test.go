package tests

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	host "raypx.local/desktop/internal/desktop"
)

type keys struct {
	values      map[string][]byte
	unavailable bool
}

func (k *keys) Get(name string) ([]byte, error) {
	if k.unavailable {
		return nil, errors.New("unavailable")
	}
	return k.values[name], nil
}
func (k *keys) Set(name string, value []byte) error {
	if k.values == nil {
		k.values = map[string][]byte{}
	}
	k.values[name] = append([]byte{}, value...)
	return nil
}
func TestMain(m *testing.M) {
	if len(os.Args) > 1 && (os.Args[1] == "daemon" || os.Args[1] == "stdio") {
		mode := ""
		for _, arg := range os.Args {
			if strings.HasPrefix(arg, "--host-test-mode=") {
				mode = strings.TrimPrefix(arg, "--host-test-mode=")
			}
		}
		scanner := bufio.NewScanner(os.Stdin)
		scanner.Buffer(make([]byte, 64*1024), host.LineLimit+1)
		for scanner.Scan() {
			var v host.JSON
			if json.Unmarshal(scanner.Bytes(), &v) != nil {
				os.Exit(2)
			}
			result := any(host.JSON{"ok": true})
			if v["method"] == "runtime.info" {
				if mode == "handshake-stall" {
					_ = json.NewEncoder(os.Stdout).Encode(host.JSON{"version": 1, "event": "test.handshakeBlocked", "data": host.JSON{}})
					continue
				}
				if mode == "mismatch" {
					_ = json.NewEncoder(os.Stdout).Encode(host.JSON{"version": 1, "event": "engine.status", "data": host.JSON{"code": "HOST_VERSION_MISMATCH"}})
					continue
				}
				result = host.JSON{"version": "0.1.0", "protocolVersion": 1, "owner": "daemon", "features": host.JSON{"localTerminalApprovals": true}}
			}
			if v["method"] == "broken" {
				packet, _ := json.Marshal(host.JSON{"version": 1, "id": v["id"], "result": host.JSON{"unexpected": true}})
				_, _ = os.Stdout.Write(packet)
				os.Exit(0)
			}
			_ = json.NewEncoder(os.Stdout).Encode(host.JSON{"version": 1, "id": v["id"], "result": result})
			if mode == "stall" && v["method"] == "runtime.info" {
				var one [1]byte
				_, _ = os.Stdin.Read(one[:])
				_ = json.NewEncoder(os.Stdout).Encode(host.JSON{"version": 1, "event": "test.writeBlocked", "data": host.JSON{}})
				time.Sleep(time.Hour)
			}
		}
		if mode == "invalid-tail" {
			_, _ = os.Stdout.Write([]byte("invalid old process output\n"))
		}
		os.Exit(0)
	}
	os.Exit(m.Run())
}
func TestConfigRejectsUntrustedOrigins(t *testing.T) {
	for _, raw := range []string{"http://example.com", "https://user:pass@example.com", "https://example.com/path", "https://example.com?q=x", "https://example.com#x", "https://example.com\\@evil.test", "https://example.com\n", "file:///etc/passwd"} {
		if _, err := host.ParseOrigin(raw); err == nil {
			t.Errorf("accepted %q", raw)
		}
	}
	for _, raw := range []string{"https://example.com", "http://127.0.0.1:1234", "http://localhost:1420", "http://[::1]:3123"} {
		if _, err := host.ParseOrigin(raw); err != nil {
			t.Errorf("rejected %q", raw)
		}
	}
}
func TestConfigScopesProfiles(t *testing.T) {
	c, err := host.ParseConfig([]byte("base_url='https://one.test'\nweb_url='https://web.test'\nprofile='beta'\n[profiles.beta]\nbase_url='https://two.test'\n"))
	if err != nil || c.APIURL != "https://two.test" || c.WebURL != c.APIURL || c.Scope != host.Digest(c.APIURL)[:32] {
		t.Fatalf("incorrect profile selection: %v", err)
	}
	for _, raw := range []string{"bad=true", "profile='missing'", "[profiles.x]\nunknown=1", "[connectors]\ncodex_home='relative'", strings.Repeat(" ", 16385)} {
		if _, err := host.ParseConfig([]byte(raw)); err == nil {
			t.Errorf("accepted config: %q", raw[:min(60, len(raw))])
		}
	}
}
func TestPreferencesPreserveUnreadableFilesAndOtherFields(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "preferences.json")
	_ = os.WriteFile(path, []byte("broken"), 0600)
	prefs := host.OpenPreferences(dir)
	if prefs.Snapshot()["status"] != "unreadable" {
		t.Fatal("missing unreadable status")
	}
	bytes, _ := os.ReadFile(path)
	if string(bytes) != "broken" {
		t.Fatal("read rewrote corrupt preferences")
	}
	if !prefs.Save(host.JSON{"locale": "zh", "extra": true}) || !prefs.Save(host.JSON{"theme": "dark"}) {
		t.Fatal("save failed")
	}
	restored := host.OpenPreferences(dir).Read()
	if restored["locale"] != "zh" || restored["extra"] != true {
		t.Fatal("save erased unrelated fields")
	}
	if prefs.Save(host.JSON{"huge": strings.Repeat("x", 4096)}) {
		t.Fatal("oversize save accepted")
	}
}
func TestInstanceLockExcludesOtherConnections(t *testing.T) {
	dir := t.TempDir()
	db, conn, err := host.AcquireInstance(dir)
	if err != nil {
		t.Fatal(err)
	}
	if other, c, err := host.AcquireInstance(dir); err == nil {
		c.Close()
		other.Close()
		t.Fatal("second instance acquired SQLite lock")
	}
	conn.Close()
	db.Close()
	db, conn, err = host.AcquireInstance(dir)
	if err != nil {
		t.Fatal("lock was not released")
	}
	conn.Close()
	db.Close()
}
func TestEncryptedCookiesPersistAndStayPrivate(t *testing.T) {
	dir := t.TempDir()
	vault := &keys{}
	origin, _ := url.Parse("https://example.com")
	jar, err := host.OpenCookies(dir, origin.String(), vault)
	if err != nil {
		t.Fatal(err)
	}
	change, err := host.ParseCookie(origin, "__Secure-better-auth.session_token=private-token; Path=/; Secure; HttpOnly; Max-Age=3600", time.Now())
	if err != nil || change == nil {
		t.Fatal(err)
	}
	if err := jar.Apply([]host.CookieChange{*change}); err != nil {
		t.Fatal(err)
	}
	encrypted, _ := os.ReadFile(filepath.Join(dir, "session-v2.enc"))
	if strings.Contains(string(encrypted), "private-token") {
		t.Fatal("plaintext cookie persisted")
	}
	restored, err := host.OpenCookies(dir, origin.String(), vault)
	if err != nil {
		t.Fatal(err)
	}
	header, err := restored.Header(origin)
	if err != nil || !strings.Contains(header, "private-token") {
		t.Fatal("session did not survive restart")
	}
	vault.unavailable = true
	temporary, err := host.OpenCookies(dir, origin.String(), vault)
	if err != nil || temporary.Recovery != "temporary" {
		t.Fatal("missing temporary recovery")
	}
	preserved, _ := os.ReadFile(filepath.Join(dir, "session-v2.enc"))
	if string(preserved) != string(encrypted) {
		t.Fatal("temporary key failure changed encrypted file")
	}
	other, _ := url.Parse("https://other.test")
	if _, err := jar.Header(other); err == nil {
		t.Fatal("cookie escaped configured origin")
	}
}
func TestCookiePolicyAndSessionOnlyPersistence(t *testing.T) {
	origin, _ := url.Parse("https://example.com")
	for _, raw := range []string{"better-auth.session_token=x; Path=/; Secure", "better-auth.session_token=x; Secure; HttpOnly; Domain=evil.test", "better-auth.session_token=x; Secure; HttpOnly; Path=/private", "better-auth.session_token=x; Secure; HttpOnly; Max-Age=oops", "better-auth.session_token=x; Secure; HttpOnly; SameSite=oops"} {
		if _, err := host.ParseCookie(origin, raw, time.Now()); err == nil {
			t.Errorf("accepted cookie %q", raw)
		}
	}
	dir := t.TempDir()
	vault := &keys{}
	jar, _ := host.OpenCookies(dir, origin.String(), vault)
	change, _ := host.ParseCookie(origin, "better-auth.session_token=session-only; Secure; HttpOnly; Path=/", time.Now())
	if err := jar.Apply([]host.CookieChange{*change}); err != nil {
		t.Fatal(err)
	}
	restored, _ := host.OpenCookies(dir, origin.String(), vault)
	header, _ := restored.Header(origin)
	if header != "" {
		t.Fatal("session-only cookie survived restart")
	}
}
func TestNativeHTTPHidesCookiesAndRejectsPrivateRendererRPC(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Origin") != "views://main" {
			t.Error("missing native origin")
		}
		w.Header().Set("Set-Cookie", "better-auth.session_token=hidden; Path=/; HttpOnly; Max-Age=60")
		w.Header().Set("Authorization", "hidden")
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"json":{"id":"account"}}`))
	}))
	defer server.Close()
	api := host.NewAPI(server.URL, host.MemoryCookies(server.URL))
	input := host.JSON{"path": "/rpc/account/get", "method": "POST", "headers": host.JSON{"content-type": "application/json"}, "body": "{}"}
	response, err := api.Request(context.Background(), input, false)
	if err != nil {
		t.Fatal(err)
	}
	headers := response["headers"].(map[string]any)
	if headers["set-cookie"] != nil || headers["authorization"] != nil {
		t.Fatal("private headers exposed")
	}
	for _, path := range []string{"/rpc/hosts/authorize", "//evil.test/rpc/account/get", "/api/unknown", "/rpc/account/get#fragment"} {
		input["path"] = path
		if _, err := api.Request(context.Background(), input, false); err == nil {
			t.Errorf("accepted forbidden path %q", path)
		}
	}
}
func TestAPIResponseLimitAndCancellation(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.RawQuery == "slow" {
			<-r.Context().Done()
			return
		}
		_, _ = w.Write([]byte(strings.Repeat("x", host.LineLimit+1)))
	}))
	defer server.Close()
	api := host.NewAPI(server.URL, host.MemoryCookies(server.URL))
	input := host.JSON{"path": "/api/auth/get-session", "method": "GET", "headers": host.JSON{}}
	if _, err := api.Request(context.Background(), input, false); err == nil {
		t.Fatal("oversize body accepted")
	}
	input["path"] = "/api/auth/get-session?slow"
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if _, err := api.Request(ctx, input, false); err == nil {
		t.Fatal("cancellation ignored")
	}
}
func TestEventCreditBoundsSlowConsumer(t *testing.T) {
	events := host.NewEvents()
	var sequence uint64
	off := events.Subscribe(func(packet host.JSON) error { sequence = packet["sequence"].(uint64); return nil })
	defer off()
	large := host.JSON{"data": strings.Repeat("x", host.CreditBytes-100)}
	if err := events.Send(context.Background(), large); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()
	if events.Send(ctx, large) == nil {
		t.Fatal("slow consumer did not apply backpressure")
	}
	if !events.Acknowledge(sequence) || events.Acknowledge(sequence+1) {
		t.Fatal("invalid acknowledgement accepted")
	}
	if err := events.Send(context.Background(), large); err != nil {
		t.Fatal(err)
	}
}
func TestEngineHandshakeAndShutdown(t *testing.T) {
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	engine := host.NewEngine(binary, "0.1.0", nil, true, host.NewEvents())
	if !engine.Start() {
		t.Fatalf("handshake failed: %v", engine.Status())
	}
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	result, err := engine.Request(ctx, "files.list", host.JSON{})
	if err != nil || result.(map[string]any)["ok"] != true {
		t.Fatal("request did not round-trip")
	}
	engine.Stop()
	if _, err := engine.Request(ctx, "files.list", host.JSON{}); err == nil {
		t.Fatal("stopped engine accepted request")
	}
}
func TestRendererPolicyKeepsPrivilegedMethodsNative(t *testing.T) {
	config, _ := host.ParseConfig(nil)
	desktop, err := host.New(config, t.TempDir(), "/unstarted-cli", "0.1.0", nil, true, &keys{}, []string{"host.authorize", "roots.register", "agents.local.list", "connectors.install", "observed.remote", "approvals.local.watch", "files.list"})
	if err != nil {
		t.Fatal(err)
	}
	defer desktop.Close()
	for _, method := range []string{"host.authorize", "roots.register", "observed.remote", "approvals.local.watch", "files.eraseAll"} {
		if _, err := desktop.RendererParams(method, host.JSON{}); err == nil {
			t.Errorf("accepted privileged method %q", method)
		}
	}
	value, err := desktop.RendererParams("agents.local.list", host.JSON{"accountId": "account"})
	if err != nil || value.(map[string]any)["accountId"] == "account" {
		t.Fatal("account was not server-scoped")
	}
	value, err = desktop.RendererParams("connectors.install", host.JSON{"configDirs": host.JSON{"codex": "/attacker"}})
	if err != nil || value.(map[string]any)["configDirs"].(map[string]any)["codex"] == "/attacker" {
		t.Fatal("renderer controlled native connector paths")
	}
}
