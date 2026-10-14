//! WebSocket для телефона: онлайн-статус устройства и живые обновления полки и текстов.

use std::time::Duration;

use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::Response;
use futures_util::{SinkExt, StreamExt};
use tokio::sync::broadcast::error::RecvError;

use super::auth::Phone;
use crate::db::Device;
use crate::state::{Event, Shared};

pub async fn handler(State(st): State<Shared>, Phone(dev): Phone, ws: WebSocketUpgrade) -> Response {
    ws.on_upgrade(move |socket| session(st, dev, socket))
}

/// Нужно ли это событие конкретному телефону.
fn relevant(ev: &Event, dev: &Device) -> bool {
    match ev {
        Event::Shelf { .. } | Event::Text { .. } | Event::TextRemoved { .. } | Event::TokenReset => true,
        Event::UploadDone { item, .. } => item.device_id == dev.id,
        _ => false,
    }
}

async fn session(st: Shared, dev: Device, socket: WebSocket) {
    *st.online.lock().unwrap_or_else(|e| e.into_inner()).entry(dev.id.clone()).or_default() += 1;
    st.db.touch_device(&dev.id);
    st.emit_devices();

    let (mut tx, mut rx) = socket.split();
    let mut events = st.tx.subscribe();
    let mut ping = tokio::time::interval(Duration::from_secs(20));

    loop {
        tokio::select! {
            ev = events.recv() => match ev {
                Ok(Event::Devices { devices }) => {
                    // Устройство отключили на ПК — сообщаем и закрываем соединение
                    if !devices.iter().any(|d| d.id == dev.id) {
                        let _ = tx.send(Message::Text(r#"{"type":"revoked"}"#.into())).await;
                        break;
                    }
                }
                Ok(ev) if relevant(&ev, &dev) => {
                    let Ok(json) = serde_json::to_string(&ev) else { continue };
                    if tx.send(Message::Text(json.into())).await.is_err() {
                        break;
                    }
                    if matches!(ev, Event::TokenReset) {
                        break;
                    }
                }
                Ok(_) | Err(RecvError::Lagged(_)) => {}
                Err(RecvError::Closed) => break,
            },
            msg = rx.next() => match msg {
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                Some(Ok(_)) => {}
            },
            _ = ping.tick() => {
                if tx.send(Message::Ping(Vec::new().into())).await.is_err() {
                    break;
                }
            }
        }
    }

    {
        let mut online = st.online.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(n) = online.get_mut(&dev.id) {
            *n = n.saturating_sub(1);
            if *n == 0 {
                online.remove(&dev.id);
            }
        }
    }
    st.db.touch_device(&dev.id);
    st.emit_devices();
}
