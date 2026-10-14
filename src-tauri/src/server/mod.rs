//! HTTP-сервер для телефонов. Всё, кроме статики, сопряжения и manifest, требует ключ устройства.

mod assets;
mod auth;
mod shelf;
mod texts;
mod uploads;
mod ws;

use axum::extract::DefaultBodyLimit;
use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde_json::json;

use crate::state::Shared;

pub use auth::pc_name;

#[derive(Debug)]
pub struct ApiError(StatusCode, &'static str, Option<serde_json::Value>);

impl ApiError {
    pub fn new(code: StatusCode, err: &'static str) -> Self {
        Self(code, err, None)
    }
    pub fn with(code: StatusCode, err: &'static str, extra: serde_json::Value) -> Self {
        Self(code, err, Some(extra))
    }
    pub fn internal(e: impl std::fmt::Display) -> Self {
        eprintln!("ошибка сервера: {e}");
        Self(StatusCode::INTERNAL_SERVER_ERROR, "internal", None)
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let mut body = json!({ "error": self.1 });
        if let (Some(extra), Some(obj)) = (self.2, body.as_object_mut()) {
            if let Some(extra) = extra.as_object() {
                obj.extend(extra.clone());
            }
        }
        (self.0, Json(body)).into_response()
    }
}

pub type ApiResult<T> = Result<T, ApiError>;

pub fn router(st: Shared) -> Router {
    let api = Router::new()
        .route("/pair", post(auth::pair))
        .route("/resume", post(auth::resume))
        .route("/me", get(auth::me).patch(auth::rename))
        .route("/uploads", post(uploads::create))
        .route(
            "/uploads/{id}",
            get(uploads::status)
                .put(uploads::put_chunk)
                .layer(DefaultBodyLimit::disable())
                .delete(uploads::cancel),
        )
        .route("/history", get(uploads::history))
        .route("/history/{id}/thumb", post(uploads::thumb))
        .route("/shelf", get(shelf::list))
        .route("/shelf/{id}/file", get(shelf::file))
        .route("/texts", get(texts::list).post(texts::create))
        .route("/ws", get(ws::handler))
        .fallback(|| async { ApiError::new(StatusCode::NOT_FOUND, "not_found") })
        .layer(DefaultBodyLimit::max(2 * 1024 * 1024));

    Router::new()
        .nest("/api", api)
        .route("/manifest.webmanifest", get(assets::manifest))
        .fallback(assets::static_handler)
        .with_state(st)
}

pub async fn serve(st: Shared, listener: std::net::TcpListener) {
    let listener = match tokio::net::TcpListener::from_std(listener) {
        Ok(l) => l,
        Err(e) => return eprintln!("не удалось запустить сервер: {e}"),
    };
    if let Err(e) = axum::serve(listener, router(st)).await {
        eprintln!("сервер остановился: {e}");
    }
}
