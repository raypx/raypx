package app

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"

	"github.com/egoist/mygo"
)

func loadSessionKey(directory, profileDirectory string, create bool) ([]byte, error) {
	canonical, err := filepath.EvalSymlinks(directory)
	if err != nil {
		return nil, err
	}
	// Separate data directories have separate instance locks and must not race
	// to initialize the same vault entry. MyGo also scopes it by app identifier.
	profile, err := filepath.EvalSymlinks(profileDirectory)
	if err != nil {
		return nil, err
	}
	identity, _ := json.Marshal([]string{canonical, profile})
	name := fmt.Sprintf("raypx-desktop-session-v1-%x", sha256.Sum256(identity))
	key, err := mygo.Secrets.Get(name)
	if !create || !errors.Is(err, mygo.ErrSecretNotFound) {
		return key, err
	}
	key = make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		return nil, err
	}
	if err := mygo.Secrets.Set(name, key); err != nil {
		return nil, err
	}
	return key, nil
}
