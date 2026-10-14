//! SQLite: устройства, история передач, полка ПК → телефон, лента текстов, незавершённые загрузки.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use rusqlite::{params, Connection, OptionalExtension, Row};
use serde::Serialize;

use crate::settings::{now_ms, random_id, random_token};

pub struct Db(Mutex<Connection>);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Device {
    pub id: String,
    pub name: String,
    pub created: i64,
    pub last_seen: i64,
    pub online: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryItem {
    pub id: i64,
    /// "in" — с телефона на ПК.
    pub kind: String,
    pub device_id: String,
    pub device_name: String,
    pub name: String,
    pub size: u64,
    pub path: String,
    pub mime: String,
    pub has_thumb: bool,
    pub created: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShelfItem {
    pub id: String,
    pub name: String,
    pub size: u64,
    pub mime: String,
    #[serde(skip_serializing)]
    pub path: PathBuf,
    pub created: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TextItem {
    pub id: i64,
    /// None — отправлено с ПК.
    pub device_id: Option<String>,
    pub device_name: Option<String>,
    pub text: String,
    pub created: i64,
}

#[derive(Debug, Clone)]
pub struct UploadRow {
    pub id: String,
    pub device_id: String,
    pub name: String,
    pub size: u64,
    pub mime: String,
    pub last_modified: i64,
    pub tmp_path: PathBuf,
}

const SCHEMA: &str = "
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, secret TEXT NOT NULL,
  created INTEGER NOT NULL, last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, device_id TEXT NOT NULL,
  device_name TEXT NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL, path TEXT NOT NULL,
  mime TEXT NOT NULL, has_thumb INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS shelf (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, path TEXT NOT NULL, size INTEGER NOT NULL,
  mime TEXT NOT NULL, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS texts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT, device_name TEXT,
  text TEXT NOT NULL, created INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY, device_id TEXT NOT NULL, name TEXT NOT NULL, size INTEGER NOT NULL,
  mime TEXT NOT NULL, last_modified INTEGER NOT NULL, tmp_path TEXT NOT NULL, created INTEGER NOT NULL
);
";

fn history_row(r: &Row) -> rusqlite::Result<HistoryItem> {
    Ok(HistoryItem {
        id: r.get(0)?,
        kind: r.get(1)?,
        device_id: r.get(2)?,
        device_name: r.get(3)?,
        name: r.get(4)?,
        size: r.get::<_, i64>(5)? as u64,
        path: r.get(6)?,
        mime: r.get(7)?,
        has_thumb: r.get::<_, i64>(8)? != 0,
        created: r.get(9)?,
    })
}
const HISTORY_COLS: &str = "id, kind, device_id, device_name, name, size, path, mime, has_thumb, created";

fn shelf_row(r: &Row) -> rusqlite::Result<ShelfItem> {
    Ok(ShelfItem {
        id: r.get(0)?,
        name: r.get(1)?,
        path: PathBuf::from(r.get::<_, String>(2)?),
        size: r.get::<_, i64>(3)? as u64,
        mime: r.get(4)?,
        created: r.get(5)?,
    })
}

fn text_row(r: &Row) -> rusqlite::Result<TextItem> {
    Ok(TextItem { id: r.get(0)?, device_id: r.get(1)?, device_name: r.get(2)?, text: r.get(3)?, created: r.get(4)? })
}

fn upload_row(r: &Row) -> rusqlite::Result<UploadRow> {
    Ok(UploadRow {
        id: r.get(0)?,
        device_id: r.get(1)?,
        name: r.get(2)?,
        size: r.get::<_, i64>(3)? as u64,
        mime: r.get(4)?,
        last_modified: r.get(5)?,
        tmp_path: PathBuf::from(r.get::<_, String>(6)?),
    })
}
const UPLOAD_COLS: &str = "id, device_id, name, size, mime, last_modified, tmp_path";

/// Сравнение секретов без раннего выхода.
fn same(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

impl Db {
    pub fn open(path: &Path) -> anyhow::Result<Self> {
        let conn = Connection::open(path)?;
        conn.execute_batch("PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;")?;
        conn.execute_batch(SCHEMA)?;
        Ok(Self(Mutex::new(conn)))
    }

    #[cfg(test)]
    pub fn memory() -> Self {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA).unwrap();
        Self(Mutex::new(conn))
    }

    fn c(&self) -> std::sync::MutexGuard<'_, Connection> {
        self.0.lock().unwrap_or_else(|e| e.into_inner())
    }

    // ---------- устройства ----------

    /// Новое устройство. Возвращает его и ключ «id.secret» для cookie.
    pub fn add_device(&self, name: &str) -> rusqlite::Result<(Device, String)> {
        let id = random_id();
        let secret = random_token(24);
        let now = now_ms();
        self.c().execute(
            "INSERT INTO devices (id, name, secret, created, last_seen) VALUES (?1, ?2, ?3, ?4, ?4)",
            params![id, name, secret, now],
        )?;
        let key = format!("{id}.{secret}");
        Ok((Device { id, name: name.into(), created: now, last_seen: now, online: false }, key))
    }

    pub fn device_by_key(&self, key: &str) -> Option<Device> {
        let (id, secret) = key.split_once('.')?;
        let c = self.c();
        let (dev, stored): (Device, String) = c
            .query_row("SELECT id, name, created, last_seen, secret FROM devices WHERE id = ?1", [id], |r| {
                Ok((
                    Device { id: r.get(0)?, name: r.get(1)?, created: r.get(2)?, last_seen: r.get(3)?, online: false },
                    r.get(4)?,
                ))
            })
            .optional()
            .ok()??;
        same(&stored, secret).then_some(dev)
    }

    pub fn touch_device(&self, id: &str) {
        let _ = self.c().execute("UPDATE devices SET last_seen = ?2 WHERE id = ?1", params![id, now_ms()]);
    }

    pub fn rename_device(&self, id: &str, name: &str) -> rusqlite::Result<()> {
        self.c().execute("UPDATE devices SET name = ?2 WHERE id = ?1", params![id, name]).map(|_| ())
    }

    pub fn list_devices(&self) -> rusqlite::Result<Vec<Device>> {
        let c = self.c();
        let mut st = c.prepare("SELECT id, name, created, last_seen FROM devices ORDER BY last_seen DESC")?;
        let rows = st.query_map([], |r| {
            Ok(Device { id: r.get(0)?, name: r.get(1)?, created: r.get(2)?, last_seen: r.get(3)?, online: false })
        })?;
        rows.collect()
    }

    pub fn remove_device(&self, id: &str) -> rusqlite::Result<()> {
        self.c().execute("DELETE FROM devices WHERE id = ?1", [id]).map(|_| ())
    }

    pub fn remove_all_devices(&self) -> rusqlite::Result<()> {
        self.c().execute("DELETE FROM devices", []).map(|_| ())
    }

    // ---------- загрузки ----------

    pub fn find_upload(&self, device_id: &str, name: &str, size: u64, last_modified: i64) -> Option<UploadRow> {
        self.c()
            .query_row(
                &format!(
                    "SELECT {UPLOAD_COLS} FROM uploads
                     WHERE device_id = ?1 AND name = ?2 AND size = ?3 AND last_modified = ?4"
                ),
                params![device_id, name, size as i64, last_modified],
                upload_row,
            )
            .optional()
            .ok()?
    }

    pub fn get_upload(&self, id: &str) -> Option<UploadRow> {
        self.c()
            .query_row(&format!("SELECT {UPLOAD_COLS} FROM uploads WHERE id = ?1"), [id], upload_row)
            .optional()
            .ok()?
    }

    pub fn add_upload(&self, u: &UploadRow) -> rusqlite::Result<()> {
        self.c()
            .execute(
                "INSERT INTO uploads (id, device_id, name, size, mime, last_modified, tmp_path, created)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                params![
                    u.id,
                    u.device_id,
                    u.name,
                    u.size as i64,
                    u.mime,
                    u.last_modified,
                    u.tmp_path.to_string_lossy(),
                    now_ms()
                ],
            )
            .map(|_| ())
    }

    pub fn remove_upload(&self, id: &str) {
        let _ = self.c().execute("DELETE FROM uploads WHERE id = ?1", [id]);
    }

    /// Незавершённые загрузки старше суток — их временные файлы можно удалить.
    pub fn stale_uploads(&self, older_than_ms: i64) -> Vec<UploadRow> {
        let c = self.c();
        let Ok(mut st) = c.prepare(&format!("SELECT {UPLOAD_COLS} FROM uploads WHERE created < ?1")) else {
            return vec![];
        };
        st.query_map([now_ms() - older_than_ms], upload_row)
            .map(|rows| rows.filter_map(Result::ok).collect())
            .unwrap_or_default()
    }

    // ---------- история ----------

    pub fn add_history(
        &self,
        device: &Device,
        name: &str,
        size: u64,
        path: &Path,
        mime: &str,
    ) -> rusqlite::Result<HistoryItem> {
        let c = self.c();
        c.execute(
            "INSERT INTO history (kind, device_id, device_name, name, size, path, mime, created)
             VALUES ('in', ?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![device.id, device.name, name, size as i64, path.to_string_lossy(), mime, now_ms()],
        )?;
        let id = c.last_insert_rowid();
        c.query_row(&format!("SELECT {HISTORY_COLS} FROM history WHERE id = ?1"), [id], history_row)
    }

    pub fn get_history(&self, id: i64) -> Option<HistoryItem> {
        self.c()
            .query_row(&format!("SELECT {HISTORY_COLS} FROM history WHERE id = ?1"), [id], history_row)
            .optional()
            .ok()?
    }

    pub fn list_history(&self, device_id: Option<&str>, limit: u32) -> rusqlite::Result<Vec<HistoryItem>> {
        let c = self.c();
        let mut st = c.prepare(&format!(
            "SELECT {HISTORY_COLS} FROM history WHERE (?1 IS NULL OR device_id = ?1) ORDER BY id DESC LIMIT ?2"
        ))?;
        let rows = st.query_map(params![device_id, limit], history_row)?;
        rows.collect()
    }

    pub fn set_thumb(&self, id: i64) {
        let _ = self.c().execute("UPDATE history SET has_thumb = 1 WHERE id = ?1", [id]);
    }

    pub fn clear_history(&self) -> rusqlite::Result<()> {
        self.c().execute("DELETE FROM history", []).map(|_| ())
    }

    // ---------- полка ----------

    pub fn add_shelf(&self, name: &str, path: &Path, size: u64, mime: &str) -> rusqlite::Result<ShelfItem> {
        let item = ShelfItem {
            id: random_id(),
            name: name.into(),
            size,
            mime: mime.into(),
            path: path.to_path_buf(),
            created: now_ms(),
        };
        self.c().execute(
            "INSERT INTO shelf (id, name, path, size, mime, created) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![item.id, item.name, path.to_string_lossy(), size as i64, item.mime, item.created],
        )?;
        Ok(item)
    }

    pub fn list_shelf(&self) -> rusqlite::Result<Vec<ShelfItem>> {
        let c = self.c();
        let mut st = c.prepare("SELECT id, name, path, size, mime, created FROM shelf ORDER BY created DESC")?;
        let rows = st.query_map([], shelf_row)?;
        rows.collect()
    }

    pub fn get_shelf(&self, id: &str) -> Option<ShelfItem> {
        self.c()
            .query_row("SELECT id, name, path, size, mime, created FROM shelf WHERE id = ?1", [id], shelf_row)
            .optional()
            .ok()?
    }

    pub fn remove_shelf(&self, id: &str) -> rusqlite::Result<()> {
        self.c().execute("DELETE FROM shelf WHERE id = ?1", [id]).map(|_| ())
    }

    // ---------- тексты ----------

    pub fn add_text(&self, device: Option<&Device>, text: &str) -> rusqlite::Result<TextItem> {
        let c = self.c();
        let now = now_ms();
        c.execute(
            "INSERT INTO texts (device_id, device_name, text, created) VALUES (?1, ?2, ?3, ?4)",
            params![device.map(|d| &d.id), device.map(|d| &d.name), text, now],
        )?;
        Ok(TextItem {
            id: c.last_insert_rowid(),
            device_id: device.map(|d| d.id.clone()),
            device_name: device.map(|d| d.name.clone()),
            text: text.into(),
            created: now,
        })
    }

    pub fn list_texts(&self, limit: u32) -> rusqlite::Result<Vec<TextItem>> {
        let c = self.c();
        let mut st =
            c.prepare("SELECT id, device_id, device_name, text, created FROM texts ORDER BY id DESC LIMIT ?1")?;
        let rows = st.query_map([limit], text_row)?;
        rows.collect()
    }

    pub fn remove_text(&self, id: i64) -> rusqlite::Result<()> {
        self.c().execute("DELETE FROM texts WHERE id = ?1", [id]).map(|_| ())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn device_keys() {
        let db = Db::memory();
        let (dev, key) = db.add_device("iPhone").unwrap();
        assert_eq!(db.device_by_key(&key).unwrap().id, dev.id);
        assert!(db.device_by_key(&format!("{}.wrong", dev.id)).is_none());
        assert!(db.device_by_key("garbage").is_none());
        db.remove_device(&dev.id).unwrap();
        assert!(db.device_by_key(&key).is_none());
    }
}
