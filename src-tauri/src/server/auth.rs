//! Сопряжение по токену из QR и ключ устройства «id.secret».
//! Ключ приходит в cookie, в заголовке x-swoop-key или в ?k= (ссылки на скачивание, start_url).

use axum::extract::{FromRequestParts, State};
use axum::http::header::{COOKIE, SET_COOKIE};
use axum::http::request::Parts;
use axum::http::{HeaderValue, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Json;
use std::sync::atomic::Ordering;
use serde::Deserialize;
use serde_json::json;

use super::{ApiError, ApiResult};
use crate::db::Device;
use crate::state::Shared;

pub fn same_secret(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

fn key_from(parts: &Parts) -> Option<String> {
    if let Some(v) = parts.headers.get("x-swoop-key").and_then(|v| v.to_str().ok()) {
        return Some(v.to_string());
    }
    let cookie = parts
        .headers
        .get_all(COOKIE)
        .iter()
        .filter_map(|v| v.to_str().ok())
        .flat_map(|v| v.split(';'))
        .find_map(|c| c.trim().strip_prefix("swoop=").map(str::to_string));
    if cookie.is_some() {
        return cookie;
    }
    parts.uri.query()?.split('&').find_map(|kv| kv.strip_prefix("k=").map(str::to_string))
}

/// Экстрактор: запрос от сопряжённого устройства.
pub struct Phone(pub Device);

impl FromRequestParts<Shared> for Phone {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, st: &Shared) -> Result<Self, Self::Rejection> {
        let key = key_from(parts).ok_or(ApiError::new(StatusCode::UNAUTHORIZED, "unauthorized"))?;
        let dev = st
            .db
            .device_by_key(&key)
            .ok_or(ApiError::new(StatusCode::UNAUTHORIZED, "unauthorized"))?;
        Ok(Phone(dev))
    }
}

fn with_cookie(mut resp: Response, key: &str) -> Response {
    if let Ok(v) = HeaderValue::from_str(&format!(
        "swoop={key}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax"
    )) {
        resp.headers_mut().insert(SET_COOKIE, v);
    }
    resp
}

fn clean_name(name: Option<&str>) -> String {
    let n: String = name.unwrap_or("").trim().chars().filter(|c| !c.is_control()).take(40).collect();
    if n.is_empty() { "iPhone".into() } else { n }
}

pub fn pc_name() -> String {
    std::env::var("COMPUTERNAME").unwrap_or_else(|_| "PC".into())
}

#[derive(Deserialize)]
pub struct PairReq {
    token: String,
    name: Option<String>,
}

pub async fn pair(State(st): State<Shared>, Json(req): Json<PairReq>) -> ApiResult<Response> {
    if !same_secret(&req.token, &st.settings().token) {
        return Err(ApiError::new(StatusCode::FORBIDDEN, "bad_token"));
    }
    let (device, key) = st.db.add_device(&clean_name(req.name.as_deref())).map_err(ApiError::internal)?;
    st.emit_devices();
    let body = Json(json!({ "device": device, "key": key, "pc": pc_name(), "filesPort": st.files_port.load(Ordering::Relaxed) }));
    Ok(with_cookie(body.into_response(), &key))
}

#[derive(Deserialize)]
pub struct ResumeReq {
    key: String,
}

/// Повторный вход по сохранённому ключу (иконка «Домой» живёт в отдельном хранилище iOS).
pub async fn resume(State(st): State<Shared>, Json(req): Json<ResumeReq>) -> ApiResult<Response> {
    let device = st.db.device_by_key(&req.key).ok_or(ApiError::new(StatusCode::UNAUTHORIZED, "unauthorized"))?;
    st.db.touch_device(&device.id);
    let body = Json(json!({ "device": device, "key": req.key, "pc": pc_name(), "filesPort": st.files_port.load(Ordering::Relaxed) }));
    Ok(with_cookie(body.into_response(), &req.key))
}

pub async fn me(State(st): State<Shared>, Phone(device): Phone) -> Json<serde_json::Value> {
    st.db.touch_device(&device.id);
    Json(json!({ "device": device, "pc": pc_name(), "filesPort": st.files_port.load(Ordering::Relaxed) }))
}

#[derive(Deserialize)]
pub struct RenameReq {
    name: String,
}

pub async fn rename(State(st): State<Shared>, Phone(device): Phone, Json(req): Json<RenameReq>) -> ApiResult<StatusCode> {
    st.db.rename_device(&device.id, &clean_name(Some(&req.name))).map_err(ApiError::internal)?;
    st.emit_devices();
    Ok(StatusCode::NO_CONTENT)
}
