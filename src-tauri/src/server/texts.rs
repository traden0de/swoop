use axum::extract::State;
use axum::http::StatusCode;
use axum::Json;
use serde::Deserialize;

use super::auth::Phone;
use super::{ApiError, ApiResult};
use crate::db::TextItem;
use crate::state::{Event, Shared};

const MAX_CHARS: usize = 100_000;

pub async fn list(State(st): State<Shared>, Phone(_): Phone) -> ApiResult<Json<Vec<TextItem>>> {
    st.db.list_texts(100).map(Json).map_err(ApiError::internal)
}

#[derive(Deserialize)]
pub struct TextReq {
    text: String,
}

pub async fn create(State(st): State<Shared>, Phone(dev): Phone, Json(req): Json<TextReq>) -> ApiResult<Json<TextItem>> {
    let text = req.text.trim_end();
    if text.trim().is_empty() {
        return Err(ApiError::new(StatusCode::BAD_REQUEST, "empty"));
    }
    if text.chars().count() > MAX_CHARS {
        return Err(ApiError::new(StatusCode::PAYLOAD_TOO_LARGE, "too_long"));
    }
    let item = st.db.add_text(Some(&dev), text).map_err(ApiError::internal)?;
    st.emit(Event::Text { item: item.clone() });
    Ok(Json(item))
}
