package app

import (
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"

	"github.com/egoist/mygo"
)

func sessionKeyName(directory, profileDirectory string) (string, error) {
	canonical, err := filepath.EvalSymlinks(directory)
	if err != nil {
		return "", err
	}
	// Separate data directories have separate instance locks and must not race
	// to initialize the same vault entry. MyGo also scopes it by app identifier.
	profile, err := filepath.EvalSymlinks(profileDirectory)
	if err != nil {
		return "", err
	}
	identity, _ := json.Marshal([]string{canonical, profile})
	return fmt.Sprintf("raypx-desktop-session-v1-%x", sha256.Sum256(identity)), nil
}

func resetSessionKey(directory, profileDirectory string) ([]byte, error) {
	name, err := sessionKeyName(directory, profileDirectory)
	if err != nil {
		return nil, err
	}
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	if err := mygo.Secrets.Set(name, key); err != nil {
		return nil, err
	}
	stored, err := mygo.Secrets.Get(name)
	if err != nil {
		return nil, err
	}
	if !bytes.Equal(stored, key) {
		return nil, errors.New("Session key storage verification failed")
	}
	return key, nil
}

func loadSessionKey(directory, profileDirectory string, create bool) ([]byte, error) {
	name, err := sessionKeyName(directory, profileDirectory)
	if err != nil {
		return nil, err
	}
	key, err := mygo.Secrets.Get(name)
	if !create || !errors.Is(err, mygo.ErrSecretNotFound) {
		return key, err
	}
	return resetSessionKey(directory, profileDirectory)
}
