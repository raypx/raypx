package desktop

import (
	"context"
	"database/sql"
	"encoding/json"
	"runtime"
	"strconv"
	"sync"
	"sync/atomic"
)

type UI interface {
	IsVisible() bool
	Hide() bool
	PickDirectory() (string, error)
	OpenExternal(string) error
}

type CLIConfig struct {
	Binary  string
	Version string
	Args    []string
}
type Options struct {
	CLI        CLIConfig
	Client     NativeClient
	SessionKey SessionKey
	PageOrigin string
}
type Desktop struct {
	closeOnce            sync.Once
	admission            sync.Mutex
	closing              bool
	requests             sync.WaitGroup
	lifetime             context.Context
	cancel               context.CancelFunc
	Config               Config
	Client               NativeClient
	Preferences          *Preferences
	UI                   UI
	Tray                 atomic.Bool
	cli                  CLIConfig
	instance             *sql.Conn
	database             *sql.DB
	lease                sync.Mutex
	visible              bool
	stopped              atomic.Bool
	Notify               func(scope string)
	notificationRevision float64
	notificationBinding  string
}

func New(config Config, directory string, options Options) (*Desktop, error) {
	if err := PrivateDirectory(directory); err != nil {
		return nil, err
	}
	db, instance, err := AcquireInstance(directory)
	if err != nil {
		return nil, err
	}
	cli := options.CLI
	cli.Args = append([]string(nil), cli.Args...)
	if len(cli.Args) == 0 {
		profile := config.LocalProfile
		if profile == "" {
			profile = "default"
		}
		cli.Args = []string{"--profile", profile}
	}
	client := options.Client
	if client == nil {
		pageOrigin := options.PageOrigin
		if pageOrigin == "" {
			pageOrigin = "mygo://" + config.Scope
		}
		client = NewDaemonClient(cli, config, pageOrigin, options.SessionKey)
	}
	lifetime, cancel := context.WithCancel(context.Background())
	return &Desktop{Config: config, Client: client, cli: cli, Preferences: OpenPreferences(directory), database: db, instance: instance, lifetime: lifetime, cancel: cancel}, nil
}

func (d *Desktop) Preload() string {
	config, _ := json.Marshal(JSON{"apiUrl": d.Config.APIURL, "webUrl": d.Config.WebURL})
	prefs, _ := json.Marshal(d.Preferences.Snapshot())
	encodedConfig, _ := json.Marshal(string(config))
	encodedPrefs, _ := json.Marshal(string(prefs))
	return "(()=>{function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}}const c=JSON.parse(" + string(encodedConfig) + "),p=JSON.parse(" + string(encodedPrefs) + ");freeze(c);freeze(p);Object.defineProperties(window,{__raypxConnection:{value:c},__raypxDevicePreferences:{value:p},__raypxTerminalHooks:{value:" + strconv.FormatBool(runtime.GOOS == "darwin" || runtime.GOOS == "windows") + "},__raypxDesktopHost:{value:'mygo'}})})();"
}

func (d *Desktop) Runtime() JSON {
	return JSON{"appVersion": d.cli.Version, "platform": platformName(), "trayEnabled": d.Tray.Load(), "engine": d.Client.Status(), "features": d.Client.Features(), "compiledFeatures": compiledFeatures()}
}
