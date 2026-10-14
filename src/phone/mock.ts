// Только для разработки: телефонный интерфейс без сервера (npm run dev → /phone.html?mock).
// ?mock=unpaired — экран приветствия. Подменяет fetch, XHR и WebSocket фальшивыми данными.

const now = Date.now();
const min = 60_000;

const device = { id: 'd1', name: 'iPhone', created: now, lastSeen: now, online: true };
const session = { device, key: 'd1.mock', pc: 'DESKTOP-SWOOP', filesPort: 0 };

const history = [
  ['IMG_8768.HEIC', 3_480_365, 'image/heic', 2],
  ['Отпуск в горах.mov', 128_412_000, 'video/quicktime', 9],
  ['Договор аренды.pdf', 842_112, 'application/pdf', 30],
  ['Бюджет 2026.xlsx', 81_200, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 140],
].map(([name, size, mime, ago], i) => ({
  id: i + 1, kind: 'in', deviceId: 'd1', deviceName: 'iPhone', name, size, path: '', mime, hasThumb: false,
  created: now - (ago as number) * min,
}));

const shelf = [
  { id: 's1', name: 'Презентация.pptx', size: 12_400_000, mime: 'application/vnd.ms-powerpoint', created: now - 5 * min },
  { id: 's2', name: 'Скан паспорта.pdf', size: 2_100_000, mime: 'application/pdf', created: now - 40 * min },
  { id: 's3', name: 'track.mp3', size: 6_100_000, mime: 'audio/mpeg', created: now - 300 * min },
];

const texts = [
  { id: 3, deviceId: 'd1', deviceName: 'iPhone', text: 'https://github.com/Louis-CFM/coucou', created: now - 3 * min },
  { id: 2, deviceId: null, deviceName: null, text: 'Код от домофона: 4521', created: now - 30 * min },
];

const json = (data: unknown, status = 200) =>
  new Response(status === 204 ? null : JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

export function installPhoneMock() {
  const unpaired = new URLSearchParams(location.search).get('mock') === 'unpaired';
  if (!unpaired) localStorage.setItem('swoop.key', 'd1.mock');
  else localStorage.removeItem('swoop.key');

  const realFetch = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
    if (!url.pathname.startsWith('/api/')) return realFetch(input, init);
    const p = url.pathname.replace('/api', '');
    const method = init?.method ?? 'GET';
    if (unpaired) return json({ error: 'unauthorized' }, 401);
    if (p === '/resume' || p === '/me' || p === '/pair') return json(session);
    if (p === '/history') return json(history);
    if (p === '/shelf') return json(shelf);
    if (p === '/texts' && method === 'GET') return json(texts);
    if (p === '/texts') return json({ id: Date.now(), deviceId: 'd1', deviceName: 'iPhone', text: JSON.parse(String(init?.body)).text, created: Date.now() });
    if (p === '/uploads') return json({ id: 'u' + Math.random().toString(16).slice(2), offset: 0, size: JSON.parse(String(init?.body)).size, done: false });
    return json(null, 204);
  };

  // Отправка: делаем вид, что сеть ~4 МБ/с
  class MockXHR extends EventTarget {
    status = 0;
    responseText = '';
    upload = { onprogress: null as ((e: { loaded: number }) => void) | null, onload: null as (() => void) | null };
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onabort: (() => void) | null = null;
    private url = '';
    private aborted = false;
    open(_m: string, url: string) {
      this.url = url;
    }
    setRequestHeader() {}
    abort() {
      this.aborted = true;
      this.onabort?.();
    }
    send(blob: Blob) {
      const offset = Number(new URL(this.url, location.href).searchParams.get('offset'));
      const size = blob.size;
      let sent = 0;
      const tick = () => {
        if (this.aborted) return;
        sent = Math.min(size, sent + 400_000);
        this.upload.onprogress?.({ loaded: sent });
        if (sent < size) return void setTimeout(tick, 100);
        this.upload.onload?.();
        const total = Number(sessionStorage.getItem('mock.size.' + this.url.split('/')[3].split('?')[0]) || 0);
        const end = offset + size;
        const done = total > 0 && end >= total;
        this.status = 200;
        this.responseText = JSON.stringify({
          offset: end,
          done,
          item: done ? { id: Date.now(), kind: 'in', deviceId: 'd1', deviceName: 'iPhone', name: 'file', size: end, path: '', mime: '', hasThumb: false, created: Date.now() } : undefined,
        });
        this.onload?.();
      };
      setTimeout(tick, 100);
    }
  }
  (window as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = MockXHR;

  // Размер файла нужен «серверу», чтобы понять, что загрузка закончилась
  const origFetch = window.fetch;
  window.fetch = async (input, init) => {
    const res = await origFetch(input, init);
    if (typeof input === 'string' && input === '/api/uploads') {
      const body = await res.clone().json();
      sessionStorage.setItem('mock.size.' + body.id, String(body.size));
    }
    return res;
  };

  class MockWS {
    onopen: (() => void) | null = null;
    onmessage: ((m: { data: string }) => void) | null = null;
    onclose: (() => void) | null = null;
    readyState = 1;
    constructor() {
      setTimeout(() => (unpaired ? this.onclose?.() : this.onopen?.()), 50);
    }
    close() {}
    send() {}
  }
  (window as unknown as { WebSocket: unknown }).WebSocket = Object.assign(MockWS, { OPEN: 1 });
}
