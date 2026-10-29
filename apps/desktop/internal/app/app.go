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
	"strings"
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
	config, err := host.LoadConfig()
	if err != nil {
		return err
	}
	directory, err := dataDirectory()
	if err != nil {
		return err
	}
	mygo.App.SetName("Raypx")
	mygo.App.SetPath(mygo.PathUserData, filepath.Join(directory, "webview", config.Scope))
	mygo.App.SetPath(mygo.PathCache, filepath.Join(directory, "cache", config.Scope))
	binary, err := cliBinary()
	if err != nil {
		return err
	}
	var methods []string
	data, err := fs.ReadFile(bundled, "generated/local-methods.json")
	if err != nil || json.Unmarshal(data, &methods) != nil {
		return errors.New("Local method manifest missing")
	}
	// Secrets wait for the native event loop, so host initialization runs off its thread.
	var owned atomic.Pointer[host.Desktop]
	bridge := &Bridge{}
	var quitting atomic.Bool
	var shutdown sync.Once
	var pendingMu sync.Mutex
	pendingScope := "local"
	quit := func() {
		shutdown.Do(func() {
			quitting.Store(true)
			go func() {
				bridge.detach()
				if desktop := owned.Load(); desktop != nil {
					desktop.Close()
				}
				mygo.App.Quit()
			}()
		})
	}
	mygo.App.OnBeforeQuit(func(e *mygo.QuitEvent) {
		if !quitting.Load() {
			e.PreventDefault()
			quit()
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
			desktop, err := host.New(config, directory, binary, appVersion, smokeArgs(), runtime.GOOS == "darwin" || runtime.GOOS == "windows", secrets{}, methods)
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
				_, _ = mygo.Dialog.Message(mygo.MessageOptions{Title: "Raypx", Type: mygo.MessageError, Message: "The system WebView is unavailable. Install the WebView runtime required by your operating system. / 系统网页组件不可用，请安装操作系统所需的 WebView 运行时。"})
				desktop.Close()
				quit()
				return
			}
			window := mygo.NewWindow(mygo.WindowOptions{Title: "Raypx", URL: "about:blank", Width: 1120, Height: 720, MinWidth: 800, MinHeight: 620, Hidden: true, Page: mygo.PageOptions{PreloadScript: desktop.Preload()}})
			bridge.attach(desktop, window, config.Scope)
			if quitting.Load() {
				bridge.detach()
				desktop.Close()
				return
			}
			desktop.UI = &nativeUI{window: window}
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
					_ = desktop.Events.Send(ctx, host.JSON{"version": 1, "event": "approval.open", "data": host.JSON{"scope": scope}})
				}()
			}
			menu := mygo.NewMenu([]*mygo.MenuItem{{Label: "Show Raypx", Click: func(*mygo.MenuItem, *mygo.Window) { show() }}, {Label: "Review requests / 处理请求", Click: func(*mygo.MenuItem, *mygo.Window) { pending() }}, {Label: "Hide window", Click: func(*mygo.MenuItem, *mygo.Window) { window.Hide(); go desktop.Visible(false) }}, mygo.Separator(), {Label: "Check for updates / 检查更新", Disabled: !mygo.Updater.Enabled(), Click: func(*mygo.MenuItem, *mygo.Window) { go checkUpdates(window, desktop, quit) }}, {Label: "Quit Raypx", Click: func(*mygo.MenuItem, *mygo.Window) { quit() }}})
			icon, _ := fs.ReadFile(bundled, "resources/tray.png")
			tray, err := mygo.NewTray(mygo.TrayOptions{ID: "main", Icon: icon, IconIsTemplate: true, ToolTip: "Raypx", Menu: menu})
			if err == nil {
				desktop.Tray.Store(true)
				tray.OnClick(show)
			}
			window.OnClose(func(e *mygo.CloseEvent) {
				if desktop.Tray.Load() && !quitting.Load() {
					e.PreventDefault()
					window.Hide()
					go desktop.Visible(false)
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
			desktop.Events.Observe = func(event host.JSON) {
				name, _ := event["event"].(string)
				data, _ := event["data"].(map[string]any)
				_, pendingRequest := data["pendingRequest"].(string)
				if !interactive() || quitting.Load() || (name != "agent.changed" && name != "observed.changed") || !pendingRequest {
					return
				}
				scope := "remote"
				if name == "observed.changed" || data["local"] == true {
					scope = "local"
				}
				pendingMu.Lock()
				pendingScope = scope
				pendingMu.Unlock()
				locale, _ := desktop.Preferences.Read()["locale"].(string)
				if locale == "" || locale == "system" {
					preferred := mygo.App.PreferredLanguages()
					if len(preferred) > 0 {
						locale = preferred[0]
					} else {
						locale = os.Getenv("LANG")
					}
				}
				language := "en"
				if strings.HasPrefix(strings.ToLower(locale), "zh") {
					language = "zh"
				}
				notification := mygo.NewNotification(mygo.NotificationOptions{Title: "Raypx", Body: notifications[language]})
				notification.OnClick(pending)
				_ = notification.Show()
			}
			// Publish only after UI and observer setup: shutdown may read them.
			owned.Store(desktop)
			if quitting.Load() {
				bridge.detach()
				desktop.Close()
				return
			}
			if err := startSmoke(window, tray, desktop, show, pending, func(action string) {
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
			go desktop.Start()
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
			if desktop.API.Cookies.Recovery != "" && interactive() {
				_, _ = mygo.Dialog.Message(mygo.MessageOptions{Parent: window, Title: "Raypx", Message: "Sign in again if your saved session is unavailable. / 登录存储不可用时，请重新登录。"})
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
