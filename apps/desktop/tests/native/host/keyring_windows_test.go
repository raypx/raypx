//go:build windows

package tests

import (
	"encoding/base64"
	app "raypx.local/desktop/internal/app"
	host "raypx.local/desktop/internal/desktop"
	"testing"
)

func TestWindowsCredentialManagerSessionRoundTrip(t *testing.T) {
	name := host.Digest(t.TempDir())
	store := app.SessionKeys{}
	t.Cleanup(func() {
		if err := store.Delete(name); err != nil {
			t.Error("Unable to remove the isolated session key")
		}
	})
	value := []byte(base64.StdEncoding.EncodeToString(make([]byte, 32)))
	if err := store.Set(name, value); err != nil {
		t.Fatal("Unable to write the isolated session key")
	}
	actual, err := store.Get(name)
	if err != nil || string(actual) != string(value) {
		t.Fatal("Credential Manager session roundtrip failed")
	}
	if err := store.Delete(name); err != nil {
		t.Fatal("Isolated credential deletion failed")
	}
	missing, err := store.Get(name)
	if err != nil || missing != nil {
		t.Fatal("Deleted credential remained available")
	}
}
