//go:build windows

package app

import (
	"errors"
	"runtime"
	"unsafe"

	"golang.org/x/sys/windows"
	host "raypx.local/desktop/internal/desktop"
)

type SessionKeys struct{}

var credentialDLL = windows.NewLazySystemDLL("advapi32.dll")
var credentialRead = credentialDLL.NewProc("CredReadW")
var credentialWrite = credentialDLL.NewProc("CredWriteW")
var credentialDelete = credentialDLL.NewProc("CredDeleteW")
var credentialFree = credentialDLL.NewProc("CredFree")

type credential struct {
	Flags, Type             uint32
	TargetName, Comment     *uint16
	LastWritten             [2]uint32
	BlobSize                uint32
	Blob                    *byte
	Persist, AttributeCount uint32
	Attributes              uintptr
	TargetAlias, UserName   *uint16
}

func readCredential(target string) ([]byte, error) {
	name, err := windows.UTF16PtrFromString(target)
	if err != nil {
		return nil, errors.New("Invalid session key identity")
	}
	var pointer *credential
	ok, _, code := credentialRead.Call(uintptr(unsafe.Pointer(name)), 1, 0, uintptr(unsafe.Pointer(&pointer)))
	runtime.KeepAlive(name)
	if ok == 0 {
		if errors.Is(code, windows.ERROR_NOT_FOUND) {
			return nil, nil
		}
		return nil, errors.New("Secure session storage unavailable")
	}
	defer credentialFree.Call(uintptr(unsafe.Pointer(pointer)))
	if pointer == nil || pointer.Blob == nil || pointer.BlobSize == 0 {
		return nil, nil
	}
	if pointer.BlobSize > 1024 {
		return nil, errors.New("Invalid secure session value")
	}
	return append([]byte(nil), unsafe.Slice(pointer.Blob, pointer.BlobSize)...), nil
}

func (s SessionKeys) Get(name string) ([]byte, error) {
	blob, err := readCredential(host.WindowsSessionTarget(name))
	if err != nil {
		return nil, err
	}
	if blob != nil {
		defer clear(blob)
		return host.DecodeWindowsSessionPassword(blob)
	}
	// Preserve sessions created by the pre-release MyGo adapter as well.
	value, err := readCredential(host.SessionKeyService + "/" + name)
	if err != nil || value == nil {
		return value, err
	}
	if err := s.Set(name, value); err != nil {
		clear(value)
		return nil, err
	}
	return value, nil
}

func (SessionKeys) Set(name string, value []byte) error {
	target, err := windows.UTF16PtrFromString(host.WindowsSessionTarget(name))
	if err != nil {
		return errors.New("Invalid session key identity")
	}
	user, err := windows.UTF16PtrFromString(name)
	if err != nil {
		return errors.New("Invalid session key identity")
	}
	blob, err := host.EncodeWindowsSessionPassword(value)
	if err != nil || len(blob) == 0 || len(blob) > 1024 {
		return errors.New("Invalid secure session value")
	}
	defer clear(blob)
	entry := credential{Type: 1, TargetName: target, UserName: user, Persist: 3, BlobSize: uint32(len(blob)), Blob: &blob[0]}
	ok, _, _ := credentialWrite.Call(uintptr(unsafe.Pointer(&entry)), 0)
	runtime.KeepAlive(entry)
	runtime.KeepAlive(blob)
	if ok == 0 {
		return errors.New("Unable to save secure session key")
	}
	return nil
}

func (SessionKeys) Delete(name string) error {
	for _, target := range []string{host.WindowsSessionTarget(name), host.SessionKeyService + "/" + name} {
		wide, err := windows.UTF16PtrFromString(target)
		if err != nil {
			return errors.New("Invalid session key identity")
		}
		ok, _, code := credentialDelete.Call(uintptr(unsafe.Pointer(wide)), 1, 0)
		runtime.KeepAlive(wide)
		if ok == 0 && !errors.Is(code, windows.ERROR_NOT_FOUND) {
			return errors.New("Unable to delete secure session key")
		}
	}
	return nil
}
