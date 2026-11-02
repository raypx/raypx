package tests

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	host "raypx.local/desktop/internal/desktop"
)

func runInstanceFixture(t *testing.T, command *exec.Cmd, operation string) {
	t.Helper()
	if err := command.Start(); err != nil {
		t.Fatalf("instance %s fixture could not start", operation)
	}
	timer := time.AfterFunc(30*time.Second, func() { _ = command.Process.Kill() })
	defer timer.Stop()
	if err := command.Wait(); err != nil {
		t.Fatalf("instance %s fixture failed", operation)
	}
}

func enrollBuiltCLI(t *testing.T, binary, directory, profile string, args []string) {
	t.Helper()
	bun, err := exec.LookPath("bun")
	if err != nil {
		t.Fatal("pinned Bun is required by native instance acceptance")
	}
	fixture, err := filepath.Abs("../fixtures/instance-server.ts")
	if err != nil {
		t.Fatal(err)
	}
	server := host.Command(bun, "run", fixture)
	output, err := server.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err := server.Start(); err != nil {
		t.Fatal("instance API fixture could not start")
	}
	t.Cleanup(func() {
		_ = server.Process.Kill()
		_ = server.Wait()
	})
	type endpoint struct{ Origin string }
	ready := make(chan endpoint, 1)
	go func() {
		var value endpoint
		_ = json.NewDecoder(output).Decode(&value)
		ready <- value
	}()
	var origin string
	select {
	case value := <-ready:
		origin = value.Origin
	case <-time.After(10 * time.Second):
		t.Fatal("instance API fixture did not become ready")
	}
	if origin == "" {
		t.Fatal("instance API fixture returned no origin")
	}
	t.Cleanup(func() {
		// The consuming compiled executable owns the Keychain item, so it also removes it.
		cleanup := host.Command(binary, fixture, "cleanup", filepath.Join(directory, "profiles", profile))
		cleanup.Env = append(os.Environ(), "BUN_BE_BUN=1")
		runInstanceFixture(t, cleanup, "cleanup")
	})
	login := host.Command(binary, append([]string{"login"}, args...)...)
	login.Env = append(os.Environ(), "RAYPX_API_URL="+origin, "RAYPX_WEB_URL="+origin)
	runInstanceFixture(t, login, "enrollment")
}
