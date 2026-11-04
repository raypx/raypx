package desktop

import (
	"context"
	"database/sql"
	"encoding/json"
	"path/filepath"
	"sync"
	"sync/atomic"
)

type UI interface {
	IsVisible() bool
	Hide() bool
	PickDirectory() (string, error)
	OpenExternal(string) error
}

// EngineClient is the host's execution boundary; process framing belongs to Engine.
type EngineClient interface {
	Status() JSON
	Features() JSON
	Request(context.Context, string, any) (any, error)
	Start() bool
	ReplaceOwner() bool
	Close()
}

type CLIConfig struct {
	Binary  string
	Version string
	Args    []string
	Daemon  bool
}

type Options struct {
	CLI     CLIConfig
	Keys    Keys
	Methods []string
	Engine  func(*EventStream) EngineClient
}
type Desktop struct {
	closeOnce          sync.Once
	admission          sync.Mutex
	closing            bool
	requests           sync.WaitGroup
	lifetime           context.Context
	cancel             context.CancelFunc
	Config             Config
	Engine             EngineClient
	Events             *EventStream
	API                *API
	Preferences        *Preferences
	UI                 UI
	Tray               atomic.Bool
	methods            map[string]bool
	cli                CLIConfig
	instance           *sql.Conn
	database           *sql.DB
	credentials        *Credentials
	control            sync.Mutex
	account            string
	generation         atomic.Uint64
	authorizationError bool
	lease              sync.Mutex
	active             bool
	visible            bool
	stopped            atomic.Bool
}

func New(config Config, directory string, options Options) (*Desktop, error) {
	if options.Keys == nil {
		if err := protectCredentials(directory); err != nil {
			return nil, err
		}
	}
	db, instance, err := AcquireInstance(directory)
	if err != nil {
		return nil, err
	}
	var credentials *Credentials
	keys := options.Keys
	if keys == nil {
		credentials, err = OpenCredentials(directory)
		if err != nil {
			instance.Close()
			db.Close()
			return nil, err
		}
		keys = credentials.Keys(config.Scope)
	}
	jar, err := OpenCookies(filepath.Join(directory, "servers", config.Scope), config.APIURL, keys)
	if err != nil {
		if credentials != nil {
			credentials.Close()
		}
		instance.Close()
		db.Close()
		return nil, err
	}
	events := NewEvents()
	cli := options.CLI
	cli.Args = append([]string(nil), cli.Args...)
	if len(cli.Args) == 0 {
		profile := config.LocalProfile
		if profile == "" {
			profile = "default"
		}
		cli.Args = []string{"--profile", profile}
	}
	var engine EngineClient
	if options.Engine != nil {
		engine = options.Engine(events)
	} else {
		engine = NewEngine(cli.Binary, cli.Version, cli.Args, cli.Daemon, events)
	}
	lifetime, cancel := context.WithCancel(context.Background())
	d := &Desktop{Config: config, Engine: engine, cli: cli, Events: events, API: NewAPI(config.APIURL, jar), Preferences: OpenPreferences(directory), methods: map[string]bool{}, database: db, credentials: credentials, instance: instance, lifetime: lifetime, cancel: cancel}
	for _, method := range options.Methods {
		d.methods[method] = true
	}
	return d, nil
}

func (d *Desktop) Preload() string {
	config, _ := json.Marshal(JSON{"apiUrl": d.Config.APIURL, "webUrl": d.Config.WebURL})
	prefs, _ := json.Marshal(d.Preferences.Snapshot())
	encodedConfig, _ := json.Marshal(string(config))
	encodedPrefs, _ := json.Marshal(string(prefs))
	return "(()=>{function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}}const c=JSON.parse(" + string(encodedConfig) + "),p=JSON.parse(" + string(encodedPrefs) + ");freeze(c);freeze(p);Object.defineProperties(window,{__raypxConnection:{value:c},__raypxDevicePreferences:{value:p},__raypxTerminalHooks:{value:" + map[bool]string{true: "true", false: "false"}[d.cli.Daemon] + "},__raypxDesktopHost:{value:'mygo'}})})();"
}

func (d *Desktop) Runtime() JSON {
	return JSON{"appVersion": d.cli.Version, "platform": platformName(), "trayEnabled": d.Tray.Load(), "engine": d.Engine.Status(), "features": d.Engine.Features(), "compiledFeatures": compiledFeatures()}
}
