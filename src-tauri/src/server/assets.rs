//! Раздача веб-приложения для телефона из собранного dist (в release — вшито в exe).

use axum::extract::{Query, State};
use axum::http::header::{CACHE_CONTROL, CONTENT_TYPE};
use axum::http::{StatusCode, Uri};
use axum::response::{IntoResponse, Response};
use axum::Json;
use rust_embed::Embed;
use serde::Deserialize;
use serde_json::json;

use crate::state::Shared;

#[derive(Embed)]
#[folder = "../dist/"]
struct Dist;

/// Страницы окон ПК телефону не нужны.
const DESKTOP_ONLY: &[&str] = &["index.html", "widget.html"];

pub async fn static_handler(uri: Uri) -> Response {
    let path = uri.path().trim_start_matches('/');
    let path = if path.is_empty() { "phone.html" } else { path };
    if DESKTOP_ONLY.contains(&path) {
        return StatusCode::NOT_FOUND.into_response();
    }
    match Dist::get(path) {
        Some(file) => {
            let mime = mime_guess::from_path(path).first_or_octet_stream();
            let cache = if path.starts_with("assets/") { "public, max-age=31536000, immutable" } else { "no-cache" };
            ([(CONTENT_TYPE, mime.as_ref()), (CACHE_CONTROL, cache)], file.data).into_response()
        }
        None => StatusCode::NOT_FOUND.into_response(),
    }
}

#[derive(Deserialize)]
pub struct ManifestQuery {
    k: Option<String>,
}

/// У иконки «На экран Домой» в iOS своё хранилище без cookie Safari, поэтому ключ устройства
/// передаётся в start_url. Ключ выдаём, только если он действителен.
pub async fn manifest(State(st): State<Shared>, Query(q): Query<ManifestQuery>) -> Response {
    let start = match q.k.filter(|k| st.db.device_by_key(k).is_some()) {
        Some(k) => format!("/?k={k}"),
        None => "/".into(),
    };
    let body = json!({
        "name": "Swoop",
        "short_name": "Swoop",
        "start_url": start,
        "scope": "/",
        "display": "standalone",
        "background_color": "#111318",
        "theme_color": "#111318",
        "icons": [
            { "src": "/apple-touch-icon.png", "sizes": "180x180", "type": "image/png" },
            { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
            { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
        ]
    });
    ([(CONTENT_TYPE, "application/manifest+json"), (CACHE_CONTROL, "no-store")], Json(body)).into_response()
}
