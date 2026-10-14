//! Загрузка с докачкой.
//!   POST /api/uploads {name,size,mime,lastModified} → {id, offset}
//!   PUT  /api/uploads/{id}?offset=N  (тело — очередной кусок) → {offset, done, item?}
//! Источник правды о смещении — длина временного файла. Если связь оборвалась посреди куска,
//! уже записанные байты остаются, и клиент продолжает с того места, которое вернёт сервер.

use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};

use axum::body::{Body, Bytes};
use axum::extract::{Path as UrlPath, Query, State};
use axum::http::StatusCode;
use axum::Json;
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::json;
use tokio::io::AsyncWriteExt;

use super::auth::Phone;
use super::{ApiError, ApiResult};
use crate::db::{Device, HistoryItem, UploadRow};
use crate::names::{sanitize, unique_path};
use crate::settings::random_id;
use crate::state::{Event, Shared};

const TMP_DIR: &str = ".swoop-incoming";
/// Если столько времени не пришло ни байта — считаем запрос оборванным: телефон уснул или
/// потерял Wi‑Fi, а сокет остался открытым. Принятое сохраняем, файл освобождаем.
const IDLE: Duration = if cfg!(test) { Duration::from_millis(600) } else { Duration::from_secs(20) };
/// Сколько новый запрос ждёт, пока прежний (разбуженный через cancel) сохранит данные.
const LOCK_WAIT: Duration = Duration::from_secs(10);

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateReq {
    name: String,
    size: u64,
    mime: Option<String>,
    last_modified: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadStatus {
    id: String,
    offset: u64,
    size: u64,
    done: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    item: Option<HistoryItem>,
}

/// Папка для приёма и скрытая подпапка для недокачанных файлов (на том же диске — rename мгновенный).
fn incoming_dir(st: &Shared) -> ApiResult<PathBuf> {
    let save = st.settings().save_dir;
    let tmp = save.join(TMP_DIR);
    if !tmp.exists() {
        std::fs::create_dir_all(&tmp).map_err(|_| ApiError::new(StatusCode::INSUFFICIENT_STORAGE, "save_dir"))?;
        hide(&tmp);
    }
    Ok(tmp)
}

#[cfg(windows)]
fn hide(path: &Path) {
    use std::os::windows::process::CommandExt;
    let _ = std::process::Command::new("attrib")
        .arg("+h")
        .arg(path)
        .creation_flags(0x0800_0000)
        .status();
}
#[cfg(not(windows))]
fn hide(_: &Path) {}

async fn file_len(path: &Path) -> Option<u64> {
    tokio::fs::metadata(path).await.ok().map(|m| m.len())
}

fn own_upload(st: &Shared, id: &str, dev: &Device) -> ApiResult<UploadRow> {
    st.db
        .get_upload(id)
        .filter(|u| u.device_id == dev.id)
        .ok_or(ApiError::new(StatusCode::NOT_FOUND, "no_upload"))
}

pub async fn create(State(st): State<Shared>, Phone(dev): Phone, Json(req): Json<CreateReq>) -> ApiResult<Json<UploadStatus>> {
    let name = sanitize(&req.name);
    let lm = req.last_modified.unwrap_or(0);
    let mime = req
        .mime
        .filter(|m| !m.is_empty())
        .unwrap_or_else(|| mime_guess::from_path(&name).first_or_octet_stream().to_string());

    // Тот же файл уже начинали — продолжаем с места обрыва
    if let Some(u) = st.db.find_upload(&dev.id, &name, req.size, lm) {
        if let Some(offset) = file_len(&u.tmp_path).await {
            st.log(format!("resume {} «{name}» с {offset}/{} от «{}»", u.id, u.size, dev.name));
            st.emit(Event::UploadStarted {
                id: u.id.clone(),
                device_id: dev.id.clone(),
                device_name: dev.name.clone(),
                name: u.name.clone(),
                size: u.size,
                offset,
            });
            return Ok(Json(UploadStatus { id: u.id, offset, size: u.size, done: false, item: None }));
        }
        st.db.remove_upload(&u.id);
    }

    let tmp_dir = incoming_dir(&st)?;
    let id = random_id();
    let tmp_path = tmp_dir.join(format!("{id}.part"));
    tokio::fs::File::create(&tmp_path).await.map_err(ApiError::internal)?;
    let row = UploadRow {
        id: id.clone(),
        device_id: dev.id.clone(),
        name: name.clone(),
        size: req.size,
        mime,
        last_modified: lm,
        tmp_path,
    };
    st.db.add_upload(&row).map_err(ApiError::internal)?;
    st.log(format!("new {id} «{}» {} байт ({}) от «{}»", row.name, row.size, row.mime, dev.name));
    st.emit(Event::UploadStarted {
        id: id.clone(),
        device_id: dev.id.clone(),
        device_name: dev.name.clone(),
        name,
        size: req.size,
        offset: 0,
    });

    if req.size == 0 {
        let item = finalize(&st, &row, &dev).await?;
        return Ok(Json(UploadStatus { id, offset: 0, size: 0, done: true, item: Some(item) }));
    }
    Ok(Json(UploadStatus { id, offset: 0, size: req.size, done: false, item: None }))
}

pub async fn status(State(st): State<Shared>, Phone(dev): Phone, UrlPath(id): UrlPath<String>) -> ApiResult<Json<UploadStatus>> {
    let u = own_upload(&st, &id, &dev)?;
    let offset = file_len(&u.tmp_path).await.unwrap_or(0);
    Ok(Json(UploadStatus { id, offset, size: u.size, done: false, item: None }))
}

#[derive(Deserialize)]
pub struct ChunkQuery {
    offset: u64,
}

pub async fn put_chunk(
    State(st): State<Shared>,
    Phone(dev): Phone,
    UrlPath(id): UrlPath<String>,
    Query(q): Query<ChunkQuery>,
    headers: axum::http::HeaderMap,
    body: Body,
) -> ApiResult<Json<UploadStatus>> {
    let u = own_upload(&st, &id, &dev)?;
    let len = headers.get(axum::http::header::CONTENT_LENGTH).and_then(|v| v.to_str().ok()).unwrap_or("?");
    st.log(format!("put {id} «{}» offset={} len={len}", u.name, q.offset));
    let slot = st.upload_lock(&id);
    // Прежний запрос по этому файлу мог зависнуть в ожидании данных — будим его: он сохранит
    // принятое и отпустит файл. Иначе новый запрос ждал бы его вечно.
    slot.cancel.notify_waiters();
    let _guard = match tokio::time::timeout(LOCK_WAIT, slot.lock.lock()).await {
        Ok(g) => g,
        Err(_) => {
            st.log(format!("put {id}: файл занят другим запросом"));
            return Err(ApiError::new(StatusCode::SERVICE_UNAVAILABLE, "busy"));
        }
    };

    let mut file = tokio::fs::OpenOptions::new()
        .append(true)
        .open(&u.tmp_path)
        .await
        .map_err(|_| ApiError::new(StatusCode::GONE, "tmp_missing"))?;
    let mut cur = file.metadata().await.map_err(ApiError::internal)?.len();
    if q.offset != cur {
        st.log(format!("put {id}: смещение {} ≠ {cur}", q.offset));
        return Err(ApiError::with(StatusCode::CONFLICT, "offset_mismatch", json!({ "offset": cur })));
    }

    let mut stream = body.into_data_stream();
    let mut last_emit = Instant::now();
    let start = cur;
    let mut broken: Option<&str> = None;
    loop {
        let next = tokio::select! {
            c = stream.next() => c,
            _ = slot.cancel.notified() => { broken = Some("superseded"); break; }
            _ = tokio::time::sleep(IDLE) => { broken = Some("idle"); break; }
        };
        let Some(chunk) = next else { break };
        let chunk = match chunk {
            Ok(c) => c,
            Err(_) => {
                broken = Some("interrupted"); // связь оборвалась — сохраняем то, что успели получить
                break;
            }
        };
        let room = u.size.saturating_sub(cur) as usize;
        if chunk.len() > room {
            file.write_all(&chunk[..room]).await.map_err(ApiError::internal)?;
            file.flush().await.map_err(ApiError::internal)?;
            return Err(ApiError::with(StatusCode::PAYLOAD_TOO_LARGE, "too_large", json!({ "offset": u.size })));
        }
        if let Err(e) = file.write_all(&chunk).await {
            let _ = file.flush().await;
            return Err(if e.kind() == std::io::ErrorKind::StorageFull {
                ApiError::new(StatusCode::INSUFFICIENT_STORAGE, "disk_full")
            } else {
                ApiError::internal(e)
            });
        }
        cur += chunk.len() as u64;
        if last_emit.elapsed() > Duration::from_millis(200) {
            last_emit = Instant::now();
            st.emit(Event::UploadProgress { id: id.clone(), device_id: dev.id.clone(), received: cur, size: u.size });
        }
    }
    file.flush().await.map_err(ApiError::internal)?;
    drop(file);
    st.emit(Event::UploadProgress { id: id.clone(), device_id: dev.id.clone(), received: cur, size: u.size });

    st.log(format!("put {id}: +{} байт, всего {cur}/{}{}", cur - start, u.size, broken.map(|r| format!(", прервано: {r}")).unwrap_or_default()));
    if let Some(reason) = broken {
        return Err(ApiError::with(StatusCode::BAD_REQUEST, "interrupted", json!({ "offset": cur, "reason": reason })));
    }
    if cur < u.size {
        return Ok(Json(UploadStatus { id, offset: cur, size: u.size, done: false, item: None }));
    }
    let item = finalize(&st, &u, &dev).await?;
    Ok(Json(UploadStatus { id, offset: cur, size: u.size, done: true, item: Some(item) }))
}

/// Файл докачан: переносим из временной папки под настоящим именем и пишем в историю.
async fn finalize(st: &Shared, u: &UploadRow, dev: &Device) -> ApiResult<HistoryItem> {
    let save_dir = u
        .tmp_path
        .parent()
        .and_then(Path::parent)
        .map(Path::to_path_buf)
        .ok_or(ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, "bad_tmp"))?;
    let target = unique_path(&save_dir, &u.name);
    tokio::fs::rename(&u.tmp_path, &target).await.map_err(ApiError::internal)?;
    // Дату файла не подменяем исходной с телефона: время изменения — момент приёма,
    // чтобы при сортировке по дате последние переданные файлы были сверху.
    // lastModified с телефона нужен только чтобы узнать тот же файл при докачке.
    let final_name = target.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| u.name.clone());
    let item = st.db.add_history(dev, &final_name, u.size, &target, &u.mime).map_err(ApiError::internal)?;
    st.db.remove_upload(&u.id);
    st.drop_upload_lock(&u.id);
    st.log(format!("done {} → «{final_name}» ({} байт)", u.id, u.size));
    st.emit(Event::UploadDone { id: u.id.clone(), item: item.clone() });
    Ok(item)
}

