//! Полка ПК → телефон. Хранятся ссылки на файлы; отдаём с поддержкой Range, чтобы видео
//! в Safari можно было перематывать, а оборванное скачивание — продолжить.

use std::io::SeekFrom;

use axum::body::Body;
use axum::extract::{Path as UrlPath, Query, State};
use axum::http::header::{ACCEPT_RANGES, CACHE_CONTROL, CONTENT_DISPOSITION, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, RANGE};
use axum::http::{HeaderMap, HeaderValue, StatusCode};
use axum::response::Response;
use axum::Json;
use percent_encoding::{utf8_percent_encode, NON_ALPHANUMERIC};
use serde::Deserialize;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio_util::io::ReaderStream;

use super::auth::Phone;
use super::{ApiError, ApiResult};
use crate::db::ShelfItem;
use crate::state::Shared;

pub async fn list(State(st): State<Shared>, Phone(_): Phone) -> ApiResult<Json<Vec<ShelfItem>>> {
    st.db.list_shelf().map(Json).map_err(ApiError::internal)
}

#[derive(Deserialize)]
pub struct FileQuery {
    inline: Option<u8>,
}

/// Разбор `Range: bytes=a-b` (только первый диапазон). None — заголовок некорректен.
pub fn parse_range(header: &str, len: u64) -> Option<(u64, u64)> {
    let spec = header.trim().strip_prefix("bytes=")?.split(',').next()?.trim();
    let (a, b) = spec.split_once('-')?;
    let (start, end) = match (a.trim(), b.trim()) {
        ("", n) => {
            let n: u64 = n.parse().ok()?;
            (len.saturating_sub(n), len.checked_sub(1)?)
        }
        (s, "") => (s.parse().ok()?, len.checked_sub(1)?),
        (s, e) => (s.parse().ok()?, e.parse::<u64>().ok()?.min(len.checked_sub(1)?)),
    };
    (start <= end && end < len).then_some((start, end))
}

fn disposition(name: &str, inline: bool) -> HeaderValue {
    let ascii: String = name.chars().map(|c| if c.is_ascii_graphic() && c != '"' && c != '\\' { c } else { '_' }).collect();
    let kind = if inline { "inline" } else { "attachment" };
    let v = format!("{kind}; filename=\"{ascii}\"; filename*=UTF-8''{}", utf8_percent_encode(name, NON_ALPHANUMERIC));
    HeaderValue::from_str(&v).unwrap_or(HeaderValue::from_static("attachment"))
}

pub async fn file(
    State(st): State<Shared>,
    Phone(_): Phone,
    UrlPath(id): UrlPath<String>,
    Query(q): Query<FileQuery>,
    headers: HeaderMap,
) -> ApiResult<Response> {
    let item = st.db.get_shelf(&id).ok_or(ApiError::new(StatusCode::NOT_FOUND, "no_item"))?;
    let mut file = tokio::fs::File::open(&item.path)
        .await
        .map_err(|_| ApiError::new(StatusCode::GONE, "file_missing"))?;
    let len = file.metadata().await.map_err(ApiError::internal)?.len();

    let range = headers.get(RANGE).and_then(|v| v.to_str().ok());
    let (start, end, partial) = match range {
        Some(r) if len > 0 => match parse_range(r, len) {
            Some((s, e)) => (s, e, true),
            None => {
                return Response::builder()
                    .status(StatusCode::RANGE_NOT_SATISFIABLE)
                    .header(CONTENT_RANGE, format!("bytes */{len}"))
                    .body(Body::empty())
                    .map_err(ApiError::internal)
            }
        },
        _ => (0, len.saturating_sub(1), false),
    };
    let count = if len == 0 { 0 } else { end - start + 1 };
    file.seek(SeekFrom::Start(start)).await.map_err(ApiError::internal)?;
    let body = Body::from_stream(ReaderStream::with_capacity(file.take(count), 256 * 1024));

    let mut resp = Response::builder()
        .status(if partial { StatusCode::PARTIAL_CONTENT } else { StatusCode::OK })
        .header(CONTENT_TYPE, &item.mime)
        .header(ACCEPT_RANGES, "bytes")
        .header(CONTENT_LENGTH, count)
        .header(CACHE_CONTROL, "no-store")
        .body(body)
        .map_err(ApiError::internal)?;
    resp.headers_mut().insert(CONTENT_DISPOSITION, disposition(&item.name, q.inline == Some(1)));
    if partial {
        resp.headers_mut().insert(
            CONTENT_RANGE,
            HeaderValue::from_str(&format!("bytes {start}-{end}/{len}")).map_err(ApiError::internal)?,
        );
    }
    Ok(resp)
}

#[cfg(test)]
mod tests {
    use super::parse_range;

    #[test]
    fn ranges() {
        assert_eq!(parse_range("bytes=0-99", 1000), Some((0, 99)));
        assert_eq!(parse_range("bytes=500-", 1000), Some((500, 999)));
        assert_eq!(parse_range("bytes=-100", 1000), Some((900, 999)));
        assert_eq!(parse_range("bytes=0-5000", 1000), Some((0, 999)));
        assert_eq!(parse_range("bytes=0-1", 1000), Some((0, 1)));
        assert_eq!(parse_range("bytes=1000-", 1000), None);
        assert_eq!(parse_range("bytes=5-2", 1000), None);
        assert_eq!(parse_range("items=0-1", 1000), None);
        assert_eq!(parse_range("bytes=0-", 0), None);
    }
}
