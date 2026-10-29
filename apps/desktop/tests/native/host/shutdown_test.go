package tests

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	host "raypx.local/desktop/internal/desktop"
)

type shutdownTransport func(*http.Request) (*http.Response, error)

func (f shutdownTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	return f(request)
}

func awaitShutdownSignal(t *testing.T, signal <-chan struct{}, name string) {
	t.Helper()
	select {
	case <-signal:
	case <-time.After(2 * time.Second):
		t.Fatal(name)
	}
}

func requireInstanceHeld(t *testing.T, directory string) {
	t.Helper()
	if database, instance, err := host.AcquireInstance(directory); err == nil {
		_ = instance.Close()
		_ = database.Close()
		t.Fatal("released the instance lock while an old request was still running")
	}
}

func TestDesktopRejectsCanceledAndClosedSaves(t *testing.T) {
	directory := t.TempDir()
	config, _ := host.ParseConfig(nil)
	desktop, err := host.New(config, directory, "/unstarted-cli", "0.1.0", nil, true, &keys{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(desktop.Close)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := desktop.Request(ctx, "save_preferences", host.JSON{"theme": "dark"}); !errors.Is(err, context.Canceled) {
		t.Fatalf("canceled caller was admitted: %v", err)
	}
	desktop.Close()
	if _, err := desktop.Request(context.Background(), "save_preferences", host.JSON{"theme": "light"}); err == nil {
		t.Fatal("a stale desktop pointer saved after shutdown")
	}
	if _, err := os.Stat(filepath.Join(directory, "preferences.json")); !os.IsNotExist(err) {
		t.Fatal("rejected save changed preferences on disk")
	}
	database, instance, err := host.AcquireInstance(directory)
	if err != nil {
		t.Fatal("idle shutdown did not release the instance lock")
	}
	_ = instance.Close()
	_ = database.Close()
}

func TestDesktopCloseCancelsAPIAndDrainsBeforeUnlocking(t *testing.T) {
	started := make(chan struct{})
	serverCanceled := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		close(started)
		<-request.Context().Done()
		close(serverCanceled)
	}))
	t.Cleanup(server.Close)
	config, err := host.ParseConfig([]byte("base_url='" + server.URL + "'"))
	if err != nil {
		t.Fatal(err)
	}
	directory := t.TempDir()
	desktop, err := host.New(config, directory, "/unstarted-cli", "0.1.0", nil, true, &keys{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	release := make(chan struct{})
	var releaseOnce sync.Once
	t.Cleanup(func() {
		releaseOnce.Do(func() { close(release) })
		desktop.Close()
	})
	transport := http.DefaultTransport.(*http.Transport).Clone()
	t.Cleanup(transport.CloseIdleConnections)
	canceled := make(chan struct{})
	desktop.API.Client.Transport = shutdownTransport(func(request *http.Request) (*http.Response, error) {
		response, err := transport.RoundTrip(request)
		if request.Context().Err() != nil {
			close(canceled)
			// Hold the old request after its socket is canceled to exercise
			// draining independently of how quickly the HTTP client returns.
			<-release
		}
		return response, err
	})
	requestDone := make(chan error, 1)
	go func() {
		_, err := desktop.Request(context.Background(), "api_fetch", host.JSON{"path": "/api/auth/get-session", "method": "GET", "headers": host.JSON{}})
		requestDone <- err
	}()
	awaitShutdownSignal(t, started, "loopback request did not start")
	closed := make(chan struct{})
	go func() { desktop.Close(); close(closed) }()
	awaitShutdownSignal(t, canceled, "host shutdown did not cancel the API request")
	awaitShutdownSignal(t, serverCanceled, "loopback server did not observe connection cancellation")
	requireInstanceHeld(t, directory)
	select {
	case <-closed:
		t.Fatal("shutdown returned before the cancellable API request drained")
	default:
	}
	releaseOnce.Do(func() { close(release) })
	select {
	case err := <-requestDone:
		if err == nil {
			t.Fatal("canceled API request reported success")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("canceled API request did not finish")
	}
	awaitShutdownSignal(t, closed, "shutdown did not finish after the API request drained")
	database, instance, err := host.AcquireInstance(directory)
	if err != nil {
		t.Fatal("drained shutdown did not release the instance lock")
	}
	_ = instance.Close()
	_ = database.Close()
}

func TestDesktopCloseCancelsBlockedEngineStart(t *testing.T) {
	config, _ := host.ParseConfig(nil)
	binary, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	desktop, err := host.New(config, t.TempDir(), binary, "0.1.0", []string{"--host-test-mode=handshake-stall"}, true, &keys{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(desktop.Close)
	blocked := make(chan struct{})
	desktop.Events.Observe = func(event host.JSON) {
		if event["event"] == "test.handshakeBlocked" {
			close(blocked)
		}
	}
	started := make(chan bool, 1)
	go func() { started <- desktop.Start() }()
	awaitShutdownSignal(t, blocked, "engine handshake did not start")
	closed := make(chan struct{})
	go func() { desktop.Close(); close(closed) }()
	awaitShutdownSignal(t, closed, "shutdown waited for the blocked engine handshake")
	select {
	case ready := <-started:
		if ready {
			t.Fatal("closed engine completed a stale handshake")
		}
	case <-time.After(2 * time.Second):
		t.Fatal("closed engine handshake did not finish")
	}
}

type blockedShutdownUI struct {
	started chan struct{}
	release chan struct{}
}

func (*blockedShutdownUI) IsVisible() bool           { return false }
func (*blockedShutdownUI) Hide() bool                { return true }
func (*blockedShutdownUI) OpenExternal(string) error { return nil }
func (ui *blockedShutdownUI) PickDirectory() (string, error) {
	close(ui.started)
	<-ui.release
	return "", nil
}

func TestDesktopCloseBoundsDialogWaitAndRetainsLock(t *testing.T) {
	directory := t.TempDir()
	config, _ := host.ParseConfig(nil)
	desktop, err := host.New(config, directory, "/unstarted-cli", "0.1.0", nil, true, &keys{}, nil)
	if err != nil {
		t.Fatal(err)
	}
	ui := &blockedShutdownUI{started: make(chan struct{}), release: make(chan struct{})}
	desktop.UI = ui
	var releaseOnce sync.Once
	t.Cleanup(func() {
		releaseOnce.Do(func() { close(ui.release) })
		desktop.Close()
	})
	requestDone := make(chan error, 1)
	go func() {
		_, err := desktop.Request(context.Background(), "pick_directory", host.JSON{})
		requestDone <- err
	}()
	awaitShutdownSignal(t, ui.started, "directory picker did not start")
	closed := make(chan struct{})
	go func() { desktop.Close(); close(closed) }()
	select {
	case <-closed:
	case <-time.After(5 * time.Second):
		t.Fatal("a native dialog blocked shutdown indefinitely")
	}
	requireInstanceHeld(t, directory)
	if _, err := desktop.Request(context.Background(), "save_preferences", host.JSON{"theme": "dark"}); err == nil {
		t.Fatal("bounded shutdown admitted another save")
	}
	releaseOnce.Do(func() { close(ui.release) })
	select {
	case err := <-requestDone:
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("picker result escaped the canceled host lifetime: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("directory picker did not finish after release")
	}
	deadline := time.Now().Add(2 * time.Second)
	for {
		database, instance, err := host.AcquireInstance(directory)
		if err == nil {
			_ = instance.Close()
			_ = database.Close()
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("background drain did not release the instance lock")
		}
		time.Sleep(10 * time.Millisecond)
	}
}
