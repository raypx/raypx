package tests

import (
	"bytes"
	"database/sql"
	"errors"
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

func testSessionKey(bool) ([]byte, error) {
	return bytes.Repeat([]byte{0x42}, 32), nil
}

func TestSessionSubprocess(t *testing.T) {
	directory := os.Getenv("RAYPX_TEST_SESSION_DIRECTORY")
	if directory == "" {
		return
	}
	store, err := host.OpenSessions(directory, testSessionKey)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	value, err := store.Server("one").Load()
	if err != nil || string(value) != "synthetic-session" {
		t.Fatal("Session was not restored by a new process")
	}
}

func TestSQLiteSessionsSurviveProcessRestartAndIsolateServers(t *testing.T) {
	directory := t.TempDir()
	store, err := host.OpenSessions(directory, testSessionKey)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := store.Server("one").Save([]byte("synthetic-session")); err != nil {
		t.Fatal(err)
	}
	if value, err := store.Server("two").Load(); err != nil || value != nil {
		t.Fatal("Session escaped server scope")
	}
	child := exec.Command(os.Args[0], "-test.run=^TestSessionSubprocess$")
	child.Env = append(os.Environ(), "RAYPX_TEST_SESSION_DIRECTORY="+directory)
	if err := child.Run(); err != nil {
		t.Fatal("Independent session reader failed")
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	if err := store.Server("one").Save([]byte("closed")); err == nil {
		t.Fatal("Closed database reported a successful write")
	}
	// Windows cannot rename an open SQLite file; this also checks connection release.
	path := filepath.Join(directory, "sessions.sqlite")
	if err := os.Rename(path, path+".closed"); err != nil {
		t.Fatal("Closed database retained handles")
	}
}

func TestSessionCiphertextRejectsTamperingAndScopeSwap(t *testing.T) {
	directory := t.TempDir()
	store, err := host.OpenSessions(directory, testSessionKey)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	token := []byte("synthetic-token-must-not-appear-in-sqlite")
	if err := store.Server("one").Save(token); err != nil {
		t.Fatal(err)
	}
	db, err := sql.Open("sqlite", filepath.Join(directory, "sessions.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	var ciphertext []byte
	var kind string
	if err := db.QueryRow("SELECT typeof(cookies), cookies FROM sessions WHERE scope='one'").Scan(&kind, &ciphertext); err != nil {
		t.Fatal(err)
	}
	if kind != "blob" || bytes.Contains(ciphertext, token) {
		t.Fatal("Session was not stored as ciphertext")
	}
	if _, err := db.Exec("INSERT INTO sessions(scope, cookies) VALUES('two', ?)", ciphertext); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Server("two").Load(); err == nil {
		t.Fatal("Restored ciphertext under a different server scope")
	}
	ciphertext[len(ciphertext)-1] ^= 1
	if _, err := db.Exec("UPDATE sessions SET cookies=? WHERE scope='one'", ciphertext); err != nil {
		t.Fatal(err)
	}
	if _, err := store.Server("one").Load(); err == nil {
		t.Fatal("Restored modified ciphertext")
	}
}

func TestPlaintextSessionUpgradeRequiresSignInAndClearsDatabase(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "sessions.sqlite")
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatal(err)
	}
	token := "synthetic-old-plaintext-session"
	if _, err := db.Exec("PRAGMA journal_mode=WAL; CREATE TABLE sessions (scope TEXT PRIMARY KEY, cookies TEXT NOT NULL); PRAGMA user_version=1"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec("INSERT INTO sessions VALUES('one', ?), ('two', ?)", token, token); err != nil {
		t.Fatal(err)
	}
	if err := db.Close(); err != nil {
		t.Fatal(err)
	}
	store, err := host.OpenSessions(directory, testSessionKey)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	for _, scope := range []string{"one", "two"} {
		if value, err := store.Server(scope).Load(); err != nil || value != nil {
			t.Fatal("Restored a plaintext session")
		}
	}
	for _, name := range []string{path, path + "-wal"} {
		data, err := os.ReadFile(name)
		if err != nil {
			t.Fatal(err)
		}
		if bytes.Contains(data, []byte(token)) {
			t.Fatal("Upgrade retained plaintext in a live database file")
		}
	}
	if err := store.Server("one").Save([]byte("new-session")); err != nil {
		t.Fatal(err)
	}
}

func TestUnavailableSessionKeyPreservesStoredSessions(t *testing.T) {
	directory := t.TempDir()
	store, err := host.OpenSessions(directory, testSessionKey)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Server("one").Save([]byte("[]")); err != nil {
		t.Fatal(err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	unavailable, err := host.OpenSessions(directory, func(create bool) ([]byte, error) {
		if create {
			t.Fatal("Attempted to replace the key for an encrypted session")
		}
		return nil, errors.New("vault unavailable")
	})
	if err != nil {
		t.Fatal(err)
	}
	origin, _ := url.Parse("https://example.test")
	jar, err := host.OpenCookies(origin.String(), unavailable.Server("one"))
	if err != nil || jar.Recovery != "temporary" {
		t.Fatal("Unavailable key did not fall back to memory")
	}
	change, _ := host.ParseCookie(origin, "__Secure-better-auth.session_token=temporary; Path=/; Secure; HttpOnly; Max-Age=3600", time.Now())
	if err := jar.Apply([]host.CookieChange{*change}); err != nil {
		t.Fatal(err)
	}
	if header, err := jar.Header(origin); err != nil || !strings.Contains(header, "=temporary") {
		t.Fatal("Temporary sign-in did not work")
	}
	if err := unavailable.Close(); err != nil {
		t.Fatal(err)
	}
	restored, err := host.OpenSessions(directory, testSessionKey)
	if err != nil {
		t.Fatal(err)
	}
	defer restored.Close()
	if value, err := restored.Server("one").Load(); err != nil || string(value) != "[]" {
		t.Fatal("Temporary sign-in modified the encrypted session")
	}
}

func TestSQLiteCookiesPersistLogoutAndResetInvalidSessions(t *testing.T) {
	directory := t.TempDir()
	open := func() *host.Sessions {
		t.Helper()
		store, err := host.OpenSessions(directory, testSessionKey)
		if err != nil {
			t.Fatal(err)
		}
		return store
	}
	rows := func() (count int) {
		t.Helper()
		db, err := sql.Open("sqlite", filepath.Join(directory, "sessions.sqlite"))
		if err != nil {
			t.Fatal(err)
		}
		defer db.Close()
		if err := db.QueryRow("SELECT count(*) FROM sessions").Scan(&count); err != nil {
			t.Fatal(err)
		}
		return count
	}
	store := open()
	origin, _ := url.Parse("https://example.test")
	jar, err := host.OpenCookies(origin.String(), store.Server("scope"))
	if err != nil || jar.Recovery != "" {
		t.Fatal("Session initialization failed")
	}
	change, _ := host.ParseCookie(origin, "__Secure-better-auth.session_token=synthetic-token; Path=/; Secure; HttpOnly; Max-Age=3600", time.Now())
	if err := jar.Apply([]host.CookieChange{*change}); err != nil {
		t.Fatal(err)
	}
	store.Close()
	store = open()
	restored, err := host.OpenCookies(origin.String(), store.Server("scope"))
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
	if rows() != 0 {
		t.Fatal("Logout left a stored session")
	}
	loggedOut, err := host.OpenCookies(origin.String(), store.Server("scope"))
	if err != nil {
		t.Fatal(err)
	}
	if header, _ := loggedOut.Header(origin); header != "" {
		t.Fatal("Logout did not persist")
	}
	// A cookie for another host is never restored, and the invalid row is cleared.
	for _, invalid := range []string{"not json", `[{"name":"better-auth.session_token","value":"x","domain":"other.test","path":"/","secure":true,"httpOnly":true,"sameSite":"lax"}]`} {
		if err := store.Server("scope").Save([]byte(invalid)); err != nil {
			t.Fatal(err)
		}
		reset, err := host.OpenCookies(origin.String(), store.Server("scope"))
		if err != nil || reset.Recovery != "reset" {
			t.Fatal("Invalid session did not request login")
		}
		if header, _ := reset.Header(origin); header != "" {
			t.Fatal("Invalid session was restored")
		}
		if rows() != 0 {
			t.Fatal("Invalid session was kept")
		}
	}
	store.Close()
}

func TestSessionStorageFailureNeverClaimsPersistence(t *testing.T) {
	directory := t.TempDir()
	store, err := host.OpenSessions(directory, testSessionKey)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	origin, _ := url.Parse("https://example.test")
	if err := store.Server("scope").Save([]byte("[]")); err != nil {
		t.Fatal(err)
	}
	jar, err := host.OpenCookies(origin.String(), store.Server("scope"))
	if err != nil || jar.Recovery != "" {
		t.Fatal("Session initialization failed")
	}
	db, err := sql.Open("sqlite", filepath.Join(directory, "sessions.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	if _, err := db.Exec("CREATE TRIGGER fail_session BEFORE UPDATE ON sessions BEGIN SELECT RAISE(ABORT, 'test failure'); END"); err != nil {
		t.Fatal(err)
	}
	change, _ := host.ParseCookie(origin, "__Secure-better-auth.session_token=synthetic-token; Path=/; Secure; HttpOnly; Max-Age=3600", time.Now())
	if err := jar.Apply([]host.CookieChange{*change}); err == nil {
		t.Fatal("Failed transaction reported success")
	}
	if _, err := jar.Header(origin); err == nil {
		t.Fatal("Session transport continued after a failed write")
	}
	if value, _ := store.Server("scope").Load(); string(value) != "[]" {
		t.Fatal("Failed write changed the stored session")
	}
	store.Close()
	temporary, err := host.OpenCookies(origin.String(), store.Server("scope"))
	if err != nil || temporary.Recovery != "temporary" {
		t.Fatal("Unreadable storage was reported as durable")
	}
	if err := temporary.Apply([]host.CookieChange{*change}); err != nil {
		t.Fatal("Temporary session rejected sign-in")
	}
	if header, _ := temporary.Header(origin); !strings.Contains(header, "synthetic-token") {
		t.Fatal("Temporary session lost its in-memory cookie")
	}
}

func TestSessionsRejectCorruptionUnknownVersionsAndUnsafePaths(t *testing.T) {
	for _, state := range []string{"corrupt", "unknown", "unmanaged", "directory"} {
		t.Run(state, func(t *testing.T) {
			directory := t.TempDir()
			path := filepath.Join(directory, "sessions.sqlite")
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
			if store, err := host.OpenSessions(directory, testSessionKey); err == nil {
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
		if err := os.Symlink(target, filepath.Join(directory, "sessions.sqlite")); err != nil {
			t.Fatal(err)
		}
		if store, err := host.OpenSessions(directory, testSessionKey); err == nil {
			store.Close()
			t.Fatal("Symlink accepted")
		}
		info, _ := os.Stat(target)
		if info.Mode().Perm() != 0644 {
			t.Fatal("Followed a symlink while protecting sessions")
		}
	}
}

func TestSessionDatabaseAndAuxiliaryPermissions(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("DACL is verified by the Windows ACL suite")
	}
	directory := t.TempDir()
	store, err := host.OpenSessions(directory, testSessionKey)
	if err != nil {
		t.Fatal(err)
	}
	defer store.Close()
	if err := store.Server("scope").Save([]byte("[]")); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"sessions.sqlite", "sessions.sqlite-wal", "sessions.sqlite-shm"} {
		info, err := os.Stat(filepath.Join(directory, name))
		if err != nil || info.Mode().Perm() != 0600 {
			t.Fatalf("Session file is not private: %s", name)
		}
	}
	info, _ := os.Stat(directory)
	if info.Mode().Perm() != 0700 {
		t.Fatal("Session directory is not private")
	}
}
