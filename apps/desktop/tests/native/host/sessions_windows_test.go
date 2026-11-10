package tests

import (
	"golang.org/x/sys/windows"
	"path/filepath"
	host "raypx.local/desktop/internal/desktop"
	"testing"
	"unsafe"
)

func TestWindowsSessionACLRestrictsDatabaseAndAuxiliaries(t *testing.T) {
	directory := t.TempDir()
	store, err := host.OpenSessions(directory, testSessionKey)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := store.Server("scope").Save([]byte("[]")); err != nil {
		t.Fatal(err)
	}
	user, err := windows.GetCurrentProcessToken().GetTokenUser()
	if err != nil {
		t.Fatal(err)
	}
	allowed := map[string]bool{user.User.Sid.String(): true, "S-1-5-18": true}
	for _, path := range []string{directory, filepath.Join(directory, "mygo-sessions-v3.sqlite"), filepath.Join(directory, "mygo-sessions-v3.sqlite-wal"), filepath.Join(directory, "mygo-sessions-v3.sqlite-shm")} {
		descriptor, err := windows.GetNamedSecurityInfo(path, windows.SE_FILE_OBJECT, windows.OWNER_SECURITY_INFORMATION|windows.DACL_SECURITY_INFORMATION)
		if err != nil {
			t.Fatal(err)
		}
		owner, _, err := descriptor.Owner()
		if err != nil || !owner.Equals(user.User.Sid) {
			t.Fatal("Session owner is not the current user")
		}
		acl, _, err := descriptor.DACL()
		if err != nil || acl == nil || int(acl.AceCount) != len(allowed) {
			t.Fatal("Session DACL is not restricted")
		}
		for index := uint32(0); index < uint32(acl.AceCount); index++ {
			var ace *windows.ACCESS_ALLOWED_ACE
			if err := windows.GetAce(acl, index, &ace); err != nil {
				t.Fatal(err)
			}
			sid := (*windows.SID)(unsafe.Pointer(&ace.SidStart))
			if ace.Header.AceType != windows.ACCESS_ALLOWED_ACE_TYPE || !allowed[sid.String()] {
				t.Fatal("Session DACL grants an unexpected principal")
			}
			if path == directory && ace.Header.AceFlags&(windows.OBJECT_INHERIT_ACE|windows.CONTAINER_INHERIT_ACE) != windows.OBJECT_INHERIT_ACE|windows.CONTAINER_INHERIT_ACE {
				t.Fatal("Directory ACL does not protect future SQLite files")
			}
		}
	}
}
