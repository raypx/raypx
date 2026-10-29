package tests

import (
	"bytes"
	host "raypx.local/desktop/internal/desktop"
	"testing"
)

func TestWindowsSessionKeyRetainsKeyringPasswordFormat(t *testing.T) {
	name := "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
	if host.WindowsSessionTarget(name) != name+".com.raypx.desktop.session.v2" {
		t.Fatal("Legacy keyring identity changed")
	}
	// Captured keyring 4 password representation: UTF-16LE without a terminator.
	legacy := []byte{'A', 0, 'Q', 0, 'I', 0, 'D', 0, 'B', 0, 'A', 0, '=', 0, '=', 0}
	password, err := host.DecodeWindowsSessionPassword(legacy)
	if err != nil || string(password) != "AQIDBA==" {
		t.Fatal("Legacy keyring password cannot be read")
	}
	encoded, err := host.EncodeWindowsSessionPassword(password)
	if err != nil || !bytes.Equal(encoded, legacy) {
		t.Fatal("Keyring password encoding changed")
	}
	for _, bad := range [][]byte{{1}, {'A', 1}, {0xff, 0}, make([]byte, 1026)} {
		if _, err := host.DecodeWindowsSessionPassword(bad); err == nil {
			t.Fatal("Invalid key encoding accepted")
		}
	}
}
