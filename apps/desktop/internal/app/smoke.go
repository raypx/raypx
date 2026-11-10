//go:build native_smoke

package app

import (
	"bufio"
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"net"
	"os"
	"regexp"
	"runtime"
	"sync"
	"sync/atomic"
	"time"

	"github.com/egoist/mygo"
	host "raypx.local/desktop/internal/desktop"
)

func validateStartup() error {
	if err := host.ValidateSmokeProfile(smokeDirectory(), os.Getenv("RAYPX_HOME")); err != nil {
		return err
	}
	token := os.Getenv("RAYPX_NATIVE_SMOKE_TOKEN")
	if len(token) < 32 || len(token) > 256 || os.Getenv("RAYPX_NATIVE_SMOKE_SOCKET") == "" {
		return errors.New("Native smoke endpoint is missing")
	}
	return nil
}
func smokeDirectory() string { return os.Getenv("RAYPX_NATIVE_SMOKE_DATA_DIR") }
func smokeArgs() []string {
	return []string{"--profile", "native-smoke", "--data-dir", smokeDirectory()}
}
func interactive() bool { return os.Getenv("RAYPX_NATIVE_SMOKE_UI") == "interactive" }

// startSmoke runs after validateStartup accepted the isolated profile and token.
func startSmoke(window *mygo.Window, tray *mygo.Tray, desktop *host.Desktop, action func(string)) error {
	token := os.Getenv("RAYPX_NATIVE_SMOKE_TOKEN")
	listener, err := smokeListener(os.Getenv("RAYPX_NATIVE_SMOKE_SOCKET"))
	if err != nil {
		return err
	}
	mygo.App.OnBeforeQuit(func(*mygo.QuitEvent) { listener.Close() })
	// Interactive runs wait for focus; quiet runs prove no activation. A background
	// macOS app can make its window key without activating, so count the app there.
	var focuses, activations atomic.Int64
	window.OnFocus(func() { focuses.Add(1) })
	if runtime.GOOS == "darwin" {
		mygo.App.OnDidBecomeActive(func() { activations.Add(1) })
		if !interactive() {
			// ShowInactive still puts a visible window under the pointer.
			// Let real clicks reach the user's app while IPC drives the WebView.
			window.SetIgnoreMouseEvents(true)
		}
	} else {
		window.OnFocus(func() { activations.Add(1) })
	}
	permits := make(chan struct{}, 4)
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			select {
			case permits <- struct{}{}:
				go func() {
					defer func() { conn.Close(); <-permits }()
					ServeSmoke(conn, token, func(ctx context.Context, method string, input host.JSON) (any, error) {
						switch method {
						case "eval":
							script, _ := input["script"].(string)
							if len(script) > 1024*1024 {
								return nil, errors.New("Smoke script exceeds limit")
							}
							return window.Page().EvalContext(ctx, script)
						case "window":
							switch input["action"] {
							case nil:
							case "close":
								window.Close()
							case "resize":
								width, _ := input["width"].(float64)
								height, _ := input["height"].(float64)
								if width < 1 || width > 16384 || height < 1 || height > 16384 {
									return nil, errors.New("Invalid window size")
								}
								window.SetContentSize(int(width), int(height))
							default:
								return nil, errors.New("Unknown window action")
							}
							size := window.ContentBounds()
							bounds := mygo.Rectangle{}
							if tray != nil {
								bounds = tray.Bounds()
							}
							return host.JSON{"visible": window.IsVisible(), "focused": window.IsFocused(), "focuses": focuses.Load(), "activations": activations.Load(), "minimized": window.IsMinimized(), "width": size.Width, "height": size.Height, "trayVisible": desktop.Tray.Load(), "trayBounds": host.JSON{"width": bounds.Width, "height": bounds.Height}}, nil
						case "tray":
							// The tray menu's own actions: show, hide, pending and quit.
							name, _ := input["action"].(string)
							switch name {
							case "show", "hide", "pending":
								action(name)
								// Tray handlers update the approval lease asynchronously; settle it
								// from the real window state so the reply implies the new lease.
								desktop.UpdateLease()
							case "quit":
								// Let the response flush before the event loop shuts down.
								go func() { time.Sleep(50 * time.Millisecond); action("quit") }()
							default:
								return nil, errors.New("Unknown tray action")
							}
							return true, nil
						case "cors":
							return smokeCors(ctx, input)
						}
						return nil, errors.New("Unknown smoke method")
					})
				}()
			default:
				conn.Close()
			}
		}
	}()
	return nil
}

var smokeErrorCode = regexp.MustCompile(`^[A-Z][A-Z0-9_]{0,127}$`)

// ServeSmoke runs the authenticated test-only protocol without a GUI dependency.
func ServeSmoke(conn net.Conn, token string, dispatch func(context.Context, string, host.JSON) (any, error)) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	scanner := bufio.NewScanner(conn)
	scanner.Buffer(make([]byte, 64*1024), host.LineLimit)
	var write sync.Mutex
	permits := make(chan struct{}, 64)
	for {
		_ = conn.SetReadDeadline(time.Now().Add(time.Minute))
		if !scanner.Scan() {
			return
		}
		var request struct {
			Token  string
			ID     string
			Method string
			Input  host.JSON
		}
		if json.Unmarshal(scanner.Bytes(), &request) != nil || subtle.ConstantTimeCompare([]byte(request.Token), []byte(token)) != 1 {
			return
		}
		select {
		case permits <- struct{}{}:
		default:
			return
		}
		go func() {
			defer func() { <-permits }()
			bounded, done := context.WithTimeout(ctx, 30*time.Second)
			defer done()
			value, err := dispatch(bounded, request.Method, request.Input)
			response := host.JSON{"id": request.ID, "ok": err == nil, "value": value}
			if err != nil {
				response["error"] = "Native smoke operation failed: " + request.Method
				if request.Method == "engineRequest" && smokeErrorCode.MatchString(err.Error()) {
					response["error"] = err.Error()
				}
			}
			write.Lock()
			defer write.Unlock()
			_ = conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			_ = json.NewEncoder(conn).Encode(response)
		}()
	}
}
