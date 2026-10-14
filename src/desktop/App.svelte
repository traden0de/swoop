<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWebview } from '@tauri-apps/api/webview';
  import { listen } from '@tauri-apps/api/event';
  import CreatureView from '../creature/Creature.svelte';
  import type { Creature, CreatureState } from '../creature/creature';
  import { t } from '../shared/i18n.svelte';
  import { sfx, setSoundsEnabled } from '../shared/sounds';
  import type { Addr, Device, HistoryItem, ServerEvent, Settings, ShelfItem, TextItem } from '../shared/types';
  import { applyUiSettings, core, onServerEvent, retry } from './api';
  import Qr from './Qr.svelte';
  import Icon, { type IconName } from '../shared/Icon.svelte';
  import Received, { type Active } from './Received.svelte';
  import Shelf from './Shelf.svelte';
  import Texts from './Texts.svelte';
  import Devices from './Devices.svelte';
  import SettingsPane from './SettingsPane.svelte';

  type Tab = 'received' | 'shelf' | 'text' | 'devices' | 'settings';

  let ready = $state(false);
  let port = $state(0);
  let token = $state('');
  let pcName = $state('');
  let version = $state('');
  let addresses = $state<Addr[]>([]);
  let publicNetworks = $state<string[]>([]);
  let settings = $state<Settings | null>(null);
  let devices = $state<Device[]>([]);
  let history = $state<HistoryItem[]>([]);
  let shelf = $state<ShelfItem[]>([]);
  let texts = $state<TextItem[]>([]);
  let active = $state<Record<string, Active>>({});
  let tab = $state<Tab>('received');
  let unseenText = $state(0);
  let dragging = $state(false);
  let creature: Creature | undefined = $state();
  let thumbs = $state<Record<number, string>>({});
  // Окно спрятано в трей или свёрнуто — существо не рисует и не тратит процессор
  let mainVisible = $state(true);

  const ip = $derived(
    (settings?.preferredIp && addresses.find((a) => a.ip === settings!.preferredIp)?.ip) || addresses[0]?.ip || '127.0.0.1',
  );
  // Предупреждаем, только если «Общедоступная» именно та сеть, адрес которой в QR
  const publicNetwork = $derived(publicNetworks.includes(addresses.find((a) => a.ip === ip)?.name ?? ''));
  const url = $derived(`http://${ip}:${port}/?t=${token}`);
  const activeList = $derived(Object.values(active));
  const anyOnline = $derived(devices.some((d) => d.online));

  const progress = $derived.by(() => {
    if (!activeList.length) return null;
    const size = activeList.reduce((s, a) => s + a.size, 0);
    const got = activeList.reduce((s, a) => s + a.received, 0);
    return size ? got / size : 0;
  });

  const base = $derived<CreatureState>(
    dragging ? 'dragOver' : activeList.length ? 'receiving' : devices.length && anyOnline ? 'idle' : 'waiting',
  );
  $effect(() => creature?.setBase(base));
  $effect(() => creature?.setProgress(progress));
  $effect(() => creature?.setActive(mainVisible));
  $effect(() => setSoundsEnabled(settings?.sounds ?? false));

  const statusText = $derived(
    base === 'receiving'
      ? t('statusReceiving', { n: activeList.length === 1 ? activeList[0].name : t('files', { n: activeList.length }) })
      : base === 'waiting'
        ? t('statusWaiting')
        : t('statusReady'),
  );

  async function loadThumb(id: number) {
    if (thumbs[id]) return;
    const data = await core.thumb(id).catch(() => null);
    if (data) thumbs[id] = data;
  }

  function onEvent(e: ServerEvent) {
    switch (e.type) {
      case 'devices':
        devices = e.devices;
        break;
      case 'uploadStarted':
        active[e.id] = { id: e.id, name: e.name, deviceName: e.deviceName, size: e.size, received: e.offset };
        creature?.wake();
        break;
      case 'uploadProgress':
        if (active[e.id]) active[e.id].received = e.received;
        break;
      case 'uploadDone': {
        delete active[e.id];
        history = [e.item, ...history.filter((h) => h.id !== e.item.id)];
        creature?.swallow();
        sfx.gulp();
        if (Object.keys(active).length === 0) {
          setTimeout(() => {
            if (Object.keys(active).length === 0) {
              creature?.flash('done', 2600);
              sfx.done();
            }
          }, 700);
        }
        break;
      }
      case 'uploadCancelled':
        delete active[e.id];
        break;
      case 'historyThumb':
        void loadThumb(e.id);
        break;
      case 'shelf':
        shelf = e.items;
        break;
      case 'text':
        if (texts.some((x) => x.id === e.item.id)) break;
        texts = [e.item, ...texts];
        if (e.item.deviceId !== null) {
          if (tab !== 'text') unseenText++;
          creature?.love();
          sfx.pop();
        }
        break;
      case 'textRemoved':
        texts = texts.filter((x) => x.id !== e.id);
        break;
    }
  }

  function openTab(next: Tab) {
    tab = next;
    if (next === 'text') unseenText = 0;
  }

  async function newQr() {
    if (!confirm(t('newQrConfirm'))) return;
    token = await core.resetToken();
    creature?.greet();
  }

  async function addToShelf(paths: string[]) {
    if (!paths.length) return;
    const n = await core.shelfAdd(paths);
    if (n > 0) {
      creature?.swallow();
      sfx.gulp();
      setTimeout(() => creature?.flash('done', 1800), 800);
      tab = 'shelf';
    }
  }

  onMount(() => {
    const unsubs: Promise<() => void>[] = [];
    (async () => {
      const b = await retry(core.bootstrap);
      port = b.port;
      token = b.token;
      pcName = b.pcName;
      version = b.version;
      addresses = b.addresses;
      publicNetworks = b.publicNetworks;
      settings = b.settings;
      applyUiSettings(b.settings);
      const [d, h, s, tx] = await retry(() => Promise.all([core.devices(), core.history(), core.shelf(), core.texts()]));
      devices = d;
      history = h;
      shelf = s;
      texts = tx;
      ready = true;
    })();

    unsubs.push(onServerEvent(onEvent));
    unsubs.push(listen<boolean>('swoop-visible', (e) => (mainVisible = e.payload)));
    void core.mainVisible().then((v) => (mainVisible = v)).catch(() => {});
    unsubs.push(listen<Settings>('swoop-settings', (e) => {
        settings = e.payload;
        applyUiSettings(e.payload);
      }));
    unsubs.push(listen<string[]>('swoop-network', (e) => (publicNetworks = e.payload)));
    // Перетаскивание файлов в окно — на полку для телефона
    unsubs.push(
      getCurrentWebview().onDragDropEvent((e) => {
        const p = e.payload;
        if (p.type === 'enter' || p.type === 'over') dragging = true;
        else if (p.type === 'leave') dragging = false;
        else if (p.type === 'drop') {
          dragging = false;
          void addToShelf(p.paths);
        }
      }),
    );
    // Сеть могла смениться (ноутбук переехал на другой Wi‑Fi) — обновим адреса при возврате в окно
    const onFocus = () => core.refreshNetwork().then((n) => {
      addresses = n.addresses;
      publicNetworks = n.publicNetworks;
    });
    addEventListener('focus', onFocus);
    return () => {
      removeEventListener('focus', onFocus);
      unsubs.forEach((p) => p.then((f) => f()));
    };
  });

  const tabs = $derived<[Tab, IconName, string, number | string, string][]>([
    ['received', 'inbox', t('tabReceived'), activeList.length, 'busy'],
    ['shelf', 'upload', t('tabShelf'), shelf.length, ''],
    ['text', 'message', t('tabText'), unseenText, 'hot'],
    ['devices', 'devices', t('tabDevices'), devices.length ? `${devices.filter((d) => d.online).length}/${devices.length}` : 0, ''],
  ]);

  const creatureOpts = { centerY: 0.6, sleepAfter: 60, onPoke: () => sfx.poke() };
