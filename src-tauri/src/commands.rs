//! Команды для окон ПК. Окна общаются с ядром через invoke и событие "swoop", без HTTP.

use std::path::PathBuf;
use std::sync::atomic::Ordering;

use base64::Engine;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_opener::OpenerExt;

use crate::db::{Device, HistoryItem, ShelfItem, TextItem};
use crate::net::{self, Addr};
use crate::settings::{random_token, Settings, SettingsPatch};
use crate::state::{Event, Shared};
use crate::{tray, windows};

type CmdResult<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Bootstrap {
    port: u16,
    token: String,
    addresses: Vec<Addr>,
    settings: Settings,
    public_networks: Vec<String>,
    pc_name: String,
    version: String,
}

#[tauri::command]
pub fn bootstrap(app: AppHandle, st: State<'_, Shared>) -> Bootstrap {
    let settings = st.settings();
    Bootstrap {
        port: st.port.load(Ordering::Relaxed),
        token: settings.token.clone(),
        addresses: net::addresses(),
        settings,
        public_networks: st.public_networks(),
        pc_name: crate::server::pc_name(),
        version: app.package_info().version.to_string(),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Network {
    addresses: Vec<Addr>,
    public_networks: Vec<String>,
}

#[tauri::command]
pub async fn refresh_network(st: State<'_, Shared>) -> CmdResult<Network> {
    let public = tauri::async_runtime::spawn_blocking(net::public_networks).await.unwrap_or_default();
    st.set_public_networks(public.clone());
    Ok(Network { addresses: net::addresses(), public_networks: public })
}

#[tauri::command]
pub fn list_history(st: State<'_, Shared>) -> CmdResult<Vec<HistoryItem>> {
    st.db.list_history(None, 300).map_err(err)
}

#[tauri::command]
pub fn clear_history(st: State<'_, Shared>) -> CmdResult<()> {
    st.db.clear_history().map_err(err)?;
    let _ = std::fs::remove_dir_all(st.thumbs_dir());
    Ok(())
}

#[tauri::command]
pub fn get_thumb(st: State<'_, Shared>, id: i64) -> Option<String> {
    let bytes = std::fs::read(st.thumbs_dir().join(format!("{id}.jpg"))).ok()?;
    Some(format!("data:image/jpeg;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)))
}

#[tauri::command]
pub fn list_shelf(st: State<'_, Shared>) -> CmdResult<Vec<ShelfItem>> {
    st.db.list_shelf().map_err(err)
}

/// Добавить на полку файлы, перетащенные в окно. Папки пропускаем.
#[tauri::command]
pub fn shelf_add(st: State<'_, Shared>, paths: Vec<String>) -> CmdResult<usize> {
    let mut added = 0;
    for p in paths {
        let path = PathBuf::from(&p);
        let Ok(meta) = std::fs::metadata(&path) else { continue };
        if !meta.is_file() {
            continue;
        }
        let name = path.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| "file".into());
        let mime = mime_guess::from_path(&path).first_or_octet_stream().to_string();
        st.db.add_shelf(&name, &path, meta.len(), &mime).map_err(err)?;
        added += 1;
    }
    if added > 0 {
        st.emit_shelf();
    }
    Ok(added)
}

#[tauri::command]
pub fn shelf_remove(st: State<'_, Shared>, id: String) -> CmdResult<()> {
    st.db.remove_shelf(&id).map_err(err)?;
    st.emit_shelf();
    Ok(())
}

#[tauri::command]
pub fn list_texts(st: State<'_, Shared>) -> CmdResult<Vec<TextItem>> {
    st.db.list_texts(200).map_err(err)
}

#[tauri::command]
pub fn send_text(st: State<'_, Shared>, text: String) -> CmdResult<TextItem> {
    if text.trim().is_empty() {
        return Err("empty".into());
    }
    let item = st.db.add_text(None, text.trim_end()).map_err(err)?;
    st.emit(Event::Text { item: item.clone() });
    Ok(item)
}

#[tauri::command]
pub fn remove_text(st: State<'_, Shared>, id: i64) -> CmdResult<()> {
    st.db.remove_text(id).map_err(err)?;
    st.emit(Event::TextRemoved { id });
    Ok(())
}

#[tauri::command]
pub fn list_devices(st: State<'_, Shared>) -> Vec<Device> {
    st.devices()
}

#[tauri::command]
pub fn revoke_device(st: State<'_, Shared>, id: String) -> CmdResult<()> {
    st.db.remove_device(&id).map_err(err)?;
    st.emit_devices();
    Ok(())
}

/// Новый токен: старый QR перестаёт работать, все устройства отключаются.
#[tauri::command]
pub fn reset_token(st: State<'_, Shared>) -> CmdResult<String> {
    let s = st.update_settings(|s| s.token = random_token(24));
    st.db.remove_all_devices().map_err(err)?;
    st.emit(Event::TokenReset);
    st.emit_devices();
    Ok(s.token)
}

#[tauri::command]
pub fn update_settings(app: AppHandle, st: State<'_, Shared>, patch: SettingsPatch) -> CmdResult<Settings> {
    if let Some(dir) = &patch.save_dir {
        std::fs::create_dir_all(dir).map_err(err)?;
    }
    let widget = patch.widget;
    let lang_changed = patch.lang.is_some();
    let s = st.update_settings(|s| patch.apply(s));
    if let Some(v) = widget {
        windows::set_widget_visible(&app, v);
        tray::sync_widget_check(&app, v);
    }
    if lang_changed {
        tray::apply_lang(&app);
    }
    // Все окна (главное и виджет) держат одну и ту же копию настроек
    let _ = app.emit("swoop-settings", &s);
    Ok(s)
}

#[tauri::command]
pub fn open_path(app: AppHandle, path: String) -> CmdResult<()> {
    app.opener().open_path(path, None::<&str>).map_err(err)
}

/// Ссылки из ленты текстов — в браузер по умолчанию, и только http(s).
#[tauri::command]
pub fn open_url(app: AppHandle, url: String) -> CmdResult<()> {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return Err("bad_url".into());
    }
    app.opener().open_url(url, None::<&str>).map_err(err)
}

#[tauri::command]
pub fn reveal_path(app: AppHandle, path: String) -> CmdResult<()> {
    app.opener().reveal_item_in_dir(path).map_err(err)
}

#[tauri::command]
pub fn open_save_dir(app: AppHandle, st: State<'_, Shared>) -> CmdResult<()> {
    let dir = st.settings().save_dir;
    std::fs::create_dir_all(&dir).map_err(err)?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(err)
}

#[tauri::command]
pub fn show_main(app: AppHandle) {
    windows::show_main(&app);
}

#[tauri::command]
pub fn quit(app: AppHandle) {
    app.exit(0);
}

/// Открыто ли главное окно (виджет по двойному клику показывает или прячет его).
#[tauri::command]
pub fn main_visible(app: AppHandle) -> bool {
    app.get_webview_window("main").and_then(|w| w.is_visible().ok()).unwrap_or(false)
}
