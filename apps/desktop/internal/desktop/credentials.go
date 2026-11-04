package desktop

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
)

// Credentials owns a short-transaction database, independent of the lifetime instance lock.
// Only scoped Keys are handed to the cookie jar; values never cross the native boundary.
type Credentials struct{ database *sql.DB }
type credentialKeys struct {
	store *Credentials
	scope string
}

func protectCredentials(directory string) error {
	if !filepath.IsAbs(directory) {
		return errors.New("Credential directory must be absolute")
	}
	if info, err := os.Lstat(directory); err == nil {
		if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return errors.New("Invalid credential directory")
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	if err := os.MkdirAll(directory, 0700); err != nil {
		return err
	}
	if err := protectCredentialPath(directory, true); err != nil {
		return err
	}
	for _, suffix := range []string{"", "-wal", "-shm", "-journal"} {
		path := filepath.Join(directory, "credentials.sqlite") + suffix
		info, err := os.Lstat(path)
		if os.IsNotExist(err) {
			continue
		}
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return errors.New("Invalid credential database")
		}
		if err := protectCredentialPath(path, false); err != nil {
			return err
		}
	}
	return nil
}

func OpenCredentials(directory string) (*Credentials, error) {
	if err := protectCredentials(directory); err != nil {
		return nil, errors.New("Unable to protect credential storage")
	}
	db, err := sql.Open("sqlite", filepath.Join(directory, "credentials.sqlite"))
	if err != nil {
		return nil, errors.New("Unable to open credential storage")
	}
	db.SetMaxOpenConns(1)
	fail := func() (*Credentials, error) {
		db.Close()
		return nil, errors.New("Unable to initialize credential storage")
	}
	if err := db.Ping(); err != nil {
		return fail()
	}
	if err := protectCredentials(directory); err != nil {
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
			if _, err := conn.ExecContext(context.Background(), "CREATE TABLE session_keys (scope TEXT NOT NULL, name TEXT NOT NULL, value BLOB NOT NULL CHECK(length(value) BETWEEN 1 AND 4096), PRIMARY KEY(scope, name)); PRAGMA user_version=1"); err != nil {
				return err
			}
		} else if version != 1 || objects != 1 {
			return errors.New("Unsupported credential schema")
		}
		rows, err := conn.QueryContext(context.Background(), "SELECT scope, name, value FROM session_keys LIMIT 0")
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
	if err := protectCredentials(directory); err != nil {
		return fail()
	}
	return &Credentials{database: db}, nil
}

func (c *Credentials) Keys(scope string) Keys { return credentialKeys{c, scope} }
func (c *Credentials) Close() error           { return c.database.Close() }
func (k credentialKeys) Get(name string) ([]byte, error) {
	var value []byte
	err := k.store.database.QueryRow("SELECT value FROM session_keys WHERE scope=? AND name=?", k.scope, name).Scan(&value)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, errors.New("Unable to read session key")
	}
	return value, nil
}
func (k credentialKeys) Set(name string, value []byte) error {
	if k.scope == "" || name == "" || len(value) == 0 || len(value) > 4096 {
		return errors.New("Invalid session key")
	}
	_, err := k.store.database.Exec("INSERT INTO session_keys(scope,name,value) VALUES(?,?,?) ON CONFLICT(scope,name) DO UPDATE SET value=excluded.value", k.scope, name, value)
	if err != nil {
		return errors.New("Unable to persist session key")
	}
	return nil
}
