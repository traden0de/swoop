<script lang="ts">
  import { t } from '../shared/i18n.svelte';
  import { bytes, when } from '../shared/format';
  import type { ShelfItem } from '../shared/types';
  import Icon from '../shared/Icon.svelte';
  import FileTile from '../shared/FileTile.svelte';
  import { api } from './api';
  import Viewer, { previewKind } from './Viewer.svelte';

  let { items }: { items: ShelfItem[] } = $props();

  let viewing = $state<ShelfItem | null>(null);
  const hasMedia = $derived(items.some((i) => i.mime.startsWith('image/') || i.mime.startsWith('video/')));
  const thumbOf = (it: ShelfItem) =>
    it.mime.startsWith('image/') && it.size < 25_000_000 ? api.fileUrl(it.id, { inline: true }) : null;
</script>

{#if items.length}
  {#if hasMedia}<p class="note">{t('shelfHintPhotos')}</p>{/if}
  <div class="list">
    {#each items as it (it.id)}
      {@const kind = previewKind(it.mime, it.size)}
      <div class="row">
        {#if kind}
          <!-- Фото, видео и текст — во встроенном просмотре с кнопкой закрытия -->
          <button class="open" onclick={() => (viewing = it)}>
            <FileTile name={it.name} mime={it.mime} thumb={thumbOf(it)} />
            <div class="main">
              <div class="name">{it.name}</div>
              <div class="meta">{bytes(it.size)} · {when(it.created)}</div>
            </div>
          </button>
        {:else}
          <!-- Остальное (PDF, документы, архивы) — во встроенном браузере iOS, где есть «Готово» -->
          <a class="open" href={api.fileUrl(it.id, { inline: true, external: true })} target="_blank" rel="noopener">
            <FileTile name={it.name} mime={it.mime} />
            <div class="main">
              <div class="name">{it.name}</div>
              <div class="meta">{bytes(it.size)} · {when(it.created)}</div>
            </div>
          </a>
        {/if}
        <a class="dl" href={api.fileUrl(it.id, { external: true })} target="_blank" rel="noopener" aria-label={t('download')}>
          <Icon name="download" size={18} />
        </a>
      </div>
    {/each}
  </div>
{:else}
  <div class="empty-state">
    <span class="art"><Icon name="inbox" size={30} stroke={1.6} /></span>
    <p>{t('shelfEmpty')}</p>
  </div>
{/if}

{#if viewing}
  <Viewer item={viewing} onclose={() => (viewing = null)} />
{/if}

<style>
  .list { margin-top: 10px; }
  .open {
    flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px;
    border: none; background: none; padding: 0; text-align: left; color: inherit; text-decoration: none;
  }
  .dl {
    width: 38px; height: 38px; border-radius: 50%; flex: none; display: grid; place-items: center;
    background: var(--accent-soft); color: var(--accent);
  }
  .dl:active { transform: scale(.94); }
</style>
