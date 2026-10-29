package app

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"

	"github.com/egoist/mygo"
)

func dataDirectory() (string, error) {
	if directory := smokeDirectory(); directory != "" {
		return directory, nil
	}
	identifier := "com.raypx.desktop"
	if mygo.IsDev() {
		identifier += ".dev"
	}
	if raw := os.Getenv("RAYPX_DESKTOP_DATA_DIR"); raw != "" {
		if !filepath.IsAbs(raw) {
			return "", errors.New("Desktop data path must be absolute")
		}
		return raw, nil
	}
	if runtime.GOOS == "windows" {
		base := os.Getenv("LOCALAPPDATA")
		if base == "" {
			return "", errors.New("Unable to locate application data")
		}
		return filepath.Join(base, identifier, "stable"), nil
	}
	if runtime.GOOS == "darwin" {
		home, err := os.UserHomeDir()
		return filepath.Join(home, "Library", "Application Support", identifier, "stable"), err
	}
	base := os.Getenv("XDG_DATA_HOME")
	if base == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		base = filepath.Join(home, ".local", "share")
	}
	return filepath.Join(base, identifier, "stable"), nil
}
func cliBinary() (string, error) {
	resources, err := mygo.App.Path(mygo.PathResources)
	if err != nil {
		return "", err
	}
	name := "raypx"
	if runtime.GOOS == "windows" {
		name += ".exe"
	}
	return filepath.Abs(filepath.Join(resources, "bin", name))
}
