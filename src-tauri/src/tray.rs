use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, Wry};
use tauri_plugin_opener::OpenerExt;

use crate::state::Shared;
use crate::windows;

/// Пункты меню трея: галочку «Виджет» синхронизируем с окном, подписи — с выбранным языком.
pub struct TrayMenu {
    open: MenuItem<Wry>,
    widget: CheckMenuItem<Wry>,
    folder: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

/// Язык ядра: выбор из настроек, а при «auto» — язык Windows.
pub fn is_russian(app: &AppHandle) -> bool {
    match app.state::<Shared>().settings().lang.as_str() {
        "ru" => true,
        "en" => false,
        _ => sys_locale::get_locale().is_some_and(|l| l.to_lowercase().starts_with("ru")),
    }
}

struct Labels {
    open: &'static str,
    widget: &'static str,
    folder: &'static str,
    quit: &'static str,
}

fn labels(ru: bool) -> Labels {
    if ru {
        Labels { open: "Открыть Swoop", widget: "Виджет на рабочем столе", folder: "Открыть папку с файлами", quit: "Выход" }
    } else {
        Labels { open: "Open Swoop", widget: "Desktop widget", folder: "Open files folder", quit: "Quit" }
    }
}

pub fn build(app: &AppHandle, widget_on: bool) -> tauri::Result<()> {
    let l = labels(is_russian(app));
    let open = MenuItem::with_id(app, "open", l.open, true, None::<&str>)?;
    let widget = CheckMenuItem::with_id(app, "widget", l.widget, true, widget_on, None::<&str>)?;
    let folder = MenuItem::with_id(app, "folder", l.folder, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", l.quit, true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let menu = Menu::with_items(app, &[&open, &widget, &folder, &sep, &quit])?;
    app.manage(TrayMenu { open, widget, folder, quit });

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("Swoop")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, e| match e.id.as_ref() {
            "open" => windows::show_main(app),
            "widget" => {
                let st = app.state::<Shared>();
                let on = !st.settings().widget;
                let s = st.update_settings(|s| s.widget = on);
                windows::set_widget_visible(app, on);
                sync_widget_check(app, on);
                let _ = app.emit("swoop-settings", s);
            }
            "folder" => {
                let dir = app.state::<Shared>().settings().save_dir;
                let _ = std::fs::create_dir_all(&dir);
                let _ = app.opener().open_path(dir.to_string_lossy(), None::<&str>);
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, e| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                windows::show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

pub fn sync_widget_check(app: &AppHandle, on: bool) {
    if let Some(m) = app.try_state::<TrayMenu>() {
        let _ = m.widget.set_checked(on);
    }
}

/// Язык сменили в настройках — переименовываем пункты без пересоздания меню.
pub fn apply_lang(app: &AppHandle) {
    let Some(m) = app.try_state::<TrayMenu>() else { return };
    let l = labels(is_russian(app));
    let _ = m.open.set_text(l.open);
    let _ = m.widget.set_text(l.widget);
    let _ = m.folder.set_text(l.folder);
    let _ = m.quit.set_text(l.quit);
}
