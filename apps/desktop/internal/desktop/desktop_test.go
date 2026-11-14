package desktop

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

type testNative struct{ starts, closes, requests int }

func (*testNative) Status() JSON          { return JSON{"status": "ready"} }
func (c *testNative) Start() bool         { c.starts++; return true }
func (c *testNative) Refresh() bool       { return c.Start() }
func (c *testNative) ResetSessions() bool { return true }
func (c *testNative) ReplaceOwner() bool  { return c.Start() }
func (c *testNative) Close()              { c.closes++ }
func (*testNative) Channel(context.Context) (any, error) {
	return nil, errors.New("test channel unavailable")
}
func (c *testNative) Native(_ context.Context, input JSON) (any, error) {
	c.requests++
	if input["action"] == "notifications" {
		return JSON{"revision": 0.0}, nil
	}
	if input["action"] == "device_connector_context" {
		return JSON{"serverOrigin": "https://raypx.com", "accountId": "member"}, nil
	}
	return true, nil
}
func TestLocalProfileSelectsBundledCLIWithoutOpeningOldSessions(t *testing.T) {
	for _, profile := range []string{"default", "fresh-profile"} {
		config, err := ParseConfig([]byte("local_profile='" + profile + "'\n"))
		if err != nil {
			t.Fatal(err)
		}
		desktop, err := New(config, t.TempDir(), Options{CLI: CLIConfig{Binary: "/never-launched"}, Client: &testNative{}})
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(desktop.cli.Args, []string{"--profile", profile}) {
			t.Fatal("selected profile lost")
		}
		desktop.Close()
	}
	for _, source := range []string{"local_profile=42", "local_profile='../other'", "local_profile=''"} {
		if _, err := ParseConfig([]byte(source)); err == nil {
			t.Fatal("invalid profile accepted")
		}
	}
}
func TestDesktopExposesOnlyNativeUseCases(t *testing.T) {
	config, _ := ParseConfig(nil)
	client := &testNative{}
	desktop, err := New(config, t.TempDir(), Options{CLI: CLIConfig{Binary: "/never-launched", Version: "test"}, Client: client})
	if err != nil {
		t.Fatal(err)
	}
	defer desktop.Close()
	if !desktop.Start() || client.starts != 1 {
		t.Fatal("client not started")
	}
	client.requests = 0
	for _, method := range []string{"local_request", "api_fetch", "control_session", "roots.register", "visible", "notifications", "host.authorize", "release"} {
		if _, err := desktop.Request(context.Background(), method, JSON{}); err == nil {
			t.Fatalf("Go admitted business/private method %s", method)
		}
	}
	if client.requests != 0 {
		t.Fatal("denied method reached IPC")
	}
	if desktop.Runtime()["appVersion"] != "test" {
		t.Fatal("lost metadata")
	}
	desktop.Close()
	desktop.Close()
	if client.closes != 1 || desktop.Start() {
		t.Fatal("closed client reused")
	}
	if _, err := desktop.Request(context.Background(), "get_runtime", nil); err == nil {
		t.Fatal("closed host admitted request")
	}
}
