package desktop

import (
	"errors"
	"os"
	"path/filepath"
)

// Validate before config, credentials or instance ownership can touch a profile.
func ValidateSmokeProfile(directory, config string) error {
	invalid := errors.New("Native smoke requires an owned isolated data and config directory")
	if !filepath.IsAbs(directory) || !filepath.IsAbs(config) || filepath.Clean(config) != filepath.Join(directory, "config") {
		return invalid
	}
	plain := func(path string, dir bool) bool {
		info, err := os.Lstat(path)
		return err == nil && info.Mode()&os.ModeSymlink == 0 && info.IsDir() == dir
	}
	marker := filepath.Join(directory, ".native-smoke-session-owner")
	if !plain(directory, true) || !plain(config, true) || !plain(marker, false) {
		return invalid
	}
	raw, err := ReadBounded(marker, 64)
	if err != nil || string(raw) != "raypx-native-smoke-v1\n" {
		return invalid
	}
	return nil
}
