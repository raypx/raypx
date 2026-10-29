package tests

import (
	"context"
	"encoding/json"
	"net/url"
	"os"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	host "raypx.local/desktop/internal/desktop"
)

func fixture(t *testing.T, name string) []host.JSON {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("../../fixtures/native", name+".json"))
	if err != nil {
		t.Fatal(err)
	}
	var cases []host.JSON
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	return cases
}
func TestSharedConnectionFixtures(t *testing.T) {
	for _, row := range fixture(t, "config") {
		t.Run(row["name"].(string), func(t *testing.T) {
			config, err := host.ParseConfig([]byte(row["source"].(string)))
			if row["invalid"] == true {
				if err == nil {
					t.Fatal("accepted invalid config")
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			expected := row["expected"].(map[string]any)
			if config.APIURL != expected["apiUrl"] || config.WebURL != expected["webUrl"] {
				t.Fatalf("fixture differs: %v", config)
			}
		})
	}
}
func TestSharedAPIFixtures(t *testing.T) {
	origin, _ := url.Parse("https://api.example.test")
	for _, row := range fixture(t, "api-paths") {
		input := row["input"].(map[string]any)
		_, err := host.ValidateAPI(origin, input, row["native"] == true)
		if (err == nil) != (row["allowed"] == true) {
			t.Errorf("fixture differs for %v: %v", input["path"], err)
		}
	}
}
func TestSharedCookieFixtures(t *testing.T) {
	origin, _ := url.Parse("https://api.example.test")
	for _, row := range fixture(t, "cookies") {
		raw := row["raw"].(string)
		change, err := host.ParseCookie(origin, raw, time.Unix(1000, 0))
		outcome := "set"
		if err != nil {
			outcome = "error"
		} else if change == nil {
			outcome = "ignore"
		} else if change.Remove {
			outcome = "remove"
		}
		if outcome != row["outcome"] {
			t.Errorf("cookie fixture differs: %q got %s", raw, outcome)
			continue
		}
		if expected, ok := row["expected"].(map[string]any); ok && change != nil {
			bytes, _ := json.Marshal(change.Cookie)
			var actual host.JSON
			_ = json.Unmarshal(bytes, &actual)
			for key, value := range expected {
				if !reflect.DeepEqual(actual[key], value) {
					t.Errorf("cookie field %s differs for %q", key, raw)
				}
			}
		}
	}
}
func TestSharedRendererAndScopeFixtures(t *testing.T) {
	bytes, err := os.ReadFile("../../../generated/local-methods.json")
	if err != nil {
		t.Fatal(err)
	}
	var methods []string
	_ = json.Unmarshal(bytes, &methods)
	config, _ := host.ParseConfig(nil)
	desktop, err := host.New(config, t.TempDir(), "/unstarted-cli", "0.1.0", nil, true, &keys{}, methods)
	if err != nil {
		t.Fatal(err)
	}
	defer desktop.Close()
	for _, row := range fixture(t, "local-methods") {
		method := row["method"].(string)
		_, err := desktop.RendererParams(method, host.JSON{})
		if (err == nil) != (row["allowed"] == true) {
			t.Errorf("method fixture differs: %s", method)
		}
	}
	for _, row := range fixture(t, "account-scopes") {
		desktop.Config.Scope = row["scope"].(string)
		value, err := desktop.RendererParams("agents.local.list", row["input"])
		if err != nil || !reflect.DeepEqual(value, row["expected"]) {
			t.Errorf("account scope fixture differs: %v", row["input"])
		}
	}
}
func TestReloadDoesNotDisconnectNewEventSubscriber(t *testing.T) {
	events := host.NewEvents()
	first := events.Subscribe(func(host.JSON) error { return nil })
	calls := 0
	second := events.Subscribe(func(host.JSON) error { calls++; return nil })
	defer second()
	first()
	if events.Send(context.Background(), host.JSON{"event": "reload"}) != nil || calls != 1 {
		t.Fatal("old page disconnected replacement subscriber")
	}
}
func TestBuiltCLIUsesPrivateDaemonProtocol(t *testing.T) {
	binary := os.Getenv("RAYPX_MYGO_CLI")
	if binary == "" {
		t.Skip("explicit built CLI integration gate")
	}
	if !filepath.IsAbs(binary) {
		t.Fatal("built CLI must be absolute")
	}
	directory := t.TempDir()
	t.Setenv("RAYPX_HOME", t.TempDir())
	t.Setenv("CODEX_HOME", t.TempDir())
	t.Setenv("CLAUDE_CONFIG_DIR", t.TempDir())
	t.Setenv("RAYPX_TERMINAL_HOST", "")
	args := []string{"--profile", "mygo-host-test", "--data-dir", directory}
	defer func() {
		command := host.Command(binary, append([]string{"daemon", "stop"}, args...)...)
		_ = command.Run()
	}()
	engine := host.NewEngine(binary, "0.1.0", args, true, host.NewEvents())
	defer engine.Close()
	if !engine.Start() {
		t.Fatalf("real CLI handshake failed: %v", engine.Status())
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if _, err := engine.Request(ctx, "roots.list", host.JSON{}); err != nil {
		t.Fatal("real CLI roots request failed")
	}
}
