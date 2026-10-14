// Типы, совпадающие с JSON из Rust (serde rename_all = camelCase).

export interface Device {
  id: string;
  name: string;
  created: number;
  lastSeen: number;
  online: boolean;
}

export interface HistoryItem {
  id: number;
  kind: 'in';
  deviceId: string;
  deviceName: string;
  name: string;
  size: number;
  path: string;
  mime: string;
  hasThumb: boolean;
  created: number;
}

export interface ShelfItem {
  id: string;
  name: string;
  size: number;
  mime: string;
  created: number;
}

export interface TextItem {
  id: number;
  deviceId: string | null;
  deviceName: string | null;
  text: string;
  created: number;
}

export interface Settings {
  port: number;
  token: string;
  saveDir: string;
  autoCopy: boolean;
  sounds: boolean;
  notifications: boolean;
  widget: boolean;
  preferredIp: string | null;
  lang: 'auto' | 'ru' | 'en';
  theme: 'auto' | 'light' | 'dark';
}

export interface Addr {
  ip: string;
  name: string;
  primary: boolean;
}

export type ServerEvent =
  | { type: 'devices'; devices: Device[] }
  | { type: 'uploadStarted'; id: string; deviceId: string; deviceName: string; name: string; size: number; offset: number }
  | { type: 'uploadProgress'; id: string; deviceId: string; received: number; size: number }
  | { type: 'uploadDone'; id: string; item: HistoryItem }
  | { type: 'uploadCancelled'; id: string; deviceId: string }
  | { type: 'historyThumb'; id: number }
  | { type: 'shelf'; items: ShelfItem[] }
  | { type: 'text'; item: TextItem }
  | { type: 'textRemoved'; id: number }
  | { type: 'tokenReset' }
  | { type: 'revoked' };
