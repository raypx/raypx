package app

import (
	"context"
	"errors"
	"runtime"
	"sync"

	"github.com/egoist/mygo"
	host "raypx.local/desktop/internal/desktop"
)

type Bridge struct {
	mu      sync.RWMutex
	desktop *host.Desktop
	window  *mygo.Window
	scope   string
}

func (b *Bridge) attach(desktop *host.Desktop, window *mygo.Window, scope string) {
	b.mu.Lock()
	b.desktop, b.window, b.scope = desktop, window, scope
	b.mu.Unlock()
}
func (b *Bridge) detach() {
	b.mu.Lock()
	window := b.window
	b.desktop, b.window, b.scope = nil, nil, ""
	b.mu.Unlock()
	if window != nil {
		window.Hide()
		// Destroy cancels the page context, including API requests and streams,
		// before releasing native state or the cross-version instance lock.
		window.Destroy()
	}
}
func (b *Bridge) caller(ctx context.Context) (*host.Desktop, error) {
	b.mu.RLock()
	desktop, window, scope := b.desktop, b.window, b.scope
	b.mu.RUnlock()
	w := mygo.CallerWindow(ctx)
	if desktop == nil || w == nil || w != window || mygo.CallerPage(ctx) != w.Page() || !trustedURL(w.Page().URL(), scope) {
		return nil, errors.New("Untrusted desktop view")
	}
	return desktop, nil
}
func trustedURL(raw, scope string) bool {
	return host.TrustedPageURL(raw, scope, mygo.IsDev(), runtime.GOOS)
}
func (b *Bridge) Request(ctx context.Context, method string, input host.JSON) (any, error) {
	desktop, err := b.caller(ctx)
	if err != nil {
		return nil, err
	}
	return desktop.Request(ctx, method, input)
}
func (b *Bridge) Subscribe(ctx context.Context, ch *mygo.Channel[host.JSON]) error {
	desktop, err := b.caller(ctx)
	if err != nil {
		return err
	}
	off := desktop.Events.Subscribe(ch.Send)
	defer off()
	if err := ch.Send(host.JSON{"ready": true}); err != nil {
		return err
	}
	<-ctx.Done()
	return nil
}
func (b *Bridge) Acknowledge(ctx context.Context, sequence uint64) (bool, error) {
	desktop, err := b.caller(ctx)
	if err != nil {
		return false, err
	}
	return desktop.Events.Acknowledge(sequence), nil
}

type nativeUI struct{ window *mygo.Window }

func (b *nativeUI) IsVisible() bool { return b.window.IsVisible() && !b.window.IsMinimized() }
func (b *nativeUI) Hide() bool      { b.window.Hide(); return !b.window.IsVisible() }
func (b *nativeUI) PickDirectory() (string, error) {
	paths, err := mygo.Dialog.Open(mygo.OpenDialogOptions{Parent: b.window, Directory: true})
	if err != nil {
		return "", errors.New("Directory picker unavailable")
	}
	if len(paths) == 0 {
		return "", nil
	}
	return paths[0], nil
}
func (b *nativeUI) OpenExternal(raw string) error { return mygo.Shell.OpenExternal(raw) }
