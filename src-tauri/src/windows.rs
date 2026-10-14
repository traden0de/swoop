use tauri::{AppHandle, Emitter, LogicalPosition, Manager, WebviewUrl, WebviewWindowBuilder};

/// Окна создаём в setup, уже после app.manage(состояние): если бы они были в tauri.conf.json,
/// страница могла загрузиться раньше и первый invoke("bootstrap") падал бы — интерфейс
/// навсегда оставался на «…».
pub fn create(app: &AppHandle) -> tauri::Result<()> {
    WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Swoop")
        .inner_size(1000.0, 680.0)
        .min_inner_size(780.0, 540.0)
        .center()
        .visible(false)
        .build()?;
    Ok(())
}

/// Окно виджета создаём только когда он включён и закрываем, когда выключен: скрытое окно
/// WebView2 продолжало бы жить и рисовать анимацию впустую.
fn build_widget(app: &AppHandle) -> tauri::Result<tauri::WebviewWindow> {
    // Окно больше самого существа — запас под свечение и частицы
    WebviewWindowBuilder::new(app, "widget", WebviewUrl::App("widget.html".into()))
        .title("Swoop")
        .inner_size(230.0, 230.0)
        .decorations(false)
        .transparent(true)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .shadow(false)
        .visible(false)
        .build()
}

/// Сообщить странице главного окна, видно ли его: спрятанное в трей существо не рисует.
pub fn main_visibility(app: &AppHandle, visible: bool) {
    let _ = app.emit_to("main", "swoop-visible", visible);
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
    main_visibility(app, true);
}

/// Мини-виджет: при первом показе ставим в правый нижний угол основного монитора.
/// Окно больше самого существа — запас под свечение, кепку и частицы.
pub fn set_widget_visible(app: &AppHandle, visible: bool) {
    if !visible {
        if let Some(w) = app.get_webview_window("widget") {
            let _ = w.close();
        }
        return;
    }
    let w = match app.get_webview_window("widget") {
        Some(w) => w,
        None => match build_widget(app) {
            Ok(w) => w,
            Err(e) => return eprintln!("не удалось создать виджет: {e}"),
        },
    };
    if !w.is_visible().unwrap_or(false) {
        if let Ok(Some(m)) = w.primary_monitor() {
            let sf = m.scale_factor();
            let area = m.work_area();
            let pos = area.position.to_logical::<f64>(sf);
            let size = area.size.to_logical::<f64>(sf);
            let win = w.outer_size().map(|s| s.to_logical::<f64>(sf)).unwrap_or(tauri::LogicalSize::new(230.0, 230.0));
            // Прозрачные поля окна прижимаем к краю экрана, чтобы само существо стояло в углу
            let _ = w.set_position(LogicalPosition::new(
                pos.x + size.width - win.width + 20.0,
                pos.y + size.height - win.height + 10.0,
            ));
        }
    }
    let _ = w.show();
}
