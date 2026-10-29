package app

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	host "raypx.local/desktop/internal/desktop"
)

type versionOutput struct{ strings.Builder }

func (v *versionOutput) Write(data []byte) (int, error) {
	if v.Len()+len(data) > 1024 {
		return 0, errors.New("CLI version output exceeds limit")
	}
	return v.Builder.Write(data)
}
func check(bundled fs.FS, binary, appVersion string) error {
	if !filepath.IsAbs(binary) {
		return errors.New("CLI path must be absolute")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	cmd := host.Command(binary, "--version")
	var version versionOutput
	cmd.Stdout = &version
	cmd.Stderr = io.Discard
	cmd.WaitDelay = 500 * time.Millisecond
	if err := cmd.Start(); err != nil {
		return errors.New("Bundled CLI version probe could not start")
	}
	done := make(chan error, 1)
	go func() { done <- cmd.Wait() }()
	select {
	case err := <-done:
		if err != nil || strings.TrimSpace(version.String()) != appVersion {
			return errors.New("Bundled CLI version mismatch")
		}
	case <-ctx.Done():
		_ = cmd.Process.Kill()
		<-done
		return errors.New("CLI version probe timed out")
	}
	index, err := fs.ReadFile(bundled, "generated/frontend/index.html")
	if err != nil {
		return errors.New("Renderer assets missing")
	}
	return json.NewEncoder(os.Stdout).Encode(host.JSON{"framework": "mygo", "version": appVersion, "cliVersion": strings.TrimSpace(version.String()), "indexSha256": host.Digest(string(index)), "platform": runtime.GOOS})
}
