<script lang="ts">
  import { onMount } from 'svelte';
  import { open } from '@tauri-apps/plugin-dialog';
  import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';
  import { setLang, t, type LangPref } from '../shared/i18n.svelte';
  import { setTheme, type ThemePref } from '../shared/theme.svelte';
  import type { Settings } from '../shared/types';
  import { core } from './api';
  import Icon from '../shared/Icon.svelte';

  let {
    settings,
    version,
    pcName,
    onchange,
    newQr,
  }: { settings: Settings; version: string; pcName: string; onchange: (s: Settings) => void; newQr: () => void } = $props();

  let autostart = $state(false);
  onMount(async () => {
    autostart = await isEnabled().catch(() => false);
  });

  async function set(patch: Partial<Settings>) {
    onchange(await core.updateSettings(patch));
  }
  async function pickLang(lang: LangPref) {
    setLang(lang);
    await set({ lang });
  }
  const langs: [LangPref, () => string][] = [
    ['auto', () => t('langAuto')],
    ['ru', () => 'Русский'],
    ['en', () => 'English'],
  ];

  async function pickTheme(theme: ThemePref) {
    setTheme(theme);
    await set({ theme });
  }
  const themes: [ThemePref, () => string][] = [
    ['auto', () => t('langAuto')],
    ['light', () => t('themeLight')],
    ['dark', () => t('themeDark')],
  ];

  async function toggleAutostart(on: boolean) {
    await (on ? enable() : disable()).catch(() => {});
    autostart = await isEnabled().catch(() => on);
  }
  async function pickFolder() {
    const dir = await open({ directory: true, defaultPath: settings.saveDir });
    if (typeof dir === 'string') await set({ saveDir: dir });
  }
</script>

<div class="group card">
  <div class="item">
    <span class="ri"><Icon name="globe" size={18} /></span>
    <div class="label"><b>{t('language')}</b></div>
    <div class="seg" role="radiogroup" aria-label={t('language')}>
      {#each langs as [code, label]}
        <button role="radio" aria-checked={settings.lang === code} class:on={settings.lang === code} onclick={() => pickLang(code)}>
          {label()}
        </button>
      {/each}
    </div>
  </div>
  <div class="item">
    <span class="ri"><Icon name="theme" size={18} /></span>
    <div class="label"><b>{t('theme')}</b></div>
    <div class="seg" role="radiogroup" aria-label={t('theme')}>
      {#each themes as [code, label]}
        <button role="radio" aria-checked={settings.theme === code} class:on={settings.theme === code} onclick={() => pickTheme(code)}>
          {label()}
        </button>
      {/each}
    </div>
  </div>
</div>

<div class="group card">
  <div class="item">
    <span class="ri"><Icon name="folder" size={18} /></span>
    <div class="label">
      <b>{t('saveFolder')}</b>
      <code class="selectable">{settings.saveDir}</code>
    </div>
    <button class="pill sm" onclick={() => core.openSaveDir()} title={t('openFolder')} aria-label={t('openFolder')}><Icon name="folder" size={16} /></button>
    <button class="pill sm" onclick={pickFolder}>{t('change')}</button>
  </div>
</div>

<div class="group card">
  <label class="item">
    <span class="ri"><Icon name="power" size={18} /></span>
    <div class="label"><b>{t('autostart')}</b><span>{t('autostartHint')}</span></div>
    <input type="checkbox" class="switch" checked={autostart} onchange={(e) => toggleAutostart(e.currentTarget.checked)} />
  </label>
  <label class="item">
    <span class="ri"><Icon name="widget" size={18} /></span>
    <div class="label"><b>{t('widget')}</b><span>{t('widgetHint')}</span></div>
    <input type="checkbox" class="switch" checked={settings.widget} onchange={(e) => set({ widget: e.currentTarget.checked })} />
  </label>
  <label class="item">
    <span class="ri"><Icon name="bell" size={18} /></span>
    <div class="label"><b>{t('notifications')}</b></div>
    <input type="checkbox" class="switch" checked={settings.notifications} onchange={(e) => set({ notifications: e.currentTarget.checked })} />
  </label>
  <label class="item">
    <span class="ri"><Icon name="volume" size={18} /></span>
    <div class="label"><b>{t('soundsDesktop')}</b></div>
    <input type="checkbox" class="switch" checked={settings.sounds} onchange={(e) => set({ sounds: e.currentTarget.checked })} />
  </label>
  <label class="item">
    <span class="ri"><Icon name="clipboard" size={18} /></span>
    <div class="label"><b>{t('autoCopy')}</b></div>
    <input type="checkbox" class="switch" checked={settings.autoCopy} onchange={(e) => set({ autoCopy: e.currentTarget.checked })} />
  </label>
</div>

<div class="group card">
  <div class="item">
    <span class="ri"><Icon name="shield" size={18} /></span>
    <div class="label"><b>{t('security')}</b><span>{t('securityHint')}</span></div>
    <button class="pill sm danger" onclick={newQr}>{t('newQr')}</button>
  </div>
</div>

<p class="foot faint">Swoop · {t('version', { v: version })} · {pcName} · :{settings.port}</p>

<style>
  .group { padding: 4px 0; margin-bottom: 14px; border-radius: 16px; box-shadow: none; }
  .item { display: flex; align-items: center; gap: 12px; padding: 12px 16px; cursor: default; }
  label.item { cursor: pointer; }
  .item + .item { border-top: 1px solid var(--border); }
  .ri {
    width: 34px; height: 34px; border-radius: 10px; flex: none; display: grid; place-items: center;
    background: var(--surface-2); color: var(--text-2);
  }
  .label { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .label span { font-size: 13px; color: var(--text-2); }
  .label code { font: 12px var(--mono); color: var(--text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .seg { display: flex; padding: 3px; gap: 2px; border-radius: 999px; background: var(--surface-2); }
  .seg button {
    border: none; background: none; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 600; color: var(--text-2);
  }
  .seg button.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgba(0, 0, 0, .15); }
  .foot { text-align: center; font-size: 12px; margin-top: 18px; }
</style>
