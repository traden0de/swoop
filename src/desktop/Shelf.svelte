<script lang="ts">
  import { open } from '@tauri-apps/plugin-dialog';
  import { t } from '../shared/i18n.svelte';
  import { bytes, when } from '../shared/format';
  import type { ShelfItem } from '../shared/types';
  import Icon from '../shared/Icon.svelte';
  import FileTile from '../shared/FileTile.svelte';
  import { core } from './api';

  let { items, onadd, dragging }: { items: ShelfItem[]; onadd: (paths: string[]) => void; dragging: boolean } = $props();

  async function pick() {
    const res = await open({ multiple: true, directory: false });
    if (res) onadd(Array.isArray(res) ? res : [res]);
  }
</script>

<button class="drop" class:hot={dragging} onclick={pick}>
  <span class="art"><Icon name="upload" size={26} /></span>
  <b>{t('dropHere')}</b>
  <span class="muted">{t('dropHint')}</span>
  <span class="pill sm primary"><Icon name="plus" size={16} />{t('addFiles')}</span>
</button>

{#if items.length}
  <div class="list">
    {#each items as it (it.id)}
      <div class="row card">
        <FileTile name={it.name} mime={it.mime} size={40} />
        <div class="main">
          <div class="name">{it.name}</div>
          <div class="meta muted">{bytes(it.size)} · {when(it.created)}</div>
        </div>
        <button class="icon-only" title={t('remove')} aria-label={t('remove')} onclick={() => core.shelfRemove(it.id)}>
          <Icon name="x" size={17} />
        </button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .drop {
    width: 100%; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center;
    padding: 28px 20px; border: 2px dashed var(--border-strong); border-radius: 22px; background: var(--surface);
    transition: border-color .15s, background .15s;
  }
  .drop:hover, .drop.hot { border-color: var(--accent); background: color-mix(in srgb, var(--accent) 6%, var(--surface)); }
  .drop .art {
    width: 54px; height: 54px; border-radius: 17px; display: grid; place-items: center; margin-bottom: 4px;
    background: var(--accent-soft); color: var(--accent);
  }
  .drop b { font-size: 16px; }
  .drop .muted { font-size: 13px; max-width: 420px; }
  .drop .pill { margin-top: 8px; }
  .list { margin-top: 16px; display: flex; flex-direction: column; gap: 8px; }
  .row { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 14px; box-shadow: none; }
  .main { flex: 1; min-width: 0; }
  .name { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .meta { font-size: 12.5px; }
  .icon-only {
    width: 34px; height: 34px; border-radius: 10px; border: none; background: none; color: var(--text-3);
    display: grid; place-items: center;
  }
  .icon-only:hover { background: var(--err-soft); color: var(--err); }
</style>
