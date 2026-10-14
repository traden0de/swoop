<script lang="ts">
  import { onMount } from 'svelte';
  import CreatureView from '../creature/Creature.svelte';
  import type { Creature, CreatureState } from '../creature/creature';
  import { t } from '../shared/i18n.svelte';
  import { sfx, setSoundsEnabled } from '../shared/sounds';
  import type { HistoryItem, ServerEvent, ShelfItem, TextItem } from '../shared/types';
  import { ApiError, api, connectEvents, getKey, setFilesPort, setKey, type Session } from './api';
  import { Uploader } from './uploader.svelte';
  import SendTab from './SendTab.svelte';
  import ShelfTab from './ShelfTab.svelte';
  import TextTab from './TextTab.svelte';
  import SettingsSheet from './SettingsSheet.svelte';
  import Icon from '../shared/Icon.svelte';

  type Phase = 'loading' | 'unpaired' | 'pairing' | 'ready';
  type Tab = 'send' | 'shelf' | 'text';

  let phase = $state<Phase>('loading');
  let notice = $state('');
  let session = $state<Session | null>(null);
  let online = $state(false);
  let tab = $state<Tab>('send');
  let history = $state<HistoryItem[]>([]);
  let shelf = $state<ShelfItem[]>([]);
  let texts = $state<TextItem[]>([]);
  let unseenShelf = $state(0);
  let unseenText = $state(0);
  let showSettings = $state(false);
  let sounds = $state(readSounds());
  let creature: Creature | undefined = $state();
  let stopEvents: (() => void) | null = null;

  function readSounds() {
    try {
      return localStorage.getItem('swoop.sounds') === '1';
    } catch {
      return false;
    }
  }
  $effect(() => {
    setSoundsEnabled(sounds);
    try {
      localStorage.setItem('swoop.sounds', sounds ? '1' : '0');
    } catch {
      /* не страшно */
    }
  });

  const uploader = new Uploader({
    onStart: () => {
      creature?.toss();
      sfx.whoosh();
    },
    onDone: (job) => {
      if (job.item) history = [job.item, ...history.filter((h) => h.id !== job.item!.id)];
    },
    onError: () => {
      creature?.flash('error');
      sfx.error();
    },
    onIdle: (ok) => {
      if (ok) {
        creature?.flash('done', 2600);
        sfx.done();
      }
    },
    onAuthLost: () => logout('revoked'),
  });

  // Базовое настроение существа следует за состоянием приложения
  $effect(() => {
    let base: CreatureState = 'idle';
    if (phase === 'unpaired') base = 'waiting';
    else if (phase === 'ready' && !online) base = 'offline';
    else if (uploader.active.length > 0) base = 'sending';
    creature?.setBase(base);
  });

  function deviceName() {
    const ua = navigator.userAgent;
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'iPad';
    if (/iPhone/.test(ua)) return 'iPhone';
    if (/Android/.test(ua)) return 'Android';
    return t('appName');
  }

  /** Ссылка на manifest с ключом: иконка «Домой» откроется уже подключённой. */
  function setManifest(key: string | null) {
    document.querySelector('link[rel=manifest]')?.remove();
    if (!key) return;
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = `/manifest.webmanifest?k=${encodeURIComponent(key)}`;
    document.head.appendChild(link);
  }

  async function login(): Promise<Session | null> {
    const q = new URLSearchParams(location.search);
    const token = q.get('t'), k = q.get('k');
    if (token || k) history_replace();
    if (k) setKey(k);
    const saved = getKey();
    if (saved) {
      try {
        return await api.resume(saved);
      } catch (e) {
        if (!(e instanceof ApiError && e.status === 401)) throw e;
        setKey(null);
      }
    }
    if (token) {
      phase = 'pairing';
      try {
        return await api.pair(token, deviceName());
      } catch (e) {
        if (e instanceof ApiError && e.status === 403) notice = t('badToken');
        throw e;
      }
    }
    // Последний шанс: cookie от прошлого визита
    try {
      return await api.me();
    } catch {
      return null;
    }
  }

  function history_replace() {
    window.history.replaceState(null, '', '/');
  }

  async function start() {
    phase = 'loading';
    let s: Session | null = null;
    try {
      s = await login();
    } catch (e) {
      if (e instanceof ApiError && e.status === 0) notice = t('reconnecting');
    }
    if (!s) {
      phase = 'unpaired';
      return;
    }
    if (s.key) setKey(s.key);
    setManifest(getKey());
    setFilesPort(s.filesPort);
    session = s;
    phase = 'ready';
    void loadAll();
    stopEvents?.();
    stopEvents = connectEvents(onEvent, (v) => {
      const was = online;
      online = v;
      if (v && !was) void loadAll();
    });
  }

  async function loadAll() {
    const [h, sh, tx] = await Promise.allSettled([api.history(), api.shelf(), api.texts()]);
    if (h.status === 'fulfilled') history = h.value;
    if (sh.status === 'fulfilled') shelf = sh.value;
    if (tx.status === 'fulfilled') texts = tx.value;
  }

  function onEvent(e: ServerEvent) {
    switch (e.type) {
      case 'shelf': {
        const known = new Set(shelf.map((s) => s.id));
        const fresh = e.items.filter((s) => !known.has(s.id)).length;
        shelf = e.items;
        if (fresh > 0) {
          if (tab !== 'shelf') unseenShelf += fresh;
          creature?.love();
          sfx.pop();
        }
        break;
      }
      case 'text':
        if (texts.some((x) => x.id === e.item.id)) break;
        texts = [e.item, ...texts];
        if (e.item.deviceId === null) {
          if (tab !== 'text') unseenText++;
          creature?.love();
          sfx.pop();
        }
        break;
      case 'textRemoved':
        texts = texts.filter((x) => x.id !== e.id);
        break;
      case 'uploadDone':
        if (!history.some((h) => h.id === e.item.id)) history = [e.item, ...history];
        break;
      case 'tokenReset':
      case 'revoked':
        logout('revoked');
        break;
    }
  }

  function logout(reason: 'revoked' | 'manual') {
    stopEvents?.();
    stopEvents = null;
    setKey(null);
    setManifest(null);
    session = null;
    online = false;
    notice = reason === 'revoked' ? t('revoked') : '';
    phase = 'unpaired';
    showSettings = false;
  }

  function openTab(next: Tab) {
    tab = next;
    if (next === 'shelf') unseenShelf = 0;
    if (next === 'text') unseenText = 0;
  }

  onMount(() => {
    void start();
    return () => stopEvents?.();
  });

  const creatureOpts = {
    centerY: 0.6,
    sleepAfter: 45,
    onPoke: () => sfx.poke(),
  };