pub async fn cancel(State(st): State<Shared>, Phone(dev): Phone, UrlPath(id): UrlPath<String>) -> ApiResult<StatusCode> {
    let u = own_upload(&st, &id, &dev)?;
    let slot = st.upload_lock(&id);
    slot.cancel.notify_waiters();
    let _guard = slot.lock.lock().await;
    st.log(format!("cancel {id} «{}»", u.name));
    let _ = tokio::fs::remove_file(&u.tmp_path).await;
    st.db.remove_upload(&id);
    st.emit(Event::UploadCancelled { id: id.clone(), device_id: dev.id });
    drop(_guard);
    st.drop_upload_lock(&id);
    Ok(StatusCode::NO_CONTENT)
}

pub async fn history(State(st): State<Shared>, Phone(dev): Phone) -> ApiResult<Json<Vec<HistoryItem>>> {
    st.db.list_history(Some(&dev.id), 200).map(Json).map_err(ApiError::internal)
}

/// Превью делает телефон (canvas или кадр видео), поэтому ПК не нужно уметь декодировать HEIC.
pub async fn thumb(State(st): State<Shared>, Phone(dev): Phone, UrlPath(id): UrlPath<i64>, body: Bytes) -> ApiResult<StatusCode> {
    let item = st
        .db
        .get_history(id)
        .filter(|h| h.device_id == dev.id)
        .ok_or(ApiError::new(StatusCode::NOT_FOUND, "no_item"))?;
    // JPEG начинается с FF D8 — не храним что попало
    if body.len() < 4 || body[0] != 0xFF || body[1] != 0xD8 {
        return Err(ApiError::new(StatusCode::UNSUPPORTED_MEDIA_TYPE, "not_jpeg"));
    }
    let dir = st.thumbs_dir();
    tokio::fs::create_dir_all(&dir).await.map_err(ApiError::internal)?;
    tokio::fs::write(dir.join(format!("{}.jpg", item.id)), &body).await.map_err(ApiError::internal)?;
    st.db.set_thumb(item.id);
    st.emit(Event::HistoryThumb { id: item.id });
    Ok(StatusCode::NO_CONTENT)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::net::SocketAddr;
    use std::sync::atomic::AtomicU16;
    use std::sync::{Arc, Mutex, RwLock};
    use std::time::Duration;

    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    use tokio::net::TcpStream;

    use crate::db::Db;
    use crate::settings::{random_id, Settings};
    use crate::state::{AppState, Shared};

    /// Сервер на свободном порту с временной папкой. Возвращает адрес, ключ устройства и папку.
    async fn server() -> (SocketAddr, String, std::path::PathBuf) {
        let dir = std::env::temp_dir().join(format!("swoop-up-{}", random_id()));
        std::fs::create_dir_all(&dir).unwrap();
        let settings = Settings { save_dir: dir.join("in"), ..Settings::default() };
        let (tx, _) = tokio::sync::broadcast::channel(64);
        let st: Shared = Arc::new(AppState {
            settings: RwLock::new(settings),
            settings_path: dir.join("settings.json"),
            db: Db::open(&dir.join("t.db")).unwrap(),
            data_dir: dir.clone(),
            tx,
            port: AtomicU16::new(0),
            files_port: AtomicU16::new(0),
            public_networks: Mutex::new(vec![]),
            online: Mutex::new(HashMap::new()),
            upload_locks: Mutex::new(HashMap::new()),
        });
        let (_, key) = st.db.add_device("test").unwrap();
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        listener.set_nonblocking(true).unwrap();
        let addr = listener.local_addr().unwrap();
        tokio::spawn(super::super::serve(st, listener));
        (addr, key, dir)
    }

    async fn send_head(addr: SocketAddr, head: String) -> TcpStream {
        let mut s = TcpStream::connect(addr).await.unwrap();
        s.write_all(head.as_bytes()).await.unwrap();
        s
    }

    async fn read_response(mut s: TcpStream) -> (u16, String) {
        let mut buf = Vec::new();
        let _ = tokio::time::timeout(Duration::from_secs(10), s.read_to_end(&mut buf)).await;
        let text = String::from_utf8_lossy(&buf).to_string();
        let status = text.split(' ').nth(1).and_then(|c| c.parse().ok()).unwrap_or(0);
        let body = text.split("\r\n\r\n").nth(1).unwrap_or("").to_string();
        (status, body)
    }

    async fn create(addr: SocketAddr, key: &str, size: usize) -> String {
        let json = format!(r#"{{"name":"stall.bin","size":{size},"lastModified":1}}"#);
        let mut s = send_head(
            addr,
            format!(
                "POST /api/uploads HTTP/1.1\r\nHost: x\r\nx-swoop-key: {key}\r\ncontent-type: application/json\r\ncontent-length: {}\r\nconnection: close\r\n\r\n",
                json.len()
            ),
        )
        .await;
        s.write_all(json.as_bytes()).await.unwrap();
        let (status, body) = read_response(s).await;
        assert_eq!(status, 200, "{body}");
        let v: serde_json::Value = serde_json::from_str(&body).unwrap();
        v["id"].as_str().unwrap().to_string()
    }

    fn put_head(id: &str, key: &str, offset: usize, len: usize) -> String {
        format!(
            "PUT /api/uploads/{id}?offset={offset} HTTP/1.1\r\nHost: x\r\nx-swoop-key: {key}\r\ncontent-length: {len}\r\nconnection: close\r\n\r\n"
        )
    }

    /// Телефон отправил часть куска и замолчал, не закрыв соединение. Новый запрос по тому же
    /// файлу должен разбудить старый, получить точное смещение и докачать файл, а не зависнуть.
    #[tokio::test]
    async fn stalled_request_does_not_block_retry() {
        let (addr, key, dir) = server().await;
        let data: Vec<u8> = (0..1000u32).map(|i| (i % 251) as u8).collect();
        let id = create(addr, &key, data.len()).await;

        // Зависший запрос: объявили 1000 байт, отправили 300 и держим соединение
        let mut stalled = send_head(addr, put_head(&id, &key, 0, 1000)).await;
        stalled.write_all(&data[..300]).await.unwrap();
        tokio::time::sleep(Duration::from_millis(200)).await;

        // Повтор приходит раньше тайм-аута тишины — он будит старый запрос
        let mut retry = send_head(addr, put_head(&id, &key, 300, 700)).await;
        retry.write_all(&data[300..]).await.unwrap();
        let (status, body) = read_response(retry).await;
        assert_eq!(status, 200, "повтор не должен висеть: {body}");
        assert!(body.contains("\"done\":true"), "{body}");

        let (old_status, old_body) = read_response(stalled).await;
        assert_eq!(old_status, 400, "{old_body}");
        assert!(old_body.contains("superseded"), "{old_body}");

        let saved = dir.join("in").join("stall.bin");
        assert_eq!(std::fs::read(&saved).unwrap(), data);
        // lastModified=1 (1970 год) не переносится на файл: дата — момент приёма
        let age = std::fs::metadata(&saved).unwrap().modified().unwrap().elapsed().unwrap();
        assert!(age < Duration::from_secs(60), "дата файла должна быть свежей, а не исходной");
        let _ = std::fs::remove_dir_all(dir);
    }

    /// Если повтора нет, сервер сам отпускает файл после тишины и сообщает принятое смещение.
    #[tokio::test]
    async fn idle_request_releases_upload() {
        let (addr, key, dir) = server().await;
        let id = create(addr, &key, 1000).await;
        let mut stalled = send_head(addr, put_head(&id, &key, 0, 1000)).await;
        stalled.write_all(&[7u8; 400]).await.unwrap();
        let (status, body) = read_response(stalled).await;
        assert_eq!(status, 400, "{body}");
        assert!(body.contains("\"offset\":400") && body.contains("idle"), "{body}");
        let _ = std::fs::remove_dir_all(dir);
    }
}
