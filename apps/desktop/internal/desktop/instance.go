package desktop

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"

	_ "modernc.org/sqlite"
)

func AcquireInstance(directory string) (*sql.DB, *sql.Conn, error) {
	if err := PrivateDirectory(directory); err != nil {
		return nil, nil, err
	}
	db, err := sql.Open("sqlite", filepath.Join(directory, "desktop-instance.sqlite"))
	if err != nil {
		return nil, nil, errors.New("Unable to open desktop instance lock")
	}
	db.SetMaxOpenConns(1)
	conn, err := db.Conn(context.Background())
	if err != nil {
		db.Close()
		return nil, nil, err
	}
	_, err = conn.ExecContext(context.Background(), "PRAGMA busy_timeout=250; PRAGMA journal_mode=DELETE; BEGIN EXCLUSIVE; PRAGMA locking_mode=EXCLUSIVE; CREATE TABLE IF NOT EXISTS instance (id INTEGER PRIMARY KEY);")
	if err != nil {
		conn.Close()
		db.Close()
		return nil, nil, errors.New("Desktop instance already running or unavailable")
	}
	return db, conn, nil
}
