//go:build native_smoke && windows

package app

import (
	"errors"
	"github.com/Microsoft/go-winio"
	"net"
	"strings"
)

func smokeListener(endpoint string) (net.Listener, error) {
	if !strings.HasPrefix(endpoint, `\\.\pipe\raypx-native-smoke-`) {
		return nil, errors.New("Invalid smoke pipe")
	}
	return winio.ListenPipe(endpoint, &winio.PipeConfig{SecurityDescriptor: "D:P(A;;GA;;;OW)"})
}
