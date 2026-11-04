package desktop

import (
	"context"
	"crypto/aes"
	"crypto/cipher"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
)

// Sessions owns a short-transaction database, independent of the lifetime instance lock.
// Only server-scoped stores are handed to the cookie jar; values never cross the native boundary.
type Sessions struct {
	database *sql.DB
	cipher   cipher.AEAD
}
type sessionStore struct {
	sessions *Sessions
	scope    string
}

const sessionLimit = 256 * 1024
const sessionKeySize = 32
const encryptedSessionLimit = sessionLimit + 28 // AES-GCM tag and random nonce.

// SessionKey reads the installation's vault key. It may create a key only when
// the database has no encrypted sessions to recover.
type SessionKey func(create bool) ([]byte, error)

func protectSessions(directory string) error {
	if !filepath.IsAbs(directory) {
		return errors.New("Session directory must be absolute")
	}
	if info, err := os.Lstat(directory); err == nil {
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return errors.New("Invalid session directory")
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.MkdirAll(directory, 0700); err != nil {
		return err
	}
	if err := protectPrivatePath(directory, true); err != nil {
		return err
	}
	for _, suffix := range []string{"", "-wal", "-shm", "-journal"} {
		path := filepath.Join(directory, "sessions.sqlite") + suffix
		info, err := os.Lstat(path)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return errors.New("Invalid session database")
		}
		if err := protectPrivatePath(path, false); err != nil {
			return err
		}
	}
	return nil
}

func OpenSessions(directory string, key SessionKey) (*Sessions, error) {
	if err := protectSessions(directory); err != nil {
		return nil, errors.New("Unable to protect session storage")
	}
	db, err := sql.Open("sqlite", filepath.Join(directory, "sessions.sqlite"))
	if err != nil {
		return nil, errors.New("Unable to open session storage")
	}
	db.SetMaxOpenConns(1)
	fail := func() (*Sessions, error) {
		db.Close()
		return nil, errors.New("Unable to initialize session storage")
	}
	if err := db.Ping(); err != nil {
		return fail()
	}
	if err := protectSessions(directory); err != nil {
		return fail()
	}
	conn, err := db.Conn(context.Background())
	if err != nil {
		return fail()
	}
	err = initializeSessions(conn)
	conn.Close()
	if err != nil {
		return fail()
	}
	if err := protectSessions(directory); err != nil {
		return fail()
	}
	sessions := &Sessions{database: db}
	var hasRows bool
	if key != nil && db.QueryRow("SELECT EXISTS(SELECT 1 FROM sessions)").Scan(&hasRows) == nil {
		if secret, err := key(!hasRows); err == nil && len(secret) == sessionKeySize {
			block, err := aes.NewCipher(secret)
			if err == nil {
				sessions.cipher, _ = cipher.NewGCMWithRandomNonce(block)
			}
		}
	}
	return sessions, nil
}

func initializeSessions(conn *sql.Conn) error {
	ctx := context.Background()
	if _, err := conn.ExecContext(ctx, "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL"); err != nil {
		return err
	}
	var version, objects int
	if err := conn.QueryRowContext(ctx, "PRAGMA user_version").Scan(&version); err != nil {
		return err
	}
	if err := conn.QueryRowContext(ctx, "SELECT count(*) FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'").Scan(&objects); err != nil {
		return err
	}
	switch {
	case version == 0 && objects == 0:
	case (version == 1 || version == 2) && objects == 1:
		rows, err := conn.QueryContext(ctx, "SELECT scope, cookies FROM sessions LIMIT 0")
		if err != nil {
			return err
		}
		if err := rows.Close(); err != nil || version == 2 {
			return err
		}
	default:
		return errors.New("Unsupported session schema")
	}
	if version == 1 {
		// Retire plaintext without importing it. Keep v1 until the main file
		// and WAL are scrubbed so an interrupted upgrade repeats the cleanup.
		if _, err := conn.ExecContext(ctx, "PRAGMA secure_delete=ON; DELETE FROM sessions; VACUUM"); err != nil {
			return err
		}
		var busy, frames, checkpointed int
		if err := conn.QueryRowContext(ctx, "PRAGMA wal_checkpoint(TRUNCATE)").Scan(&busy, &frames, &checkpointed); err != nil || busy != 0 {
			return errors.New("Unable to clear the plaintext session database")
		}
	}

	if _, err := conn.ExecContext(ctx, "BEGIN IMMEDIATE"); err != nil {
		return err
	}
	defer conn.ExecContext(ctx, "ROLLBACK")
	if _, err := conn.ExecContext(ctx, fmt.Sprintf(
		"DROP TABLE IF EXISTS sessions; CREATE TABLE sessions (scope TEXT PRIMARY KEY, cookies BLOB NOT NULL CHECK(typeof(cookies) = 'blob' AND length(cookies) BETWEEN 29 AND %d)); PRAGMA user_version=2",
		encryptedSessionLimit,
	)); err != nil {
		return err
	}
	_, err := conn.ExecContext(ctx, "COMMIT")
	return err
}

func (s *Sessions) Server(scope string) SessionStore { return sessionStore{s, scope} }
func (s *Sessions) Close() error                     { return s.database.Close() }
func (s sessionStore) Load() ([]byte, error) {
	if s.sessions.cipher == nil {
		return nil, errors.New("API session key unavailable")
	}
	var value []byte
	err := s.sessions.database.QueryRow("SELECT cookies FROM sessions WHERE scope=?", s.scope).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, errors.New("Unable to read API session")
	}
	if len(value) > encryptedSessionLimit {
		return nil, errors.New("Invalid encrypted API session")
	}
	plaintext, err := s.sessions.cipher.Open(nil, nil, value, []byte(s.scope))
	if err != nil {
		return nil, errors.New("Unable to decrypt API session")
	}
	return plaintext, nil
}
func (s sessionStore) Save(value []byte) error {
	if s.scope == "" || len(value) > sessionLimit {
		return errors.New("Invalid API session")
	}
	var err error
	if len(value) == 0 {
		_, err = s.sessions.database.Exec("DELETE FROM sessions WHERE scope=?", s.scope)
	} else {
		if s.sessions.cipher == nil {
			return errors.New("API session key unavailable")
		}
		encrypted := s.sessions.cipher.Seal(nil, nil, value, []byte(s.scope))
		_, err = s.sessions.database.Exec("INSERT INTO sessions(scope,cookies) VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET cookies=excluded.cookies", s.scope, encrypted)
	}
	if err != nil {
		return errors.New("Unable to persist API session")
	}
	return nil
}
