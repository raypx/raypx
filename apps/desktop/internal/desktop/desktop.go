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
type Desktop struct {
	closeOnce          sync.Once
	admission          sync.Mutex
	closing            bool
	requests           sync.WaitGroup
	lifetime           context.Context
	cancel             context.CancelFunc
	Config             Config
	Engine             *Engine
	Events             *EventStream
	API                *API
	Preferences        *Preferences
	UI                 UI
	Tray               atomic.Bool
	methods            map[string]bool
	instance           *sql.Conn
	database           *sql.DB
	control            sync.Mutex
	account            string
	generation         atomic.Uint64
	authorizationError bool
	lease              sync.Mutex
	active             bool
	visible            bool
	stopped            atomic.Bool
}

func New(config Config, directory, binary, version string, args []string, daemon bool, keys Keys, methods []string) (*Desktop, error) {
	db, instance, err := AcquireInstance(directory)
	if err != nil {
		return nil, err
	}
	jar, err := OpenCookies(filepath.Join(directory, "servers", config.Scope), config.APIURL, keys)
	if err != nil {
		instance.Close()
		db.Close()
		return nil, err
	}
	events := NewEvents()
	lifetime, cancel := context.WithCancel(context.Background())
	d := &Desktop{Config: config, Engine: NewEngine(binary, version, args, daemon, events), Events: events, API: NewAPI(config.APIURL, jar), Preferences: OpenPreferences(directory), methods: map[string]bool{}, database: db, instance: instance, lifetime: lifetime, cancel: cancel}
	for _, method := range methods {
		d.methods[method] = true
	}
	return d, nil
}

func (d *Desktop) Preload() string {
	config, _ := json.Marshal(JSON{"apiUrl": d.Config.APIURL, "webUrl": d.Config.WebURL})
	prefs, _ := json.Marshal(d.Preferences.Snapshot())
	encodedConfig, _ := json.Marshal(string(config))
	encodedPrefs, _ := json.Marshal(string(prefs))
	return "(()=>{function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}}const c=JSON.parse(" + string(encodedConfig) + "),p=JSON.parse(" + string(encodedPrefs) + ");freeze(c);freeze(p);Object.defineProperties(window,{__raypxConnection:{value:c},__raypxDevicePreferences:{value:p},__raypxTerminalHooks:{value:" + map[bool]string{true: "true", false: "false"}[d.Engine.Daemon] + "},__raypxDesktopHost:{value:'mygo'}})})();"
}

func (d *Desktop) Runtime() JSON {
	return JSON{"appVersion": d.Engine.Version, "platform": platformName(), "trayEnabled": d.Tray.Load(), "engine": d.Engine.Status(), "features": d.Engine.Features(), "compiledFeatures": compiledFeatures()}
}
