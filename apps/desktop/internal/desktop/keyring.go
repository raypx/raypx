package desktop

import "errors"

const SessionKeyService = "com.raypx.desktop.session.v2"

// keyring 4 uses user.service on Windows and stores passwords as UTF-16LE.
// MyGo's default is service/user with raw UTF-8; retain the existing identity.
func WindowsSessionTarget(name string) string { return name + "." + SessionKeyService }

func EncodeWindowsSessionPassword(value []byte) ([]byte, error) {
	blob := make([]byte, len(value)*2)
	for i, ch := range value {
		if ch > 127 {
			return nil, errors.New("Invalid session key encoding")
		}
		blob[i*2] = ch
	}
	return blob, nil
}

func DecodeWindowsSessionPassword(blob []byte) ([]byte, error) {
	if len(blob)%2 != 0 || len(blob) > 1024 {
		return nil, errors.New("Invalid session key encoding")
	}
	value := make([]byte, len(blob)/2)
	for i := range value {
		if blob[i*2] > 127 || blob[i*2+1] != 0 {
			return nil, errors.New("Invalid session key encoding")
		}
		value[i] = blob[i*2]
	}
	return value, nil
}
