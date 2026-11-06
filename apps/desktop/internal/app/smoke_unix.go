//go:build native_smoke && !windows

package app

import (
	"errors"
	"net"
	"os"
	"path/filepath"
)

func smokeListener(endpoint string) (net.Listener, error) {
	if !filepath.IsAbs(endpoint) {
		return nil, errors.New("Smoke socket must be absolute")
	}
	listener, err := net.Listen("unix", endpoint)
	if err != nil {
		return nil, err
	}
	if err := os.Chmod(endpoint, 0600); err != nil {
		listener.Close()
		return nil, err
	}
	return listener, nil
}
