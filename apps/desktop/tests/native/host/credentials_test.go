package tests

import (
	"database/sql"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	host "raypx.local/desktop/internal/desktop"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestCredentialSubprocess(t *testing.T) {
	directory := os.Getenv("RAYPX_TEST_CREDENTIAL_DIRECTORY")
	if directory == "" {
		return
	}
	store, err := host.OpenCredentials(directory)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	value, err := store.Keys("one").Get("test-key")
	if err != nil || string(value) != "synthetic-key" {
		t.Fatal("Credential was not restored by a new process")
	}
}

func TestSQLiteCredentialsSurviveProcessRestartAndIsolateServers(t *testing.T) {
	directory := t.TempDir()
	store, err := host.OpenCredentials(directory)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := store.Keys("one").Set("test-key", []byte("synthetic-key")); err != nil {
		t.Fatal(err)
	}
	if value, err := store.Keys("two").Get("test-key"); err != nil || value != nil {
		t.Fatal("Session key escaped server scope")
	}
	child := exec.Command(os.Args[0], "-test.run=^TestCredentialSubprocess$")
	child.Env = append(os.Environ(), "RAYPX_TEST_CREDENTIAL_DIRECTORY="+directory)
	if err := child.Run(); err != nil {
		t.Fatal("Independent credential reader failed")
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	if err := store.Keys("one").Set("closed", []byte("value")); err == nil {
		t.Fatal("Closed database reported a successful write")
	}
	// Windows cannot rename an open SQLite file; this also checks connection release.
	path := filepath.Join(directory, "credentials.sqlite")
	if err := os.Rename(path, path+".closed"); err != nil {
		t.Fatal("Closed database retained handles")
	}
}

func TestSQLiteCookieKeysKeepEncryptionLogoutAndMissingKeyRecovery(t *testing.T) {
	directory := t.TempDir()
	open := func() *host.Credentials {
		t.Helper()
		store, err := host.OpenCredentials(directory)
		if err != nil {
			t.Fatal(err)
		}
		return store
	}
	store := open()
	origin, _ := url.Parse("https://example.test")
	sessions := filepath.Join(directory, "servers", "scope")
	jar, err := host.OpenCookies(sessions, origin.String(), store.Keys("scope"))
	if err != nil || jar.Recovery != "" {
		t.Fatal("Session initialization failed")
	}
	change, _ := host.ParseCookie(origin, "__Secure-better-auth.session_token=synthetic-token; Path=/; Secure; HttpOnly; Max-Age=3600", time.Now())
	if err := jar.Apply([]host.CookieChange{*change}); err != nil {
		t.Fatal(err)
	}
	encrypted, _ := os.ReadFile(filepath.Join(sessions, "session-v2.enc"))
	if strings.Contains(string(encrypted), "synthetic-token") {
		t.Fatal("Cookie was stored without encryption")
	}
	store.Close()
	store = open()
	restored, err := host.OpenCookies(sessions, origin.String(), store.Keys("scope"))
	if err != nil {
		t.Fatal(err)
	}
	if header, err := restored.Header(origin); err != nil || !strings.Contains(header, "synthetic-token") {
		t.Fatal("Cookie did not survive restart")
	}
	remove := *change
	remove.Remove = true
	if err := restored.Apply([]host.CookieChange{remove}); err != nil {
		t.Fatal(err)
	}
	loggedOut, err := host.OpenCookies(sessions, origin.String(), store.Keys("scope"))
	if err != nil {
		t.Fatal(err)
	}
	if header, _ := loggedOut.Header(origin); header != "" {
		t.Fatal("Logout did not persist")
	}
	// Recreate an old-format encrypted cookie whose key exists only in the retired store.
	if err := os.WriteFile(filepath.Join(sessions, "session-v2.enc"), encrypted, 0600); err != nil {
		t.Fatal(err)
	}
	store.Close()
	db, err := sql.Open("sqlite", filepath.Join(directory, "credentials.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("DELETE FROM session_keys"); err != nil {
		t.Fatal(err)
	}
	db.Close()
	store = open()
	defer store.Close()
	missing, err := host.OpenCookies(sessions, origin.String(), store.Keys("scope"))
	if err != nil || missing.Recovery != "reset" {
		t.Fatal("Missing old key did not request login")
	}
	if header, _ := missing.Header(origin); header != "" {
		t.Fatal("Unknown cookie identity was restored")
	}
}

func TestCredentialWriteFailureNeverClaimsPersistence(t *testing.T) {
	directory := t.TempDir()
	store, err := host.OpenCredentials(directory)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	db, err := sql.Open("sqlite", filepath.Join(directory, "credentials.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec("CREATE TRIGGER fail_credential BEFORE INSERT ON session_keys BEGIN SELECT RAISE(ABORT, 'test failure'); END"); err != nil {
		t.Fatal(err)
	}
	if err := store.Keys("scope").Set("key", []byte("test")); err == nil {
		t.Fatal("Failed transaction reported success")
	}
	if value, _ := store.Keys("scope").Get("key"); value != nil {
		t.Fatal("Failed write left a credential")
	}
	jar, err := host.OpenCookies(filepath.Join(directory, "sessions"), "https://example.test", store.Keys("scope"))
	if err != nil || jar.Recovery != "temporary" {
		t.Fatal("Failed key write was reported as durable")
	}
}

func TestCredentialsRejectCorruptionUnknownVersionsAndUnsafePaths(t *testing.T) {
	for _, state := range []string{"corrupt", "unknown", "unmanaged", "directory"} {
		t.Run(state, func(t *testing.T) {
			directory := t.TempDir()
			path := filepath.Join(directory, "credentials.sqlite")
			switch state {
			case "corrupt":
				_ = os.WriteFile(path, []byte("not a database"), 0600)
			case "directory":
				_ = os.Mkdir(path, 0700)
			default:
				db, err := sql.Open("sqlite", path)
				if err != nil {
					t.Fatal(err)
				}
				statement := "PRAGMA user_version=99"
				if state == "unmanaged" {
					statement = "CREATE TABLE unrelated(value TEXT)"
				}
				if _, err := db.Exec(statement); err != nil {
					t.Fatal(err)
				}
				db.Close()
			}
			if store, err := host.OpenCredentials(directory); err == nil {
				store.Close()
				t.Fatal("Unsupported storage was accepted")
			}
			if state == "corrupt" {
				data, _ := os.ReadFile(path)
				if string(data) != "not a database" {
					t.Fatal("Corrupted database was replaced")
				}
			}
		})
	}
	if runtime.GOOS != "windows" {
		directory, target := t.TempDir(), filepath.Join(t.TempDir(), "outside")
		if err := os.WriteFile(target, []byte("preserve"), 0644); err != nil {
			t.Fatal(err)
		}
		if err := os.Symlink(target, filepath.Join(directory, "credentials.sqlite")); err != nil {
			t.Fatal(err)
		}
		if store, err := host.OpenCredentials(directory); err == nil {
			store.Close()
			t.Fatal("Symlink accepted")
		}
		info, _ := os.Stat(target)
		if info.Mode().Perm() != 0644 {
			t.Fatal("Followed a symlink while protecting credentials")
		}
	}
}

func TestCredentialDatabaseAndAuxiliaryPermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("DACL is verified by the Windows ACL suite")
	}
	directory := t.TempDir()
	store, err := host.OpenCredentials(directory)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := store.Keys("scope").Set("key", []byte("synthetic")); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"credentials.sqlite", "credentials.sqlite-wal", "credentials.sqlite-shm"} {
		info, err := os.Stat(filepath.Join(directory, name))
		if err != nil || info.Mode().Perm() != 0600 {
			t.Fatalf("Credential file is not private: %s", name)
		}
	}
	info, _ := os.Stat(directory)
	if info.Mode().Perm() != 0700 {
		t.Fatal("Credential directory is not private")
	}
}
