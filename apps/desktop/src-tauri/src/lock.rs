use rusqlite::{Connection, Error, ErrorCode};
use std::{path::Path, time::Duration};

/// This connection owns SQLite's exclusive OS lock. Never replace/unlink the file.
pub struct InstanceLock {
    database: Connection,
}

pub fn acquire(directory: &Path) -> Result<Option<InstanceLock>, String> {
    crate::config::private_directory(directory)
        .map_err(|_| "Unable to open desktop data directory")?;
    let database = Connection::open(directory.join("desktop-instance.sqlite"))
        .map_err(|_| "Unable to open desktop instance lock")?;
    database
        .busy_timeout(Duration::from_millis(250))
        .map_err(|_| "Unable to configure desktop instance lock")?;
    // Acquire in NORMAL mode so losing readers release their SHARED locks while
    // SQLite waits briefly for the winning writer. Setting EXCLUSIVE mode first
    // can retain every contender's read lock and make all upgrades return BUSY.
    match database.execute_batch("PRAGMA journal_mode=DELETE; BEGIN EXCLUSIVE; PRAGMA locking_mode=EXCLUSIVE; CREATE TABLE IF NOT EXISTS instance (id INTEGER PRIMARY KEY);") {
        Ok(()) => Ok(Some(InstanceLock { database })),
        Err(Error::SqliteFailure(error, _)) if matches!(error.code, ErrorCode::DatabaseBusy | ErrorCode::DatabaseLocked) => Ok(None),
        Err(_) => Err("Unable to acquire desktop instance lock".into()),
    }
}

impl Drop for InstanceLock {
    fn drop(&mut self) {
        let _ = self.database.execute_batch("ROLLBACK");
    }
}
