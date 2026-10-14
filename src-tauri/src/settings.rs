use std::path::{Path, PathBuf};

use base64::Engine;
use serde::{Deserialize, Serialize};

pub const DEFAULT_PORT: u16 = 53917;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub port: u16,
    /// Секрет из QR-кода. Без него сервер не пускает новые устройства.
    pub token: String,
    pub save_dir: PathBuf,
    /// Текст с телефона сразу кладётся в буфер обмена ПК.
    pub auto_copy: bool,
    pub sounds: bool,
    pub notifications: bool,
    pub widget: bool,
    /// IP, выбранный пользователем для QR (если адаптеров несколько).
    pub preferred_ip: Option<String>,
    /// "auto" (язык Windows), "ru" или "en". Нужен ядру для трея и уведомлений.
    pub lang: String,
    /// "auto", "light" или "dark" — общая для главного окна и виджета.
    pub theme: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            port: DEFAULT_PORT,
            token: random_token(24),
            save_dir: PathBuf::new(),
            auto_copy: false,
            sounds: true,
            notifications: true,
            widget: false,
            preferred_ip: None,
            lang: "auto".into(),
            theme: "auto".into(),
        }
    }
}

impl Settings {
    pub fn load(path: &Path) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> anyhow::Result<()> {
        if let Some(dir) = path.parent() {
            std::fs::create_dir_all(dir)?;
        }
        // Пишем во временный файл и переименовываем, чтобы не оставить половину JSON при сбое
        let tmp = path.with_extension("json.tmp");
        std::fs::write(&tmp, serde_json::to_vec_pretty(self)?)?;
        std::fs::rename(tmp, path)?;
        Ok(())
    }
}

/// Частичное обновление настроек из окна ПК.
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    pub save_dir: Option<PathBuf>,
    pub auto_copy: Option<bool>,
    pub sounds: Option<bool>,
    pub notifications: Option<bool>,
    pub widget: Option<bool>,
    pub preferred_ip: Option<Option<String>>,
    pub lang: Option<String>,
    pub theme: Option<String>,
}

impl SettingsPatch {
    pub fn apply(self, s: &mut Settings) {
        if let Some(v) = self.save_dir {
            s.save_dir = v;
        }
        if let Some(v) = self.auto_copy {
            s.auto_copy = v;
        }
        if let Some(v) = self.sounds {
            s.sounds = v;
        }
        if let Some(v) = self.notifications {
            s.notifications = v;
        }
        if let Some(v) = self.widget {
            s.widget = v;
        }
        if let Some(v) = self.preferred_ip {
            s.preferred_ip = v;
        }
        if let Some(v) = self.lang.filter(|v| ["auto", "ru", "en"].contains(&v.as_str())) {
            s.lang = v;
        }
        if let Some(v) = self.theme.filter(|v| ["auto", "light", "dark"].contains(&v.as_str())) {
            s.theme = v;
        }
    }
}

pub fn random_token(bytes: usize) -> String {
    let mut buf = vec![0u8; bytes];
    rand::fill(&mut buf[..]);
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(buf)
}

pub fn random_id() -> String {
    let mut buf = [0u8; 8];
    rand::fill(&mut buf);
    buf.iter().map(|b| format!("{b:02x}")).collect()
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}
