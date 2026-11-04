package desktop

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

type testEngine struct{ starts, closes, requests int }

func (*testEngine) Status() JSON         { return JSON{"status": "ready"} }
func (*testEngine) Features() JSON       { return JSON{"localTerminalApprovals": false} }
func (e *testEngine) Start() bool        { e.starts++; return true }
func (e *testEngine) ReplaceOwner() bool { return e.Start() }
func (e *testEngine) Close()             { e.closes++ }
func (e *testEngine) Request(_ context.Context, method string, _ any) (any, error) {
	e.requests++
	if method == "files.list" {
		return JSON{"entries": []any{}}, nil
	}
	return nil, errors.New("unexpected test engine request")
}

func TestLocalProfileSelectsBundledCLIWithoutExposingNativeConfig(t *testing.T) {
	for _, profile := range []string{"default", "fresh-profile"} {
		config, err := ParseConfig([]byte("local_profile='" + profile + "'\n"))
		if err != nil || config.LocalProfile != profile {
			t.Fatal("Local profile was not parsed")
		}
		desktop, err := New(config, t.TempDir(), Options{CLI: CLIConfig{Binary: "/never-launched"},
			Engine: func(*EventStream) EngineClient { return &testEngine{} },
		})
		if err != nil {
			t.Fatal(err)
		}
		if !reflect.DeepEqual(desktop.cli.Args, []string{"--profile", profile}) {
			t.Fatal("CLI did not receive the selected profile")
		}
		store := desktop.credentials
		desktop.Close()
		if _, err := store.Keys(config.Scope).Get("closed"); err == nil {
			t.Fatal("Desktop leaked its credential connection")
		}
	}
	for _, source := range []string{"local_profile=42", "local_profile='../other'", "local_profile=''"} {
		if _, err := ParseConfig([]byte(source)); err == nil {
			t.Fatal("Invalid local profile was accepted")
		}
	}
}

type testKeys struct{}

func (testKeys) Get(string) ([]byte, error) { return nil, nil }
func (testKeys) Set(string, []byte) error   { return nil }

func TestDesktopUsesEnginePortAndClosesItOnce(t *testing.T) {
	config, _ := ParseConfig(nil)
	engine := &testEngine{}
	desktop, err := New(config, t.TempDir(), Options{
		CLI:  CLIConfig{Binary: "/never-launched", Version: "test", Daemon: true},
		Keys: testKeys{}, Methods: []string{"files.list", "roots.register"},
		Engine: func(*EventStream) EngineClient { return engine },
	})
	if err != nil {
		t.Fatal(err)
	}
	defer desktop.Close()
	if !desktop.Start() || engine.starts != 1 {
		t.Fatal("engine was not started")
	}
	if desktop.Runtime()["appVersion"] != "test" {
		t.Fatal("lost composition metadata")
	}
	if _, err := desktop.Request(context.Background(), "local_request", JSON{"method": "roots.register", "params": JSON{}}); err == nil {
		t.Fatal("renderer bypassed directory picker")
	}
	if engine.requests != 0 {
		t.Fatal("denied request reached engine")
	}
	if _, err := desktop.Request(context.Background(), "local_request", JSON{"method": "files.list", "params": JSON{}}); err != nil {
		t.Fatal(err)
	}
	if engine.requests != 1 {
		t.Fatal("request was not forwarded once")
	}
	desktop.Close()
	desktop.Close()
	if engine.closes != 1 || desktop.Start() {
		t.Fatal("closed engine was reused")
	}
	if _, err := desktop.Request(context.Background(), "get_runtime", nil); err == nil {
		t.Fatal("closed host admitted a request")
	}
}
