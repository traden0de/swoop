// Только для разработки: окно ПК в обычном браузере без Tauri (npm run dev → /?mock).
// Подменяет IPC фальшивыми данными, чтобы смотреть и править вёрстку всех вкладок.

import { mockIPC, mockWindows } from '@tauri-apps/api/mocks';

const now = Date.now();
const min = 60_000;

const settings = {
  port: 53917,
  token: 'mock-token-0000000000000000000000',
  saveDir: 'C:\\Users\\You\\Downloads\\Swoop',
  autoCopy: false,
  sounds: false,
  notifications: true,
  widget: false,
  preferredIp: null,
  lang: 'auto',
  theme: 'auto',
};

const devices = [
  { id: 'd1', name: 'iPhone', created: now - 3 * 86400_000, lastSeen: now, online: true },
  { id: 'd2', name: 'iPad', created: now - 9 * 86400_000, lastSeen: now - 2 * 3600_000, online: false },
];

const history = [
  ['IMG_8768.HEIC', 3_480_365, 'image/heic', 2],
  ['Отпуск в горах.mov', 1_284_120_000, 'video/quicktime', 9],
  ['Договор аренды.pdf', 842_112, 'application/pdf', 30],
  ['Отчёт_практика.docx', 1_434_112, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 64],
  ['Бюджет 2026.xlsx', 81_200, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 140],
  ['Голосовое.m4a', 2_400_000, 'audio/mp4', 600],
  ['Архив фото.zip', 512_000_000, 'application/zip', 2000],
  ['notes.txt', 4_200, 'text/plain', 4000],
].map(([name, size, mime, ago], i) => ({
  id: i + 1,
  kind: 'in',
  deviceId: 'd1',
  deviceName: 'iPhone',
  name,
  size,
  path: `C:\\Users\\You\\Downloads\\Swoop\\${name}`,
  mime,
  hasThumb: false,
  created: now - (ago as number) * min,
}));

const shelf = [
  { id: 's1', name: 'Презентация.pptx', size: 12_400_000, mime: 'application/vnd.ms-powerpoint', created: now - 5 * min },
  { id: 's2', name: 'wallpaper.png', size: 2_100_000, mime: 'image/png', created: now - 40 * min },
];

const texts = [
  { id: 3, deviceId: 'd1', deviceName: 'iPhone', text: 'https://github.com/Louis-CFM/coucou', created: now - 3 * min },
  { id: 2, deviceId: null, deviceName: null, text: 'Код от домофона: 4521', created: now - 30 * min },
  { id: 1, deviceId: 'd1', deviceName: 'iPhone', text: 'Купить молоко, хлеб и батарейки AA', created: now - 90 * min },
];

export function installDesktopMock() {
  mockWindows('main');
  mockIPC((cmd, args) => {
    const a = (args ?? {}) as Record<string, unknown>;
    switch (cmd) {
      case 'bootstrap':
        return {
          port: 53917,
          token: settings.token,
          addresses: [
            { ip: '192.168.3.18', name: 'Ethernet', primary: true },
            { ip: '10.0.85.1', name: 'VPN Tun', primary: false },
          ],
          settings,
          publicNetworks: location.search.includes('public') ? ['Ethernet'] : [],
          pcName: 'DESKTOP-SWOOP',
          version: '0.1.0',
        };
      case 'refresh_network':
        return { addresses: [{ ip: '192.168.3.18', name: 'Ethernet', primary: true }], publicNetworks: [] };
      case 'list_history':
        return location.search.includes('empty') ? [] : history;
      case 'list_shelf':
        return location.search.includes('empty') ? [] : shelf;
      case 'list_texts':
        return location.search.includes('empty') ? [] : texts;
      case 'list_devices':
        return location.search.includes('empty') ? [] : devices;
      case 'get_thumb':
        return null;
      case 'update_settings':
        Object.assign(settings, a.patch as object);
        return { ...settings };
      case 'send_text':
        return { id: Date.now(), deviceId: null, deviceName: null, text: a.text, created: Date.now() };
      case 'shelf_add':
        return 0;
      case 'plugin:autostart|is_enabled':
        return false;
      case 'plugin:event|listen':
        return Math.floor(Math.random() * 1e6);
      default:
        return null;
    }
  });
}
