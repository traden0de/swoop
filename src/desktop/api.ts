import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { setLang } from '../shared/i18n.svelte';
import { setTheme } from '../shared/theme.svelte';
import type { Addr, Device, HistoryItem, ServerEvent, Settings, ShelfItem, TextItem } from '../shared/types';

export interface Bootstrap {
  port: number;
  token: string;
  addresses: Addr[];
  settings: Settings;
  publicNetworks: string[];
  pcName: string;
  version: string;
}

export const core = {
  bootstrap: () => invoke<Bootstrap>('bootstrap'),
  refreshNetwork: () => invoke<{ addresses: Addr[]; publicNetworks: string[] }>('refresh_network'),
  history: () => invoke<HistoryItem[]>('list_history'),
  clearHistory: () => invoke<void>('clear_history'),
  thumb: (id: number) => invoke<string | null>('get_thumb', { id }),
  shelf: () => invoke<ShelfItem[]>('list_shelf'),
  shelfAdd: (paths: string[]) => invoke<number>('shelf_add', { paths }),
  shelfRemove: (id: string) => invoke<void>('shelf_remove', { id }),
  texts: () => invoke<TextItem[]>('list_texts'),
  sendText: (text: string) => invoke<TextItem>('send_text', { text }),
  removeText: (id: number) => invoke<void>('remove_text', { id }),
  devices: () => invoke<Device[]>('list_devices'),
  revokeDevice: (id: string) => invoke<void>('revoke_device', { id }),
  resetToken: () => invoke<string>('reset_token'),
  updateSettings: (patch: Partial<Settings>) => invoke<Settings>('update_settings', { patch }),
  openPath: (path: string) => invoke<void>('open_path', { path }),
  openUrl: (url: string) => invoke<void>('open_url', { url }),
  revealPath: (path: string) => invoke<void>('reveal_path', { path }),
  openSaveDir: () => invoke<void>('open_save_dir'),
  showMain: () => invoke<void>('show_main'),
  mainVisible: () => invoke<boolean>('main_visible'),
};

/** Повторять вызов, пока ядро не ответит: страхует старт окна от любых гонок с инициализацией. */
export async function retry<T>(fn: () => Promise<T>, tries = 20): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise((r) => setTimeout(r, Math.min(1000, 100 * i)));
    }
  }
}

/** Язык и тема из настроек ядра — общие для главного окна и виджета. */
export function applyUiSettings(s: Settings) {
  setLang(s.lang);
  setTheme(s.theme);
  // Заголовок окна Windows тоже перекрашиваем; null — как в системе
  void getCurrentWindow().setTheme(s.theme === 'auto' ? null : s.theme).catch(() => {});
}

export function onServerEvent(cb: (e: ServerEvent) => void): Promise<UnlistenFn> {
  return listen<ServerEvent>('swoop', (e) => cb(e.payload));
}