</script>

<div class="app">
  <header>
    <div class="brand">Swoop</div>
    {#if phase === 'ready' && session}
      <div class="status" class:off={!online} title={online ? t('connectedTo', { pc: session.pc }) : t('reconnecting')}>
        <i></i>
        <span>{online ? session.pc : t('reconnecting')}</span>
      </div>
      <button class="icon-btn" aria-label={t('settings')} onclick={() => (showSettings = true)}>
        <Icon name="sliders" size={19} />
      </button>
    {/if}
  </header>

  <div class="stage" class:big={phase !== 'ready'}>
    <CreatureView options={creatureOpts} onready={(c) => (creature = c)} />
  </div>

  {#if phase === 'ready'}
    <main class="scroll">
      {#if tab === 'send'}
        <SendTab {uploader} {history} />
      {:else if tab === 'shelf'}
        <ShelfTab items={shelf} />
      {:else}
        <TextTab {texts} onsent={(item) => { texts = [item, ...texts]; creature?.toss(); sfx.whoosh(); }} />
      {/if}
    </main>

    <nav>
      {#each [['send', 'upload', t('tabSend'), uploader.active.length], ['shelf', 'download', t('tabShelf'), unseenShelf], ['text', 'message', t('tabText'), unseenText]] as const as [id, icon, label, count]}
        <button class:on={tab === id} onclick={() => openTab(id)} aria-current={tab === id ? 'page' : undefined}>
          <span class="ico"><Icon name={icon} size={22} /></span>
          {label}
          {#if count}<b class="badge" class:busy={id === 'send'}>{count}</b>{/if}
        </button>
      {/each}
    </nav>
  {:else}
    <section class="hello">
      {#if phase === 'loading' || phase === 'pairing'}
        <p class="muted">{t('pairing')}</p>
      {:else}
        <h1>{t('pairTitle')}</h1>
        <p class="muted">{notice || t('pairText')}</p>
        <ol class="steps">
          <li><span class="step-ico"><Icon name="qr" size={20} /></span>{t('step1')}</li>
          <li><span class="step-ico"><Icon name="camera" size={20} /></span>{t('step2')}</li>
          <li><span class="step-ico"><Icon name="link" size={20} /></span>{t('step3')}</li>
        </ol>
      {/if}
    </section>
  {/if}
</div>

{#if showSettings && session}
  <SettingsSheet
    {session}
    bind:sounds
    onclose={() => (showSettings = false)}
    onrename={(name) => session && (session.device.name = name)}
    onlogout={() => logout('manual')}
  />
{/if}

<style>
  .app {
    height: 100dvh;
    display: flex;
    flex-direction: column;
    padding-top: env(safe-area-inset-top);
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px 0;
    min-height: 46px;
  }
  .brand { font-weight: 800; font-size: 20px; letter-spacing: -.03em; }
  .status {
    margin-left: auto; min-width: 0; display: flex; align-items: center; gap: 7px;
    padding: 5px 11px 5px 9px; border-radius: 999px; background: var(--surface); border: 1px solid var(--border);
    font-size: 12.5px; font-weight: 600; color: var(--text-2);
  }
  .status span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 46vw; }
  .status i { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); flex: none; box-shadow: 0 0 0 3px var(--ok-soft); }
  .status.off i { background: var(--warn); box-shadow: 0 0 0 3px var(--warn-soft); animation: blink 1.4s infinite; }
  @keyframes blink { 50% { opacity: .35; } }
  .stage { height: 30vh; min-height: 170px; max-height: 280px; flex: none; transition: height .4s; }
  .stage.big { height: 42vh; max-height: 380px; }
  main { flex: 1; min-height: 0; padding: 4px 16px 24px; }
  nav {
    display: flex;
    border-top: 1px solid var(--border);
    background: color-mix(in srgb, var(--surface) 86%, transparent);
    backdrop-filter: blur(18px) saturate(1.4);
    -webkit-backdrop-filter: blur(18px) saturate(1.4);
    padding: 6px 8px env(safe-area-inset-bottom);
  }
  nav button {
    flex: 1; position: relative; border: none; background: none; padding: 4px 0 8px;
    display: flex; flex-direction: column; align-items: center; gap: 3px;
    font-size: 11px; font-weight: 600; color: var(--text-3); transition: color .15s;
  }
  nav .ico {
    width: 52px; height: 30px; border-radius: 999px; display: grid; place-items: center;
    transition: background .2s, transform .2s;
  }
  nav button.on { color: var(--accent); }
  nav button.on .ico { background: var(--accent-soft); }
  nav button:active .ico { transform: scale(.92); }
  .badge {
    position: absolute; top: 0; left: calc(50% + 12px);
    min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px;
    background: var(--err); color: #fff; font-size: 11px; line-height: 18px;
    box-shadow: 0 0 0 2px var(--surface);
  }
  .badge.busy { background: var(--accent); color: var(--accent-ink); }
  .hello { text-align: center; padding: 0 24px calc(24px + env(safe-area-inset-bottom)); }
  .hello h1 { font-size: 26px; margin: 0 0 6px; letter-spacing: -.03em; }
  .hello p { margin: 0 auto; max-width: 320px; }
  .steps {
    list-style: none; margin: 22px auto 0; padding: 6px; max-width: 340px; text-align: left;
    background: var(--surface); border: 1px solid var(--border); border-radius: 20px; counter-reset: step;
  }
  .steps li {
    display: flex; align-items: center; gap: 12px; padding: 10px 10px; font-size: 14.5px; font-weight: 550;
  }
  .steps li + li { border-top: 1px solid var(--border); }
  .step-ico {
    width: 36px; height: 36px; border-radius: 11px; flex: none; display: grid; place-items: center;
    background: var(--accent-soft); color: var(--accent);
  }
</style>
