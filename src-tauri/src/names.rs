//! Имена файлов, пришедших с телефона: чистим от запрещённого в Windows и избегаем перезаписи.

use std::path::{Path, PathBuf};

const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// Оставляет только последний компонент имени и заменяет символы, недопустимые в Windows.
pub fn sanitize(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or("");
    let mut out: String = base
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    // Windows не любит точки и пробелы в конце имени
    while out.ends_with('.') || out.ends_with(' ') {
        out.pop();
    }
    let out = out.trim_start().to_string();
    let stem = out.split('.').next().unwrap_or("").to_ascii_uppercase();
    let mut out = if RESERVED.contains(&stem.as_str()) { format!("_{out}") } else { out };
    if out.is_empty() || out == "." || out == ".." {
        out = "file".into();
    }
    // Ограничиваем длину, сохраняя расширение
    if out.chars().count() > 180 {
        let (stem, ext) = split_ext(&out);
        let stem: String = stem.chars().take(170).collect();
        out = format!("{stem}{ext}");
    }
    out
}

fn split_ext(name: &str) -> (&str, &str) {
    match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name, ""),
    }
}

/// Первый свободный путь: «IMG_1.jpg», «IMG_1 (2).jpg», «IMG_1 (3).jpg»…
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let candidate = dir.join(name);
    if !candidate.exists() {
        return candidate;
    }
    let (stem, ext) = split_ext(name);
    (2..)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|p| !p.exists())
        .expect("бесконечный итератор")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_paths_and_bad_chars() {
        assert_eq!(sanitize("../../etc/passwd"), "passwd");
        assert_eq!(sanitize("C:\\x\\a:b?.txt"), "a_b_.txt");
        assert_eq!(sanitize("con.txt"), "_con.txt");
        assert_eq!(sanitize("photo. "), "photo");
        assert_eq!(sanitize(""), "file");
        assert_eq!(sanitize(".."), "file");
    }

    #[test]
    fn unique_adds_counter() {
        let dir = std::env::temp_dir().join(format!("swoop-test-{}", crate::settings::random_id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(unique_path(&dir, "a.jpg"), dir.join("a.jpg"));
        std::fs::write(dir.join("a.jpg"), b"1").unwrap();
        assert_eq!(unique_path(&dir, "a.jpg"), dir.join("a (2).jpg"));
        std::fs::write(dir.join("a (2).jpg"), b"1").unwrap();
        assert_eq!(unique_path(&dir, "a.jpg"), dir.join("a (3).jpg"));
        assert_eq!(unique_path(&dir, "noext"), dir.join("noext"));
        std::fs::remove_dir_all(dir).unwrap();
    }
}
