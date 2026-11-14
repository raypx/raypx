package desktop

import (
	"context"
	"database/sql"
	"encoding/json"
	"sync"
	"sync/atomic"
	"time"
)

type UI interface {
	IsVisible() bool
	Hide() bool
	PickDirectory() (string, error)
	OpenExternal(string) error
}

// DeviceConfirmation is display-only metadata resolved by the bundled connector.
// The renderer cannot provide the origin, account, Space name or directory.
type DeviceConfirmation struct {
	ServerOrigin string
	AccountLabel string
	SpaceLabel   string
	DeviceName   string
	Directory    string
}

type DeviceConfirmationUI interface {
	ConfirmDevicePairing(DeviceConfirmation) (bool, error)
	ConfirmDeviceDirectoryGrant(DeviceConfirmation) (bool, error)
}

type DeviceNative func(context.Context, JSON) (JSON, error)

type CLIConfig struct {
	Binary  string
	Version string
	Args    []string
}
type Options struct {
	CLI             CLIConfig
	Client          NativeClient
	SessionKey      SessionKey
	ResetSessionKey SessionReset
	PageOrigin      string
	DeviceNative    DeviceNative
}
type Desktop struct {
	closeOnce      sync.Once
	admission      sync.Mutex
	closing        bool
	requests       sync.WaitGroup
	lifetime       context.Context
	cancel         context.CancelFunc
	Config         Config
	Client         NativeClient
	Preferences    *Preferences
	UI             UI
	Tray           atomic.Bool
	cli            CLIConfig
	deviceNative   DeviceNative
	deviceConfirm  sync.Mutex
	devicePoll     sync.Mutex
	devicePollNext time.Time
	instance       *sql.Conn
	database       *sql.DB
	lease          sync.Mutex
	visible        bool
	stopped        atomic.Bool
	RecoverSession func() bool
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
		daemon := NewDaemonClient(cli, config, pageOrigin, options.SessionKey)
		daemon.resetKey = options.ResetSessionKey
		client = daemon
	}
	lifetime, cancel := context.WithCancel(context.Background())
	desktop := &Desktop{Config: config, Client: client, cli: cli, Preferences: OpenPreferences(directory), database: db, instance: instance, lifetime: lifetime, cancel: cancel}
	desktop.deviceNative = options.DeviceNative
	if desktop.deviceNative == nil {
		desktop.deviceNative = desktop.runDeviceNative
	}
	return desktop, nil
}

func (d *Desktop) Preload() string {
	config, _ := json.Marshal(JSON{"apiUrl": d.Config.APIURL, "webUrl": d.Config.WebURL})
	prefs, _ := json.Marshal(d.Preferences.Snapshot())
	encodedConfig, _ := json.Marshal(string(config))
	encodedPrefs, _ := json.Marshal(string(prefs))
	return "(()=>{function freeze(v){if(v&&typeof v==='object'){Object.values(v).forEach(freeze);Object.freeze(v)}}const c=JSON.parse(" + string(encodedConfig) + "),p=JSON.parse(" + string(encodedPrefs) + ");freeze(c);freeze(p);Object.defineProperties(window,{__raypxConnection:{value:c},__raypxDevicePreferences:{value:p},__raypxDesktopHost:{value:'mygo'}})})();"
}

func (d *Desktop) Runtime() JSON {
	return JSON{"appVersion": d.cli.Version, "platform": platformName(), "trayEnabled": d.Tray.Load(), "engine": d.Client.Status(), "compiledFeatures": compiledFeatures()}
}
