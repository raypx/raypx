//go:build !windows

package app

import (
	"errors"

	"github.com/egoist/mygo"
	host "raypx.local/desktop/internal/desktop"
)

type SessionKeys struct{}

func (SessionKeys) Get(name string) ([]byte, error) {
	value, err := mygo.Secrets.Service(host.SessionKeyService).Get(name)
	if errors.Is(err, mygo.ErrSecretNotFound) {
		return nil, nil
	}
	return value, err
}
func (SessionKeys) Set(name string, value []byte) error {
	return mygo.Secrets.Service(host.SessionKeyService).Set(name, value)
}
func (SessionKeys) Delete(name string) error {
	err := mygo.Secrets.Service(host.SessionKeyService).Delete(name)
	if errors.Is(err, mygo.ErrSecretNotFound) {
		return nil
	}
	return err
}
