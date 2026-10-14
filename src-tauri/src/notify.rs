//! Тосты Windows. Файлы приходят пачками, поэтому собираем их за 1.5 с в одно уведомление.

use std::sync::Mutex;
use std::time::Duration;

use tauri::{AppHandle, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::db::{HistoryItem, TextItem};
use crate::state::Shared;
use crate::tray::is_russian;

#[derive(Default)]
pub struct Notifier {
    pending: Mutex<Vec<(String, String)>>, // (устройство, имя файла)
}

/// Главное окно на виду — тогда тост не нужен, существо и так всё покажет.
fn main_focused(app: &AppHandle) -> bool {
    app.get_webview_window("main")
        .map(|w| w.is_visible().unwrap_or(false) && w.is_focused().unwrap_or(false))
        .unwrap_or(false)
}

fn enabled(app: &AppHandle) -> bool {
    app.state::<Shared>().settings().notifications && !main_focused(app)
}

pub fn file_received(app: &AppHandle, item: &HistoryItem) {
    if !enabled(app) {
        return;
    }
    let notifier = app.state::<Notifier>();
    let mut pending = notifier.pending.lock().unwrap_or_else(|e| e.into_inner());
    pending.push((item.device_name.clone(), item.name.clone()));
    if pending.len() > 1 {
        return; // таймер уже запущен
    }
    drop(pending);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(Duration::from_millis(1500)).await;
        let batch: Vec<_> = std::mem::take(&mut *app.state::<Notifier>().pending.lock().unwrap_or_else(|e| e.into_inner()));
        let Some((device, first)) = batch.first().cloned() else { return };
        let ru = is_russian(&app);
        let (title, body) = match (batch.len(), ru) {
            (1, true) => (format!("Файл от «{device}»"), first),
            (1, false) => (format!("File from “{device}”"), first),
            (n, true) => (format!("Получено файлов: {n}"), format!("{first} и ещё {}", n - 1)),
            (n, false) => (format!("{n} files received"), format!("{first} and {} more", n - 1)),
        };
        let _ = app.notification().builder().title(title).body(body).show();
    });
}

pub fn text_received(app: &AppHandle, item: &TextItem, copied: bool) {
    if !enabled(app) {
        return;
    }
    let device = item.device_name.clone().unwrap_or_default();
    let ru = is_russian(app);
    let title = match (copied, ru) {
        (true, true) => format!("Текст от «{device}» скопирован"),
        (false, true) => format!("Текст от «{device}»"),
        (true, false) => format!("Text from “{device}” copied"),
        (false, false) => format!("Text from “{device}”"),
    };
    let body: String = item.text.chars().take(160).collect();
    let _ = app.notification().builder().title(title).body(body).show();
}
