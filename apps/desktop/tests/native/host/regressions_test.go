package tests

import (
	"encoding/json"
	"os"
	host "raypx.local/desktop/internal/desktop"
	"testing"
)

func TestPreloadPreservesJSONKeysWithoutChangingPrototypes(t *testing.T) {
	binary := os.Getenv("RAYPX_MYGO_CLI")
	if binary == "" {
		t.Skip("explicit compiled CLI JavaScript runtime integration gate")
	}
	config, _ := host.ParseConfig(nil)
	desktop, err := host.New(config, t.TempDir(), host.Options{CLI: host.CLIConfig{Binary: "/unstarted-cli", Version: "0.1.0", Args: nil}})
	if err != nil {
		t.Fatal(err)
	}
	defer desktop.Close()
	if !desktop.Preferences.Save(host.JSON{"__proto__": host.JSON{"injected": "kept-as-data"}, "extra": "</script>\u2028"}) {
		t.Fatal("test preferences were not saved")
	}
	script := `globalThis.window={};` + desktop.Preload() + `const raw=window.__raypxDevicePreferences.raw;process.stdout.write(JSON.stringify({own:Object.hasOwn(raw,"__proto__"),clean:Object.getPrototypeOf(raw)===Object.prototype,frozen:Object.isFrozen(raw)&&Object.isFrozen(raw["__proto__"]),extra:raw.extra}));`
	command := host.Command(binary, "--eval", script)
	command.Env = append(command.Environ(), "BUN_BE_BUN=1")
	command.Dir = t.TempDir()
	bytes, err := command.Output()
	if err != nil {
		t.Fatal("compiled runtime could not evaluate native preload")
	}
	var result host.JSON
	if json.Unmarshal(bytes, &result) != nil || result["own"] != true || result["clean"] != true || result["frozen"] != true || result["extra"] != "</script>\u2028" {
		t.Fatalf("preload changed JSON semantics: %s", bytes)
	}
}
