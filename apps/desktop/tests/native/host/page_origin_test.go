package tests

import (
	"testing"

	host "raypx.local/desktop/internal/desktop"
)

func TestNativePageOriginIsServerScoped(t *testing.T) {
	scope := "0123456789abcdef0123456789abcdef"
	other := "fedcba9876543210fedcba9876543210"
	for _, test := range []struct {
		name, raw, platform string
		development         bool
		allowed             bool
	}{
		{"bundled", "mygo://" + scope + "/", "darwin", false, true},
		{"bundled route", "mygo://" + scope + "/index.html?view=tasks#/tasks", "linux", false, true},
		{"other server", "mygo://" + other + "/", "darwin", false, false},
		{"legacy shared origin", "mygo://localhost/", "darwin", false, false},
		{"userinfo", "mygo://user@" + scope + "/", "darwin", false, false},
		{"port", "mygo://" + scope + ":80/", "darwin", false, false},
		{"opaque", "mygo:" + scope, "darwin", false, false},
		{"webview2 mapping", "http://" + scope + ".mygo.localhost/", "windows", false, true},
		{"other webview2 server", "http://" + other + ".mygo.localhost/", "windows", false, false},
		{"webview2 userinfo", "http://user@" + scope + ".mygo.localhost/", "windows", false, false},
		{"webview2 port", "http://" + scope + ".mygo.localhost:80/", "windows", false, false},
		{"webview2 on macOS", "http://" + scope + ".mygo.localhost/", "darwin", false, false},
		{"dev server", "http://localhost:1420/", "darwin", true, true},
		{"production dev server", "http://localhost:1420/", "darwin", false, false},
		{"other dev port", "http://localhost:1421/", "darwin", true, false},
		{"dev userinfo", "http://user@localhost:1420/", "darwin", true, false},
		{"external", "https://example.test/", "darwin", true, false},
		{"blank", "about:blank", "darwin", false, false},
	} {
		t.Run(test.name, func(t *testing.T) {
			if got := host.TrustedPageURL(test.raw, scope, test.development, test.platform); got != test.allowed {
				t.Fatalf("page origin permission = %v, want %v", got, test.allowed)
			}
		})
	}
	for _, invalid := range []string{"", "scope", scope + ":80", "0123456789ABCDEF0123456789ABCDEF"} {
		if host.TrustedPageURL("mygo://"+invalid+"/", invalid, true, "darwin") || host.TrustedPageURL("http://localhost:1420/", invalid, true, "darwin") {
			t.Fatalf("accepted invalid server scope %q", invalid)
		}
	}
}
