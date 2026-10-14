use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicU16;
use std::sync::{Arc, Mutex, RwLock};

use serde::Serialize;
use tokio::sync::broadcast;

use crate::db::{Db, Device, HistoryItem, ShelfItem, TextItem};
use crate::settings::Settings;

/// События для окон ПК (через Tauri events) и телефонов (через WebSocket).
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum Event {
    Devices { devices: Vec<Device> },
    UploadStarted { id: String, device_id: String, device_name: String, name: String, size: u64, offset: u64 },
    UploadProgress { id: String, device_id: String, received: u64, size: u64 },
    UploadDone { id: String, item: HistoryItem },
    UploadCancelled { id: String, device_id: String },
    HistoryThumb { id: i64 },
    Shelf { items: Vec<ShelfItem> },
    Text { item: TextItem },
    TextRemoved { id: i64 },
    TokenReset,
}

pub struct AppState {
    pub settings: RwLock<Settings>,
    pub settings_path: PathBuf,
    pub data_dir: PathBuf,
    pub db: Db,
    pub tx: broadcast::Sender<Event>,
    pub port: AtomicU16,
    /// Порт для ссылок на файлы (см. lib.rs).
    pub files_port: AtomicU16,
    /// Адаптеры в «Общедоступной» сети (имена как в Windows).
    pub public_networks: Mutex<Vec<String>>,
    /// Сколько WebSocket-соединений открыто у каждого устройства.
    pub online: Mutex<HashMap<String, usize>>,
    /// Не даём двум запросам одновременно дописывать один и тот же файл.
    pub upload_locks: Mutex<HashMap<String, Arc<UploadSlot>>>,
}

impl AppState {
    pub fn emit(&self, ev: Event) {
        let _ = self.tx.send(ev);
    }

    pub fn settings(&self) -> Settings {
        self.settings.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn update_settings(&self, f: impl FnOnce(&mut Settings)) -> Settings {
        let mut s = self.settings.write().unwrap_or_else(|e| e.into_inner());
        f(&mut s);
        if let Err(e) = s.save(&self.settings_path) {
            eprintln!("не удалось сохранить настройки: {e}");
        }
        s.clone()
    }

    pub fn thumbs_dir(&self) -> PathBuf {
        self.data_dir.join("thumbs")
    }

    pub fn devices(&self) -> Vec<Device> {
        let online = self.online.lock().unwrap_or_else(|e| e.into_inner());
        let mut list = self.db.list_devices().unwrap_or_default();
        for d in &mut list {
            d.online = online.get(&d.id).is_some_and(|n| *n > 0);
        }
        list
    }

    pub fn emit_devices(&self) {
        self.emit(Event::Devices { devices: self.devices() });
    }

    pub fn emit_shelf(&self) {
        self.emit(Event::Shelf { items: self.db.list_shelf().unwrap_or_default() });
    }

    pub fn upload_lock(&self, id: &str) -> Arc<UploadSlot> {
        self.upload_locks
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .entry(id.to_string())
            .or_default()
            .clone()
    }

    pub fn drop_upload_lock(&self, id: &str) {
        self.upload_locks.lock().unwrap_or_else(|e| e.into_inner()).remove(id);
    }

    pub fn public_networks(&self) -> Vec<String> {
        self.public_networks.lock().unwrap_or_else(|e| e.into_inner()).clone()
    }

    pub fn set_public_networks(&self, v: Vec<String>) {
        *self.public_networks.lock().unwrap_or_else(|e| e.into_inner()) = v;
    }
}

pub type Shared = Arc<AppState>;

/// Загрузка одного файла: запись идёт под lock, а cancel будит запрос, который завис
/// в ожидании данных (телефон уснул, сокет открыт, байты не идут), чтобы новый запрос
/// не ждал его вечно.
#[derive(Default)]
pub struct UploadSlot {
    pub lock: tokio::sync::Mutex<()>,
    pub cancel: tokio::sync::Notify,
}

impl AppState {
    /// Короткий журнал загрузок в папке данных (swoop.log, старый — swoop.log.1).
    pub fn log(&self, msg: impl AsRef<str>) {
        use std::io::Write;
        let path = self.data_dir.join("swoop.log");
        if std::fs::metadata(&path).is_ok_and(|m| m.len() > 2 * 1024 * 1024) {
            let _ = std::fs::rename(&path, self.data_dir.join("swoop.log.1"));
        }
        let secs = crate::settings::now_ms() / 1000;
        let (h, m, s) = ((secs / 3600) % 24, (secs / 60) % 60, secs % 60);
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(f, "{h:02}:{m:02}:{s:02} UTC {}", msg.as_ref());
        }
    }
}
