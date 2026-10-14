<script lang="ts">
  import { getLangPref, setLang, t, type LangPref } from '../shared/i18n.svelte';
  import { getThemePref, setTheme, type ThemePref } from '../shared/theme.svelte';
  import { api, type Session } from './api';

  let {
    session,
    sounds = $bindable(),
    onclose,
    onrename,
    onlogout,
  }: {
    session: Session;
    sounds: boolean;
    onclose: () => void;
    onrename: (name: string) => void;
    onlogout: () => void;
  } = $props();

  const initialName = () => session.device.name;
  let name = $state(initialName());
  const standalone = (navigator as Navigator & { standalone?: boolean }).standalone || matchMedia('(display-mode: standalone)').matches;

  async function saveName() {
    const n = name.trim();
    if (!n || n === session.device.name) return;
    await api.rename(n).catch(() => {});
    onrename(n);
  }
</script>

<div class="backdrop" onclick={onclose} role="presentation"></div>
<div class="sheet" role="dialog" aria-label={t('settings')}>
  <div class="grab"></div>
  <h2>{t('settings')}</h2>

  <label class="field">
    <span>{t('deviceName')}</span>
    <div class="inline">
      <input type="text" maxlength="40" bind:value={name} onblur={saveName} />
      <button class="pill sm" onclick={saveName}>{t('save')}</button>
    </div>
  </label>

  <div class="field">
    <span>{t('language')}</span>
    <div class="seg" role="radiogroup" aria-label={t('language')}>
      {#each [['auto', t('langAuto')], ['ru', 'Русский'], ['en', 'English']] as [code, label]}
        <button role="radio" aria-checked={getLangPref() === code} class:on={getLangPref() === code} onclick={() => setLang(code as LangPref)}>
          {label}
        </button>
      {/each}
    </div>
  </div>

  <div class="field">
    <span>{t('theme')}</span>
    <div class="seg" role="radiogroup" aria-label={t('theme')}>
      {#each [['auto', t('langAuto')], ['light', t('themeLight')], ['dark', t('themeDark')]] as [code, label]}
        <button role="radio" aria-checked={getThemePref() === code} class:on={getThemePref() === code} onclick={() => setTheme(code as ThemePref)}>
          {label}
        </button>
      {/each}
    </div>
  </div>

  <label class="toggle">
    <span>{t('sounds')}</span>
    <input type="checkbox" class="switch" bind:checked={sounds} />
  </label>

  {#if !standalone}
    <div class="field">
      <span>{t('homeScreen')}</span>
      <p class="note">{t('homeScreenHint')}</p>
    </div>
  {/if}

  <button class="pill danger wide" onclick={onlogout}>{t('disconnect')}</button>
  <button class="pill wide" onclick={onclose}>{t('close')}</button>
</div>

<style>
  .backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, .35); z-index: 10; animation: fade .2s; }
  .sheet {
    position: fixed; left: 0; right: 0; bottom: 0; z-index: 11;
    background: var(--surface); border-radius: 24px 24px 0 0; padding: 8px 18px calc(18px + env(safe-area-inset-bottom));
    display: flex; flex-direction: column; gap: 14px; animation: up .28s cubic-bezier(.2, .9, .3, 1.15);
  }
  .grab { width: 40px; height: 5px; border-radius: 3px; background: var(--border-strong); margin: 0 auto 4px; }
  h2 { margin: 0; font-size: 20px; }
  .field > span, .toggle > span { font-size: 13px; font-weight: 600; color: var(--text-2); }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .inline { display: flex; gap: 8px; align-items: center; }
  .toggle { display: flex; justify-content: space-between; align-items: center; }
  .note { margin: 0; }
  .seg { display: flex; padding: 3px; gap: 2px; border-radius: 12px; background: var(--surface-2); }
  .seg button {
    flex: 1; border: none; background: none; padding: 8px 6px; border-radius: 10px; font-size: 14px; font-weight: 600; color: var(--text-2);
  }
  .seg button.on { background: var(--surface); color: var(--text); box-shadow: 0 1px 3px rgba(0, 0, 0, .15); }
  .wide { width: 100%; padding: 12px; }
  @keyframes up { from { transform: translateY(100%); } }
  @keyframes fade { from { opacity: 0; } }
</style>
