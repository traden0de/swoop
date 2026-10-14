<script lang="ts" module>
  export interface Active {
    id: string;
    name: string;
    deviceName: string;
    size: number;
    received: number;
  }
</script>

<script lang="ts">
  import { t } from '../shared/i18n.svelte';
  import { bytes, when } from '../shared/format';
  import type { HistoryItem } from '../shared/types';
  import Icon from '../shared/Icon.svelte';
  import FileTile from '../shared/FileTile.svelte';
  import { core } from './api';

  let {
    history,
    active,
    thumbs,
    loadThumb,
    onclear,
  }: {
    history: HistoryItem[];
    active: Active[];
    thumbs: Record<number, string>;
    loadThumb: (id: number) => void;
    onclear: () => void;
  } = $props();

  $effect(() => {
    for (const h of history.slice(0, 120)) if (h.hasThumb) loadThumb(h.id);
  });

  const pct = (a: Active) => Math.floor((a.received / Math.max(1, a.size)) * 100);
</script>

<div class="head">
  <button class="pill sm" onclick={() => core.openSaveDir()}><Icon name="folder" size={16} />{t('openFolder')}</button>
  {#if history.length}
    <button class="pill sm ghost" onclick={onclear}><Icon name="trash" size={16} />{t('clearHistory')}</button>
  {/if}
</div>

{#each active as a (a.id)}
  <div class="active card">
    <div class="ico"><Icon name="download" size={20} /></div>
    <div class="main">
      <div class="name">{a.name}</div>
      <div class="meta muted">{t('from', { d: a.deviceName })} · {bytes(a.received)} / {bytes(a.size)}</div>
      <div class="bar"><i style:width="{pct(a)}%"></i></div>
    </div>
    <b class="pct">{pct(a)}%</b>
  </div>
{/each}

{#if history.length}
  <div class="grid">
    {#each history as h (h.id)}
      <div class="tile card">
        <button class="preview" onclick={() => core.openPath(h.path)} title={h.name}>
          <FileTile name={h.name} mime={h.mime} thumb={thumbs[h.id] ?? null} variant="cover" />
          {#if h.mime.startsWith('video/')}<span class="play"><Icon name="play" size={12} /></span>{/if}
        </button>
        <div class="info">
          <div class="name" title={h.name}>{h.name}</div>
          <div class="meta muted">{bytes(h.size)} · {when(h.created)}</div>
          <div class="meta faint">{h.deviceName}</div>
        </div>
        <button class="reveal" title={t('showInFolder')} aria-label={t('showInFolder')} onclick={() => core.revealPath(h.path)}>
          <Icon name="reveal" size={16} />
        </button>
      </div>
    {/each}
  </div>
{:else if !active.length}
  <div class="empty-state">
    <span class="art"><Icon name="inbox" size={30} stroke={1.6} /></span>
    <p>{t('receivedEmpty')}</p>
  </div>
{/if}

<style>
  .head { display: flex; gap: 8px; margin-bottom: 14px; }
  .active { display: flex; align-items: center; gap: 14px; padding: 12px 16px; margin-bottom: 10px; }
  .active .ico {
    width: 42px; height: 42px; border-radius: 13px; background: var(--accent-soft); color: var(--accent);
    display: grid; place-items: center; flex: none;
  }
  .active .main { flex: 1; min-width: 0; }
  .active .bar { margin-top: 7px; }
  .pct { font-variant-numeric: tabular-nums; color: var(--accent); }
  .name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(156px, 1fr)); gap: 12px; }
  .tile { position: relative; overflow: hidden; border-radius: 16px; transition: transform .15s, box-shadow .15s; }
  .tile:hover { transform: translateY(-2px); }
  .preview {
    display: block; width: 100%; aspect-ratio: 4 / 3; border: none; padding: 0; background: none;
    position: relative; overflow: hidden;
  }
  .preview :global(img) { transition: transform .25s; }
  .preview:hover :global(img) { transform: scale(1.04); }
  .play {
    position: absolute; left: 8px; bottom: 8px; width: 26px; height: 26px; border-radius: 50%;
    background: rgba(0, 0, 0, .5); color: #fff; display: grid; place-items: center; padding-left: 2px;
    backdrop-filter: blur(6px);
  }
  .info { padding: 9px 11px 11px; }
  .reveal {
    position: absolute; top: 8px; right: 8px; width: 30px; height: 30px; border-radius: 10px; border: none;
    background: color-mix(in srgb, var(--surface) 85%, transparent); color: var(--text);
    display: grid; place-items: center; opacity: 0; transition: opacity .15s;
    box-shadow: 0 2px 8px rgba(0, 0, 0, .15); backdrop-filter: blur(8px);
  }
  .tile:hover .reveal, .reveal:focus-visible { opacity: 1; }
</style>
