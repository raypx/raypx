package desktop

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
)

// Sessions owns a short-transaction database, independent of the lifetime instance lock.
// Only server-scoped stores are handed to the cookie jar; values never cross the native boundary.
type Sessions struct{ database *sql.DB }
type sessionStore struct {
	sessions *Sessions
	scope    string
}

const sessionLimit = 256 * 1024

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

func OpenSessions(directory string) (*Sessions, error) {
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
	initialize := func() error {
		defer conn.Close()
		if _, err := conn.ExecContext(context.Background(), "PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; BEGIN IMMEDIATE"); err != nil {
			return err
		}
		defer conn.ExecContext(context.Background(), "ROLLBACK")
		var version, objects int
		if err := conn.QueryRowContext(context.Background(), "PRAGMA user_version").Scan(&version); err != nil {
			return err
		}
		if err := conn.QueryRowContext(context.Background(), "SELECT count(*) FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'").Scan(&objects); err != nil {
			return err
		}
		if version == 0 && objects == 0 {
			if _, err := conn.ExecContext(context.Background(), "CREATE TABLE sessions (scope TEXT PRIMARY KEY, cookies TEXT NOT NULL CHECK(length(cookies) BETWEEN 1 AND 262144)); PRAGMA user_version=1"); err != nil {
				return err
			}
		} else if version != 1 || objects != 1 {
			return errors.New("Unsupported session schema")
		}
		rows, err := conn.QueryContext(context.Background(), "SELECT scope, cookies FROM sessions LIMIT 0")
		if err != nil {
			return err
		}
		rows.Close()
		_, err = conn.ExecContext(context.Background(), "COMMIT")
		return err
	}
	if err := initialize(); err != nil {
		return fail()
	}
	if err := protectSessions(directory); err != nil {
		return fail()
	}
	return &Sessions{database: db}, nil
}

func (s *Sessions) Server(scope string) SessionStore { return sessionStore{s, scope} }
func (s *Sessions) Close() error                     { return s.database.Close() }
func (s sessionStore) Load() ([]byte, error) {
	var value string
	err := s.sessions.database.QueryRow("SELECT cookies FROM sessions WHERE scope=?", s.scope).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, errors.New("Unable to read API session")
	}
	return []byte(value), nil
}
func (s sessionStore) Save(value []byte) error {
	if s.scope == "" || len(value) > sessionLimit {
		return errors.New("Invalid API session")
	}
	var err error
	if len(value) == 0 {
		_, err = s.sessions.database.Exec("DELETE FROM sessions WHERE scope=?", s.scope)
	} else {
		_, err = s.sessions.database.Exec("INSERT INTO sessions(scope,cookies) VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET cookies=excluded.cookies", s.scope, string(value))
	}
	if err != nil {
		return errors.New("Unable to persist API session")
	}
	return nil
}
