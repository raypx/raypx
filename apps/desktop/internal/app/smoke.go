//go:build native_smoke

package app

import (
	"bufio"
	"context"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
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

func startSmoke(window *mygo.Window, tray *mygo.Tray, desktop *host.Desktop, show, pending func(), action func(string)) error {
	directory := smokeDirectory()
	marker, err := host.ReadBounded(filepath.Join(directory, ".native-smoke-session-owner"), 64)
	if err != nil || !filepath.IsAbs(directory) || string(marker) != "raypx-native-smoke-v1\n" {
		return errors.New("Smoke requires an owned isolated profile")
	}
	token := os.Getenv("RAYPX_NATIVE_SMOKE_TOKEN")
	if len(token) < 32 || len(token) > 256 {
		return errors.New("Invalid smoke token")
	}
	listener, err := smokeListener(os.Getenv("RAYPX_NATIVE_SMOKE_SOCKET"))
	if err != nil {
		return err
	}
	mygo.App.OnBeforeQuit(func(*mygo.QuitEvent) { listener.Close() })
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
						case "runtime":
							return desktop.Runtime(), nil
						case "engineRequest":
							method, _ := input["method"].(string)
							return desktop.Engine.Request(ctx, method, input["params"])
						case "apiRequest":
							return desktop.API.Request(ctx, input, false)
						case "engineReplace":
							return desktop.Engine.ReplaceOwner(), nil
						case "engineStop":
							desktop.Engine.Stop()
							return true, nil
						case "refreshGrant":
							return desktop.RefreshGrant(ctx)
						case "windowState":
							size := window.ContentBounds()
							bounds := mygo.Rectangle{}
							if tray != nil {
								bounds = tray.Bounds()
							}
							return host.JSON{"visible": window.IsVisible(), "focused": window.IsFocused(), "minimized": window.IsMinimized(), "width": size.Width, "height": size.Height, "trayVisible": desktop.Tray.Load(), "trayBounds": host.JSON{"width": bounds.Width, "height": bounds.Height}}, nil
						case "show":
							show()
							return true, nil
						case "hide":
							window.Hide()
							desktop.Visible(false)
							return true, nil
						case "close":
							window.Close()
							return true, nil
						case "resize":
							width, _ := input["width"].(float64)
							height, _ := input["height"].(float64)
							if width < 1 || width > 16384 || height < 1 || height > 16384 {
								return nil, errors.New("Invalid window size")
							}
							window.SetContentSize(int(width), int(height))
							return true, nil
						case "tray":
							name, _ := input["action"].(string)
							action(name)
							return true, nil
						case "quit":
							// Let the response flush before the event loop shuts down.
							go func() { time.Sleep(50 * time.Millisecond); action("quit") }()
							return true, nil
						case "cleanupSessionKeys":
							return cleanupSmokeSessions(directory)
						case "cors":
							return smokeCors(ctx, input)
						case "stream":
							return smokeStream(ctx, window, desktop)
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

func cleanupSmokeSessions(directory string) (int, error) {
	plain := func(path string, directory bool) bool {
		info, err := os.Lstat(path)
		return err == nil && info.Mode()&os.ModeSymlink == 0 && info.IsDir() == directory
	}
	marker := filepath.Join(directory, ".native-smoke-session-owner")
	data, err := host.ReadBounded(marker, 64)
	if err != nil || !filepath.IsAbs(directory) || !plain(directory, true) || !plain(marker, false) || string(data) != "raypx-native-smoke-v1\n" {
		return 0, errors.New("Unsafe smoke profile")
	}
	servers := filepath.Join(directory, "servers")
	count := 0
	if _, err := os.Stat(servers); err == nil {
		if !plain(servers, true) {
			return 0, errors.New("Unsafe server directory")
		}
		entries, err := os.ReadDir(servers)
		if err != nil {
			return 0, err
		}
		for _, entry := range entries {
			name := entry.Name()
			path := filepath.Join(servers, name)
			if len(name) != 32 || strings.Trim(name, "0123456789abcdef") != "" || !plain(path, true) {
				continue
			}
			err := (SessionKeys{}).Delete(host.Digest(filepath.Join(path, "session-v2.enc")))
			if err != nil && !errors.Is(err, mygo.ErrSecretNotFound) {
				return 0, err
			}
			count++
		}
	} else if !os.IsNotExist(err) {
		return 0, err
	}
	return count, host.AtomicWrite(filepath.Join(directory, ".native-smoke-sessions-cleaned"), []byte("true"))
}

func smokeStream(ctx context.Context, window *mygo.Window, desktop *host.Desktop) (any, error) {
	const packets = 640
	const packetBytes = 32 * 1024
	id := fmt.Sprint(time.Now().UnixNano())
	observer := fmt.Sprintf(`const stats=window.__raypxSmokeStreamStats={id:%q,count:0,bytes:0,ordered:true,intact:true}; const listener=e=>{const d=e.detail.event?.data;if(d?.nativeSmokeStream!==stats.id)return;const bytes=atob(d.data);stats.ordered&&=d.streamIndex===stats.count;stats.intact&&=bytes==='x'.repeat(d.rawBytes);stats.count++;stats.bytes+=bytes.length;};window.addEventListener('raypx-smoke-local-event',listener);window.__raypxSmokeStreamRestore=()=>window.removeEventListener('raypx-smoke-local-event',listener);return true`, id)
	if _, err := window.Page().EvalContext(ctx, observer); err != nil {
		return nil, err
	}
	defer window.Page().Eval("window.__raypxSmokeStreamRestore?.()")
	desktop.Events.ResetMetrics()
	started := time.Now()
	ticker := time.NewTicker(2 * time.Second / packets)
	defer ticker.Stop()
	data := base64.StdEncoding.EncodeToString([]byte(strings.Repeat("x", packetBytes)))
	for index := 0; index < packets; index++ {
		select {
		case <-ticker.C:
		case <-ctx.Done():
			return nil, ctx.Err()
		}
		err := desktop.Events.Send(ctx, host.JSON{"version": 1, "event": "terminal.output", "data": host.JSON{"terminalId": "native-smoke-stream", "data": data, "nativeSmokeStream": id, "streamIndex": index, "rawBytes": packetBytes}})
		if err != nil {
			return nil, err
		}
	}
	if err := desktop.Events.Flush(ctx); err != nil {
		return nil, err
	}
	elapsed := time.Since(started)
	renderer, err := window.Page().EvalContext(ctx, "return window.__raypxSmokeStreamStats")
	outstanding, maximum := desktop.Events.Metrics()
	return host.JSON{"renderer": renderer, "packets": packets, "bytes": packets * packetBytes, "elapsedMs": elapsed.Milliseconds(), "bytesPerSecond": float64(packets*packetBytes) / elapsed.Seconds(), "outstandingBytes": outstanding, "maxOutstandingBytes": maximum, "creditBytes": host.CreditBytes}, err
}
