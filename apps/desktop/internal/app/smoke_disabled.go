//go:build !native_smoke

package app

import (
	"github.com/egoist/mygo"
	host "raypx.local/desktop/internal/desktop"
)

func validateStartup() error { return nil }
func smokeDirectory() string { return "" }
func smokeArgs() []string    { return nil }
func interactive() bool      { return true }
func startSmoke(*mygo.Window, *mygo.Tray, *host.Desktop, func(), func(), func(string)) error {
	return nil
}
