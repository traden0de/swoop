// Клиент для сервера на ПК. Ключ устройства храним в localStorage и шлём заголовком:
// cookie в Safari и у иконки «Домой» живут раздельно, а заголовок работает везде.

import type { Device, HistoryItem, ServerEvent, ShelfItem, TextItem } from '../shared/types';

const KEY = 'swoop.key';

export function getKey(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function setKey(k: string | null) {
  try {
    k ? localStorage.setItem(KEY, k) : localStorage.removeItem(KEY);
  } catch {
    /* приватный режим — живём на cookie */
  }
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, public body: Record<string, unknown> = {}) {
    super(code);
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const key = getKey();
  if (key) headers['x-swoop-key'] = key;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'network');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'error', data);
  return data as T;
}

export interface Session {
  device: Device;
  key?: string;
  pc: string;
  /** Второй порт сервера для ссылок на файлы (см. fileUrl). */
  filesPort?: number;
}

let filesPort: number | undefined;
export function setFilesPort(p: number | undefined) {
  filesPort = p;
}

export const api = {
  pair: (token: string, name: string) => req<Session>('POST', '/api/pair', { token, name }),
  resume: (key: string) => req<Session>('POST', '/api/resume', { key }),
  me: () => req<Session>('GET', '/api/me'),
  rename: (name: string) => req<void>('PATCH', '/api/me', { name }),
  history: () => req<HistoryItem[]>('GET', '/api/history'),
  shelf: () => req<ShelfItem[]>('GET', '/api/shelf'),
  texts: () => req<TextItem[]>('GET', '/api/texts'),
  sendText: (text: string) => req<TextItem>('POST', '/api/texts', { text }),
  createUpload: (f: { name: string; size: number; mime: string; lastModified: number }) =>
    req<{ id: string; offset: number; size: number; done: boolean; item?: HistoryItem }>('POST', '/api/uploads', f),
  uploadStatus: (id: string) => req<{ offset: number }>('GET', `/api/uploads/${id}`),
  cancelUpload: (id: string) => req<void>('DELETE', `/api/uploads/${id}`),
  async thumb(historyId: number, blob: Blob) {
    const key = getKey();
    await fetch(`/api/history/${historyId}/thumb`, {
      method: 'POST',
      headers: key ? { 'x-swoop-key': key, 'content-type': 'image/jpeg' } : { 'content-type': 'image/jpeg' },
      body: blob,
    }).catch(() => {});
  },
  /**
   * Ссылка на файл с полки. external — на второй порт: у иконки «Домой» iOS открывает такие
   * ссылки во встроенном браузере с кнопкой «Готово». Ссылка на тот же адрес открылась бы
   * прямо в приложении, и вернуться было бы нельзя. Ключ в ?k=, потому что cookie там не видны.
   */
  fileUrl(id: string, opts: { inline?: boolean; external?: boolean } = {}) {
    const k = getKey();
    const q = new URLSearchParams();
    if (k) q.set('k', k);
    if (opts.inline) q.set('inline', '1');
    const path = `/api/shelf/${id}/file?${q}`;
    return opts.external && filesPort ? `${location.protocol}//${location.hostname}:${filesPort}${path}` : path;
  },
};

export interface PutResult {
  offset: number;
  done: boolean;
  item?: HistoryItem;
}

/** Сколько ждём хоть какого-то движения отправки, прежде чем считать запрос зависшим. */
const STALL_MS = 30_000;

/**
 * Один кусок файла через XHR — ради прогресса отправки, которого нет у fetch.
 * Если отправка стоит дольше STALL_MS (iOS приостановил вкладку, Wi‑Fi моргнул, а соединение
 * не закрылось), прерываем сами — загрузчик спросит у сервера смещение и продолжит.
 */
export function putChunk(id: string, offset: number, blob: Blob, onProgress: (loaded: number) => void, signal: AbortSignal) {
  return new Promise<PutResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/uploads/${id}?offset=${offset}`);
    const key = getKey();
    if (key) xhr.setRequestHeader('x-swoop-key', key);
    xhr.setRequestHeader('content-type', 'application/octet-stream');
    let lastMove = Date.now();
    let stalled = false;
    const watchdog = setInterval(() => {
      if (Date.now() - lastMove > STALL_MS) {
        stalled = true;
        xhr.abort();
      }
    }, 3000);
    const done = () => clearInterval(watchdog);
    xhr.upload.onprogress = (e) => {
      lastMove = Date.now();
      onProgress(e.loaded);
    };
    // Тело ушло, ждём ответа — это тоже движение, сервер может дописывать на диск
    xhr.upload.onload = () => (lastMove = Date.now());
    xhr.onload = () => {
      done();
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(xhr.responseText);
      } catch {
        /* пустой ответ */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data as unknown as PutResult);
      else reject(new ApiError(xhr.status, String(data.error ?? 'error'), data));
    };
    xhr.onerror = () => {
      done();
      reject(new ApiError(0, 'network'));
    };
    xhr.onabort = () => {
      done();
      reject(stalled ? new ApiError(0, 'stalled') : new ApiError(-1, 'aborted'));
    };
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}

/** WebSocket с автоматическим переподключением. */
export function connectEvents(onEvent: (e: ServerEvent) => void, onStatus: (online: boolean) => void) {
  let ws: WebSocket | null = null;
  let closed = false;
  let delay = 1000;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    clearTimeout(timer);
    const k = getKey();
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/api/ws${k ? `?k=${encodeURIComponent(k)}` : ''}`);
    ws.onopen = () => {
      delay = 1000;
      onStatus(true);
    };
    ws.onmessage = (m) => {
      try {
        onEvent(JSON.parse(m.data));
      } catch {
        /* мусор игнорируем */
      }
    };
    ws.onclose = () => {
      onStatus(false);
      if (closed) return;
      timer = setTimeout(open, delay);
      delay = Math.min(delay * 1.8, 15000);
    };
  };
  // Вернулись в приложение — переподключаемся сразу, не дожидаясь таймера
  const wake = () => {
    if (!document.hidden && ws && ws.readyState > WebSocket.OPEN) {
      delay = 1000;
      open();
    }
  };
  document.addEventListener('visibilitychange', wake);
  addEventListener('online', wake);
  open();
  return () => {
    closed = true;
    clearTimeout(timer);
    document.removeEventListener('visibilitychange', wake);
    removeEventListener('online', wake);
    ws?.close();
  };
}
