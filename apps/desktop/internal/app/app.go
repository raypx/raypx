package app

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"io/fs"
	"os"
	"os/signal"
	"path/filepath"
	"runtime"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/egoist/mygo"
	host "raypx.local/desktop/internal/desktop"
)

func Run(bundled fs.FS) error {
	var appVersion string
	metadata, err := fs.ReadFile(bundled, "generated/version.json")
	if err != nil || json.Unmarshal(metadata, &appVersion) != nil {
		return errors.New("Desktop build version missing")
	}
	selfCheck := flag.Bool("self-check", false, "verify artifacts without a GUI or user data")
	cli := flag.String("cli", "", "absolute CLI for the headless artifact check")
	flag.Parse()
	if *selfCheck {
		return check(bundled, *cli, appVersion)
	}
	if *cli != "" {
		return errors.New("CLI overrides are only available for artifact checks")
	}
	if os.Getenv("MYGO_GENERATE") != "" {
		mygo.BindAs("Desktop", &Bridge{})
		return mygo.App.Run()
	}
	if err := validateStartup(); err != nil {
		return err
	}
	config, err := host.LoadConfig()
	if err != nil {
		return err
	}
	directory, err := dataDirectory()
	if err != nil {
		return err
	}
	mygo.App.SetName("Raypx")
	// MyGo activates regular apps at launch; quiet smoke must never take the foreground.
	if !interactive() {
		mygo.App.SetActivationPolicy(mygo.ActivationPolicyAccessory)
	}
	mygo.App.SetPath(mygo.PathUserData, filepath.Join(directory, "webview", config.Scope))
	mygo.App.SetPath(mygo.PathCache, filepath.Join(directory, "cache", config.Scope))
	binary, err := cliBinary()
	if err != nil {
		return err
	}
	// Host initialization blocks on SQLite and the CLI, so it runs off the native event loop.
	var owned atomic.Pointer[host.Desktop]
	bridge := &Bridge{}
	var quitting atomic.Bool
	var confirmingQuit atomic.Bool
	var shutdown sync.Once
	var pendingMu sync.Mutex
	pendingScope := "local"
	finishQuit := func(relaunch bool) {
		shutdown.Do(func() {
			quitting.Store(true)
			go func() {
				bridge.detach()
				if desktop := owned.Load(); desktop != nil {
					desktop.Close()
				}
				if relaunch {
					mygo.App.Relaunch()
				} else {
					mygo.App.Quit()
				}
			}()
		})
	}
	quit := func() { finishQuit(false) }
	requestQuit := func() {
		if quitting.Load() || !confirmingQuit.CompareAndSwap(false, true) {
			return
		}
		go func() {
			defer confirmingQuit.Store(false)
			if desktop := owned.Load(); desktop != nil && interactive() {
				if !confirmQuit(desktop.Client.Native, mygo.Dialog.Message, nativeLanguage(desktop)) {
					return
				}
			}
			quit()
		}()
	}
	mygo.App.OnBeforeQuit(func(e *mygo.QuitEvent) {
		if !quitting.Load() {
			e.PreventDefault()
			requestQuit()
		}
	})
	// Keep the event loop alive while controlled shutdown closes its proxy.
	mygo.App.OnWindowAllClosed(func() {})
	frontend, err := fs.Sub(bundled, "generated/frontend")
	if err != nil {
		return err
	}
	mygo.SetFrontend(frontend)
	mygo.BindAs("Desktop", bridge)
	mygo.App.WhenReady(func() {
		go func() {
			var err error
			desktop, err := host.New(config, directory, host.Options{
				CLI:        host.CLIConfig{Binary: binary, Version: appVersion, Args: smokeArgs()},
				PageOrigin: pageOrigin(config.Scope),
				SessionKey: func(profile string, create bool) ([]byte, error) {
					return loadSessionKey(directory, profile, create)
				},
				ResetSessionKey: func(profile string) ([]byte, error) { return resetSessionKey(directory, profile) },
			})
			if err != nil {
				if interactive() {
					_, _ = mygo.Dialog.Message(mygo.MessageOptions{Title: "Raypx", Type: mygo.MessageError, Message: "Unable to initialize Desktop / 无法启动桌面端"})
				}
				mygo.App.Quit()
				return
			}
			if quitting.Load() {
				desktop.Close()
				return
			}
			if !mygo.WebViewAvailable() {
				if interactive() {
					_, _ = mygo.Dialog.Message(mygo.MessageOptions{Title: "Raypx", Type: mygo.MessageError, Message: "The system WebView is unavailable. Install the WebView runtime required by your operating system. / 系统网页组件不可用，请安装操作系统所需的 WebView 运行时。"})
				}
				desktop.Close()
				quit()
				return
			}
			window := mygo.NewWindow(mygo.WindowOptions{
				Title: "Raypx", URL: "about:blank", TitleBarStyle: mygo.TitleBarHidden,
				Width: 1120, Height: 720, UseContentSize: true, MinWidth: 800, MinHeight: 620, Hidden: true,
				Page: mygo.PageOptions{PreloadScript: desktop.Preload()},
			})
			// MyGo's native minimum describes the outer frame. Keep the same
			// 800 x 620 content-area contract as the previous host.
			frame, content := window.Bounds(), window.ContentBounds()
			window.SetMinimumSize(800+max(0, frame.Width-content.Width), 620+max(0, frame.Height-content.Height))
			window.OnResize(func() {
				content := window.ContentBounds()
				if content.Width < 800 || content.Height < 620 {
					window.SetContentSize(max(800, content.Width), max(620, content.Height))
				}
			})
			bridge.attach(desktop, window, config.Scope)
			if quitting.Load() {
				bridge.detach()
				desktop.Close()
				return
			}
			desktop.UI = &nativeUI{window: window}
			var recovery sync.Mutex
			desktop.RecoverSession = func() bool {
				if quitting.Load() || !recovery.TryLock() {
					return false
				}
				defer recovery.Unlock()
				return recoverDesktopSession(window, desktop)
			}
			show := func() {
				if quitting.Load() {
					return
				}
				window.Restore()
				if interactive() {
					window.Show()
					window.Focus()
				} else {
					window.ShowInactive()
				}
				go desktop.Visible(true)
			}
			pending := func() {
				show()
				pendingMu.Lock()
				scope := pendingScope
				pendingMu.Unlock()
				go func() {
					ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
					defer cancel()
					desktop.OpenApprovals(ctx, scope)
				}()
			}
			menu := mygo.NewMenu([]*mygo.MenuItem{{Label: "Show Raypx", Click: func(*mygo.MenuItem, *mygo.Window) { show() }}, {Label: "Review requests / 处理请求", Click: func(*mygo.MenuItem, *mygo.Window) { pending() }}, {Label: "Hide window", Click: func(*mygo.MenuItem, *mygo.Window) { window.Hide(); go desktop.Visible(false) }}, mygo.Separator(), {Label: "Check for updates / 检查更新", Disabled: !mygo.Updater.Enabled(), Click: func(*mygo.MenuItem, *mygo.Window) { go checkUpdates(window, desktop, finishQuit) }}, {Label: "Quit Raypx", Click: func(*mygo.MenuItem, *mygo.Window) { requestQuit() }}})
			icon, _ := fs.ReadFile(bundled, "resources/tray.png")
			tray, err := mygo.NewTray(mygo.TrayOptions{ID: "main", Icon: icon, IconIsTemplate: true, ToolTip: "Raypx", Menu: menu})
			if err == nil {
				desktop.Tray.Store(true)
				tray.OnClick(show)
			}
			window.OnClose(func(e *mygo.CloseEvent) {
				if quitting.Load() {
					return
				}
				e.PreventDefault()
				if desktop.Tray.Load() {
					window.Hide()
					go desktop.Visible(false)
				} else {
					requestQuit()
				}
			})
			window.OnClosed(func() {
				if !quitting.Load() {
					quit()
				}
			})
			window.OnShow(func() { go desktop.Visible(!window.IsMinimized()) })
			window.OnHide(func() { go desktop.Visible(false) })
			window.OnMinimize(func() { go desktop.Visible(false) })
			window.OnRestore(func() { go desktop.Visible(window.IsVisible()) })
			window.Page().OnWillNavigate(func(e *mygo.NavigateEvent) {
				if !trustedURL(e.URL, config.Scope) {
					e.PreventDefault()
				}
			})
			window.Page().SetWindowOpenHandler(func(req mygo.WindowOpenRequest) *mygo.WindowOptions { return nil })
			window.Page().OnDidFinishLoad(func() {
				if trustedURL(window.Page().URL(), config.Scope) {
					show()
				}
			})
			mygo.App.OnActivate(func(bool) { show() })
			mygo.App.OnNotificationClick(func(string) { pending() })
			var notifications map[string]string
			if data, err := fs.ReadFile(bundled, "generated/notifications.json"); err == nil {
				_ = json.Unmarshal(data, &notifications)
			}
			notificationSlot := make(chan struct{}, 1)
			desktop.Notify = func(scope string) {
				if !interactive() || quitting.Load() {
					return
				}
				pendingMu.Lock()
				pendingScope = scope
				pendingMu.Unlock()
				select {
				case notificationSlot <- struct{}{}:
				default:
					return
				}
				// The first macOS notification waits for permission. Never block
				// CLI event delivery or approval lease responses on that answer.
				go func() {
					defer func() { <-notificationSlot }()
					language := nativeLanguage(desktop)
					notification := mygo.NewNotification(mygo.NotificationOptions{Title: "Raypx", Body: notifications[language]})
					notification.OnClick(pending)
					_ = notification.Show()
				}()
			}
			// Publish only after UI and observer setup: shutdown may read them.
			owned.Store(desktop)
			if quitting.Load() {
				bridge.detach()
				desktop.Close()
				return
			}
			if err := startSmoke(window, tray, desktop, func(action string) {
				switch action {
				case "show":
					show()
				case "hide":
					window.Hide()
					go desktop.Visible(false)
				case "pending":
					pending()
				case "quit":
					quit()
				}
			}); err != nil {
				quit()
				return
			}
			go func() {
				if desktop.Start() && desktop.Client.Status()["sessionRecovery"] == "temporary" && interactive() && !quitting.Load() {
					desktop.RecoverSession()
				}
			}()
			go func() {
				ticker := time.NewTicker(5 * time.Second)
				defer ticker.Stop()
				for range ticker.C {
					if quitting.Load() {
						return
					}
					desktop.UpdateLease()
				}
			}()
			pageURL := "mygo://" + config.Scope + "/"
			if mygo.IsDev() {
				pageURL = "http://localhost:1420/"
			}
			if err := window.Page().LoadURL(pageURL); err != nil {
				quit()
				return
			}

		}()
	})
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(signals)
	go func() { <-signals; quit() }()
	err = mygo.App.Run()
	quitting.Store(true)
	if desktop := owned.Load(); desktop != nil {
		desktop.Close()
	}
	return err
}

func pageOrigin(scope string) string {
	if mygo.IsDev() {
		return "http://localhost:1420"
	}
	if runtime.GOOS == "windows" {
		return "http://" + scope + ".mygo.localhost"
	}
	return "mygo://" + scope
}
