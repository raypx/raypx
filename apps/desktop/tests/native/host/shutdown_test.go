package tests

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	host "raypx.local/desktop/internal/desktop"
)

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
	desktop, err := host.New(config, directory, host.Options{CLI: host.CLIConfig{Binary: "/unstarted-cli", Version: "0.1.0", Args: nil}, Client: &shutdownNative{}})
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

type blockedShutdownUI struct {
	started chan struct{}
	release chan struct{}
}

func (*blockedShutdownUI) ConfirmDevicePairing(host.DeviceConfirmation) (bool, error) {
	return false, nil
}
func (*blockedShutdownUI) ConfirmDeviceDirectoryGrant(host.DeviceConfirmation) (bool, error) {
	return false, nil
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
	desktop, err := host.New(config, directory, host.Options{CLI: host.CLIConfig{Binary: "/unstarted-cli", Version: "0.1.0", Args: nil}, Client: &shutdownNative{}})
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
		_, err := desktop.Request(context.Background(), "grant_device_directory", host.JSON{"spaceId": "space", "deviceId": "device"})
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

type shutdownNative struct{}

func (*shutdownNative) Status() host.JSON                    { return host.JSON{"status": "ready"} }
func (*shutdownNative) Start() bool                          { return true }
func (*shutdownNative) Refresh() bool                        { return true }
func (*shutdownNative) ResetSessions() bool                  { return true }
func (*shutdownNative) ReplaceOwner() bool                   { return true }
func (*shutdownNative) Close()                               {}
func (*shutdownNative) Channel(context.Context) (any, error) { return nil, nil }
func (*shutdownNative) Native(context.Context, host.JSON) (any, error) {
	return host.JSON{"accountId": "member", "serverOrigin": "https://raypx.com"}, nil
}
