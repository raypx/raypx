package tests

import (
	"os"
	"path/filepath"
	host "raypx.local/desktop/internal/desktop"
	"testing"
)

func TestSmokeRequiresOwnedProfileBeforeOpeningNativeState(t *testing.T) {
	directory := t.TempDir()
	config := filepath.Join(directory, "config")
	if err := os.Mkdir(config, 0700); err != nil {
		t.Fatal(err)
	}
	marker := filepath.Join(directory, ".native-smoke-session-owner")
	if host.ValidateSmokeProfile(directory, config) == nil {
		t.Fatal("Unowned profile accepted")
	}
	if err := os.WriteFile(marker, []byte("raypx-native-smoke-v1\n"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := host.ValidateSmokeProfile(directory, config); err != nil {
		t.Fatal(err)
	}
	for _, row := range [][2]string{{"", config}, {directory, ""}, {"relative", config}, {directory, t.TempDir()}, {directory, filepath.Join(config, "missing")}} {
		if host.ValidateSmokeProfile(row[0], row[1]) == nil {
			t.Fatal("Smoke could fall back to an unrelated native profile")
		}
	}
	if err := os.WriteFile(marker, []byte("unowned"), 0600); err != nil {
		t.Fatal(err)
	}
	if host.ValidateSmokeProfile(directory, config) == nil {
		t.Fatal("Invalid profile marker accepted")
	}
}
