use rand::RngCore;
use serde_json::{Value, json};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};

pub struct PreferenceStore {
    file: PathBuf,
    raw: Value,
    status: &'static str,
}

impl PreferenceStore {
    pub fn new(directory: PathBuf) -> Self {
        let file = directory.join("preferences.json");
        let (status, raw) = match fs::metadata(&file) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => ("missing", Value::Null),
            Ok(metadata) if metadata.is_file() && metadata.len() <= 4096 => {
                match crate::config::read_bounded(&file, 4096)
                    .ok()
                    .and_then(|s| serde_json::from_slice::<Value>(&s).ok())
                {
                    Some(value) if value.is_object() => ("read", value),
                    _ => ("unreadable", Value::Null),
                }
            }
            _ => ("unreadable", Value::Null),
        };
        Self { file, raw, status }
    }
    pub fn read(&self) -> Value {
        self.raw.clone()
    }
    pub fn snapshot(&self) -> Value {
        json!({"status":self.status,"raw":self.raw})
    }
    pub fn preload(&self) -> String {
        let snapshot = serde_json::to_string(&self.snapshot().to_string())
            .expect("A preference JSON string is always serializable")
            .replace('<', "\\u003c");
        format!(
            "(()=>{{const snapshot=JSON.parse({snapshot});function freeze(v){{if(v&&typeof v==='object'){{Object.values(v).forEach(freeze);Object.freeze(v)}}}}freeze(snapshot);Object.defineProperty(window,\"__raypxDevicePreferences\",{{value:snapshot}})}})();"
        )
    }
    pub fn save(&mut self, value: Value) -> bool {
        let Some(input) = value.as_object() else {
            return false;
        };
        let mut fields = self.raw.as_object().cloned().unwrap_or_default();
        fields.extend(input.clone());
        let next = Value::Object(fields);
        let Ok(bytes) = serde_json::to_vec(&next) else {
            return false;
        };
        if bytes.len() > 4096 || atomic_write(&self.file, &bytes).is_err() {
            return false;
        }
        self.raw = next;
        self.status = "read";
        true
    }
}

pub fn atomic_write(file: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let directory = file
        .parent()
        .ok_or_else(|| std::io::Error::other("Missing parent directory"))?;
    crate::config::private_directory(directory)?;
    let mut random = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut random);
    let suffix: String = random.iter().map(|v| format!("{v:02x}")).collect();
    let temporary = file.with_extension(format!("{suffix}.tmp"));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut output = options.open(&temporary)?;
        output.write_all(bytes)?;
        output.sync_all()?;
        drop(output);
        fs::rename(&temporary, file)
    })();
    let _ = fs::remove_file(&temporary);
    result
}
