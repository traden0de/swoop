mod commands;
mod db;
mod names;
mod net;
mod notify;
mod server;
mod settings;
mod state;
mod tray;
mod windows;

use std::collections::HashMap;
use std::net::TcpListener;
use std::sync::atomic::AtomicU16;
use std::sync::{Arc, Mutex, RwLock};

use tauri::{AppHandle, Emitter, Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tokio::sync::broadcast;

use crate::db::Db;
use crate::settings::Settings;
use crate::state::{AppState, Event, Shared};

/// Свободный порт: сначала сохранённый, затем следующие 20.
fn bind(port: u16) -> std::io::Result<TcpListener> {
    let listener = (port..port.saturating_add(20))
        .find_map(|p| TcpListener::bind(("0.0.0.0", p)).ok())
        .map_or_else(|| TcpListener::bind(("0.0.0.0", 0)), Ok)?;
    listener.set_nonblocking(true)?;
    Ok(listener)
}

fn init_state(app: &AppHandle) -> anyhow::Result<(Shared, TcpListener, TcpListener)> {
    let data_dir = app.path().app_data_dir()?;
    std::fs::create_dir_all(&data_dir)?;
    let settings_path = data_dir.join("settings.json");
    let mut settings = Settings::load(&settings_path);
    if settings.save_dir.as_os_str().is_empty() {
        let downloads = app.path().download_dir().or_else(|_| app.path().home_dir())?;
        settings.save_dir = downloads.join("Swoop");
    }

    let listener = bind(settings.port)?;
    let port = listener.local_addr()?.port();
    settings.port = port;
    // Второй порт — для ссылок на файлы. Для иконки «Домой» iOS другой порт — другой адрес,
    // и такие ссылки открываются во встроенном браузере с кнопкой «Готово», а не внутри
    // приложения, откуда нет пути назад.
    let files_listener = bind(port.saturating_add(1))?;
    let files_port = files_listener.local_addr()?.port();
    settings.save(&settings_path)?;

    let (tx, _) = broadcast::channel(512);
    let st = Arc::new(AppState {
        settings: RwLock::new(settings),
        settings_path,
        db: Db::open(&data_dir.join("swoop.db"))?,
        data_dir,
        tx,
        port: AtomicU16::new(port),
        files_port: AtomicU16::new(files_port),
        public_networks: Mutex::new(Vec::new()),
        online: Mutex::new(HashMap::new()),
        upload_locks: Mutex::new(HashMap::new()),
    });
    Ok((st, listener, files_listener))
}

/// Недокачанные больше трёх суток файлы удаляем вместе с записями.
fn cleanup_stale(st: &Shared) {
    for u in st.db.stale_uploads(3 * 24 * 3600 * 1000) {
        let _ = std::fs::remove_file(&u.tmp_path);
        st.db.remove_upload(&u.id);
    }
}

/// Все события ядра уходят в окна ПК; заодно здесь тосты и автокопирование текста.
fn forward_events(app: AppHandle, st: Shared) {
    let mut rx = st.tx.subscribe();
    tauri::async_runtime::spawn(async move {
        loop {
            match rx.recv().await {
                Ok(ev) => {
                    let _ = app.emit("swoop", &ev);
                    match &ev {
                        Event::UploadDone { item, .. } => notify::file_received(&app, item),
                        Event::Text { item } if item.device_id.is_some() => {
                            let copied = st.settings().auto_copy && app.clipboard().write_text(item.text.clone()).is_ok();
                            notify::text_received(&app, item, copied);
                        }
                        _ => {}
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let start_hidden = std::env::args().any(|a| a == "--hidden");

    tauri::Builder::default()
        // Повторный запуск exe просто открывает уже работающее окно
        .plugin(tauri_plugin_single_instance::init(|app, _, _| windows::show_main(app)))
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, Some(vec!["--hidden"])))
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .setup(move |app| {
            let handle = app.handle().clone();
            let (st, listener, files_listener) = init_state(&handle)?;
            app.manage(st.clone());
            app.manage(notify::Notifier::default());

            cleanup_stale(&st);
            forward_events(handle.clone(), st.clone());
            tauri::async_runtime::spawn(server::serve(st.clone(), listener));
            tauri::async_runtime::spawn(server::serve(st.clone(), files_listener));

            // Проверка «Общедоступной» сети медленная (PowerShell) — в фоне
            let st2 = st.clone();
            let h2 = handle.clone();
            tauri::async_runtime::spawn(async move {
                let public = tauri::async_runtime::spawn_blocking(net::public_networks).await.unwrap_or_default();
                st2.set_public_networks(public.clone());
                let _ = h2.emit("swoop-network", public);
            });

            let widget_on = st.settings().widget;
            windows::create(&handle)?;
            tray::build(&handle, widget_on)?;
            if widget_on {
                windows::set_widget_visible(&handle, true);
            }
            if !start_hidden {
                windows::show_main(&handle);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            match event {
                // Крестик главного окна прячет его в трей — сервер продолжает работать
                WindowEvent::CloseRequested { api, .. } => {
                    api.prevent_close();
                    let _ = window.hide();
                    windows::main_visibility(window.app_handle(), false);
                }
                // Свернули или развернули — анимацию ставим на паузу или продолжаем
                WindowEvent::Resized(_) => {
                    let visible = !window.is_minimized().unwrap_or(false) && window.is_visible().unwrap_or(true);
                    windows::main_visibility(window.app_handle(), visible);
                }
                WindowEvent::Focused(true) => windows::main_visibility(window.app_handle(), true),
                _ => {}
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::bootstrap,
            commands::refresh_network,
            commands::list_history,
            commands::clear_history,
            commands::get_thumb,
            commands::list_shelf,
            commands::shelf_add,
            commands::shelf_remove,
            commands::list_texts,
            commands::send_text,
            commands::remove_text,
            commands::list_devices,
            commands::revoke_device,
            commands::reset_token,
            commands::update_settings,
            commands::open_path,
            commands::open_url,
            commands::reveal_path,
            commands::open_save_dir,
            commands::show_main,
            commands::main_visible,
            commands::quit,
        ])
        .run(tauri::generate_context!())
        .expect("не удалось запустить Swoop");
}
