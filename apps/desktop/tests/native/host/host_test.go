package tests

import (
	"os"
	"path/filepath"
	host "raypx.local/desktop/internal/desktop"
	"strings"
	"testing"
)

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