</script>

<div class="layout" class:dragging>
  <aside>
    <div class="brand">Swoop</div>
    <div class="stage"><CreatureView options={creatureOpts} onready={(c) => (creature = c)} /></div>
    <div class="status" class:on={anyOnline} class:busy={activeList.length > 0}>
      <i></i>
      <span>{statusText}</span>
    </div>

    {#if ready}
      <div class="qr card">
        <Qr text={url} size={176} />
        <div class="qr-text">
          <b>{t('scanToConnect')}</b>
          <span class="muted">{t('sameWifi')}</span>
          {#if addresses.length > 1}
            <select
              value={ip}
              onchange={async (e) => (settings = await core.updateSettings({ preferredIp: e.currentTarget.value }))}
            >
              {#each addresses as a}
                <option value={a.ip}>{a.ip} · {a.name}</option>
              {/each}
            </select>
          {:else}
            <code class="selectable">{ip}:{port}</code>
          {/if}
        </div>
      </div>
      {#if publicNetwork}
        <p class="warn"><Icon name="alert" size={18} /><span>{t('publicNetwork')}</span></p>
      {/if}
    {/if}
  </aside>

  <section class="content">
    <nav>
      {#each tabs as [id, icon, label, count, tone]}
        <button class:on={tab === id} onclick={() => openTab(id)} title={label} aria-label={label}>
          <Icon name={icon} size={18} />
          <span class="label">{label}</span>
          {#if count}<b class="count {tone}">{count}</b>{/if}
        </button>
      {/each}
      <span class="grow"></span>
      <button class="square" class:on={tab === 'settings'} onclick={() => openTab('settings')} aria-label={t('tabSettings')} title={t('tabSettings')}>
        <Icon name="sliders" size={19} />
      </button>
    </nav>

    <div class="pane scroll">
      {#if !ready}
        <div class="empty">…</div>
      {:else if tab === 'received'}
        <Received
          {history}
          active={activeList}
          {thumbs}
          {loadThumb}
          onclear={async () => {
            if (confirm(t('clearHistoryConfirm'))) {
              await core.clearHistory();
              history = [];
              thumbs = {};
            }
          }}
        />
      {:else if tab === 'shelf'}
        <Shelf items={shelf} onadd={addToShelf} {dragging} />
      {:else if tab === 'text'}
        <Texts
          {texts}
          {settings}
          onsettings={(s) => (settings = s)}
          onsent={(item) => {
            if (!texts.some((x) => x.id === item.id)) texts = [item, ...texts];
          }}
        />
      {:else if tab === 'devices'}
        <Devices {devices} onrevoke={(id) => core.revokeDevice(id)} />
      {:else if settings}
        <SettingsPane {settings} {version} {pcName} onchange={(s) => (settings = s)} {newQr} />
      {/if}
    </div>
  </section>

  {#if dragging}
    <div class="dropveil"><span><Icon name="upload" size={18} />{t('dropNow')}</span></div>
  {/if}
</div>

<style>
  .layout { height: 100vh; display: grid; grid-template-columns: 320px 1fr; position: relative; }
  aside {
    display: flex; flex-direction: column; align-items: stretch; gap: 10px;
    padding: 12px 20px 20px; border-right: 1px solid var(--border); min-height: 0; overflow-y: auto;
    scrollbar-width: none;
  }
  /* Узкое окно: сайдбар поуже, вкладки без подписей, кроме текущей */
  @media (max-width: 900px) {
    .layout { grid-template-columns: 280px 1fr; }
    nav button:not(.on) .label { display: none; }
  }
  @media (max-height: 760px) {
    .stage { height: 200px !important; }
  }
  .brand { font-weight: 800; font-size: 19px; letter-spacing: -.03em; padding: 4px 2px 0; }
  .stage { height: 236px; flex: none; margin: -10px -20px 0; }
  .status {
    align-self: center; display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 13.5px;
    margin-top: -8px; padding: 6px 14px 6px 12px; border-radius: 999px;
    background: var(--surface); border: 1px solid var(--border); color: var(--text-2);
  }
  .status i { width: 8px; height: 8px; border-radius: 50%; background: var(--text-3); }
  .status.on { color: var(--text); }
  .status.on i { background: var(--ok); box-shadow: 0 0 0 3px var(--ok-soft); }
  .status.busy i { background: var(--accent); box-shadow: 0 0 0 3px var(--accent-soft); animation: pulse 1.2s infinite; }
  @keyframes pulse { 50% { box-shadow: 0 0 0 6px transparent; } }
  .qr { padding: 14px; display: flex; flex-direction: column; align-items: center; gap: 10px; margin-top: 6px; }
  .qr :global(svg) { border-radius: 12px; }
  .qr-text { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 4px; font-size: 13px; }
  .qr-text b { font-size: 14px; }
  .qr-text select, .qr-text code {
    margin-top: 4px; font: 12px var(--mono); padding: 5px 8px; border-radius: 8px;
    border: 1px solid var(--border); background: var(--surface-2); color: var(--text-2); max-width: 100%;
  }
  .warn {
    display: flex; gap: 10px; align-items: flex-start; font-size: 12.5px; line-height: 1.45;
    background: var(--warn-soft); border-radius: 14px; padding: 11px 12px; margin: 0;
  }
  .warn :global(.icon) { color: var(--warn); margin-top: 1px; }
  .content { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  nav { display: flex; gap: 2px; padding: 14px 18px 10px; align-items: center; overflow-x: auto; scrollbar-width: none; }
  nav button {
    border: none; background: none; padding: 8px 13px; border-radius: 999px; font-weight: 600; color: var(--text-2);
    display: inline-flex; align-items: center; gap: 7px; white-space: nowrap; flex: none;
  }
  nav button:hover { background: var(--surface-2); }
  nav button.on { background: var(--surface); color: var(--text); box-shadow: var(--shadow); }
  nav button.on :global(.icon) { color: var(--accent); }
  nav button.square { padding: 8px; }
  .grow { flex: 1; }
  .count { font-size: 11px; min-width: 18px; padding: 1px 6px; border-radius: 9px; background: var(--surface-2); color: var(--text-2); }
  .count.busy { background: var(--accent); color: var(--accent-ink); }
  .count.hot { background: var(--err); color: #fff; }
  .pane { flex: 1; min-height: 0; padding: 6px 22px 22px; }
  .dropveil {
    position: absolute; inset: 10px; border: 2.5px dashed var(--accent); border-radius: 22px;
    background: color-mix(in srgb, var(--accent) 7%, transparent); pointer-events: none;
    display: grid; place-items: end center; padding-bottom: 30px; left: 330px;
  }
  .dropveil span {
    display: inline-flex; align-items: center; gap: 8px;
    background: var(--accent); color: var(--accent-ink); font-weight: 700; padding: 9px 18px; border-radius: 999px;
  }
</style>
