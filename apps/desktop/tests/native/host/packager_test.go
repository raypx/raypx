package tests

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"testing"

	host "raypx.local/desktop/internal/desktop"
)

// Signing changes bytes after the downloaded distribution was verified. Test the
// maintained packager hook directly, before an enclosing app/installer seals it.
func TestPackagerRecordsSignedHerdrBytes(t *testing.T) {
	helper, err := os.ReadFile("../../../scripts/native/packager-herdr.go.txt")
	if err != nil {
		t.Fatal(err)
	}
	directory := t.TempDir()
	source := `package main
import("crypto/sha256";"encoding/hex";"encoding/json";"fmt";"os";"path/filepath";"strings")
` + string(helper) + `
func main(){if err:=raypxRefreshHerdr(os.Args[1]);err!=nil{fmt.Fprintln(os.Stderr,err);os.Exit(1)}}`
	main := filepath.Join(directory, "main.go")
	if err := os.WriteFile(main, []byte(source), 0600); err != nil {
		t.Fatal(err)
	}
	binary := filepath.Join(directory, "refresh")
	if runtime.GOOS == "windows" {
		binary += ".exe"
	}
	build := host.Command("go", "build", "-o", binary, main)
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build packager hook: %v %s", err, output)
	}
	resources := filepath.Join(directory, "resources")
	herdr := filepath.Join(resources, "bin", "herdr")
	if err := os.MkdirAll(herdr, 0700); err != nil {
		t.Fatal(err)
	}
	signed := []byte("executable bytes after native signing")
	if err := os.WriteFile(filepath.Join(herdr, "herdr"), signed, 0600); err != nil {
		t.Fatal(err)
	}
	manifest := filepath.Join(herdr, "runtime.json")
	if err := os.WriteFile(manifest, []byte(`{"version":"fixture","files":{"herdr":"before-signing"}}`), 0600); err != nil {
		t.Fatal(err)
	}
	if output, err := host.Command(binary, resources).CombinedOutput(); err != nil {
		t.Fatalf("refresh signed runtime: %v %s", err, output)
	}
	var updated struct {
		Version string
		Files   map[string]string
	}
	data, err := os.ReadFile(manifest)
	if err != nil || json.Unmarshal(data, &updated) != nil {
		t.Fatal("Missing updated manifest")
	}
	hash := sha256.Sum256(signed)
	if updated.Version != "fixture" || updated.Files["herdr"] != hex.EncodeToString(hash[:]) {
		t.Fatal("Signed bytes were not stamped")
	}
	if err := os.WriteFile(manifest, []byte(`{"version":"fixture","files":{"../../../outside":"bad"}}`), 0600); err != nil {
		t.Fatal(err)
	}
	if host.Command(binary, resources).Run() == nil {
		t.Fatal("Packager accepted a resource escape")
	}
}
