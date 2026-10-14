<script lang="ts" module>
  /** Что показываем прямо в приложении. Остальное открывается во встроенном браузере iOS. */
  export function previewKind(mime: string, size: number): 'image' | 'video' | 'text' | null {
    if (mime.startsWith('image/')) return 'image';
    if (mime.startsWith('video/')) return 'video';
    if ((mime.startsWith('text/') || mime === 'application/json') && size < 2_000_000) return 'text';
    return null;
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte';
  import { t } from '../shared/i18n.svelte';
  import { bytes } from '../shared/format';
  import type { ShelfItem } from '../shared/types';
  import { api } from './api';
  import Icon from '../shared/Icon.svelte';

  // Просмотр файла с полки поверх приложения. У иконки «Домой» нет кнопки «Назад»,
  // поэтому переход на сам файл запер бы пользователя — здесь всегда есть «✕».

  let { item, onclose }: { item: ShelfItem; onclose: () => void } = $props();

  const kind = $derived(previewKind(item.mime, item.size));
  let text = $state<string | null>(null);

  onMount(() => {
    if (kind === 'text') {
      fetch(api.fileUrl(item.id, { inline: true }))
        .then((r) => r.text())
        .then((s) => (text = s))
        .catch(() => (text = ''));
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onclose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  });
</script>

<div class="viewer" role="dialog" aria-label={t('preview')}>
  <header>
    <button class="close" aria-label={t('close')} onclick={onclose}><Icon name="x" size={18} /></button>
    <div class="title">
      <b>{item.name}</b>
      <span>{bytes(item.size)}</span>
    </div>
    <a class="pill sm primary" href={api.fileUrl(item.id, { external: true })} target="_blank" rel="noopener" aria-label={t('download')}><Icon name="download" size={17} />{t('download')}</a>
  </header>

  <div class="body">
    {#if kind === 'image'}
      <img src={api.fileUrl(item.id, { inline: true })} alt={item.name} />
    {:else if kind === 'video'}
      <!-- svelte-ignore a11y_media_has_caption -->
      <video src={api.fileUrl(item.id, { inline: true })} controls playsinline autoplay></video>
    {:else if kind === 'text'}
      <pre class="selectable">{text ?? '…'}</pre>
    {/if}
  </div>
  {#if kind === 'image'}<p class="tip">{t('shelfHintPhotos')}</p>{/if}
</div>

<style>
  .viewer {
    position: fixed; inset: 0; z-index: 20; background: #0b0c10; color: #fff;
    display: flex; flex-direction: column;
    padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
    animation: fade .18s;
  }
  header { display: flex; align-items: center; gap: 10px; padding: 10px 14px; }
  .close {
    width: 38px; height: 38px; border-radius: 50%; border: none; flex: none;
    background: rgba(255, 255, 255, .14); color: #fff; display: grid; place-items: center;
  }
  .title { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .title b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .title span { font-size: 12px; opacity: .6; }
  a.pill { text-decoration: none; }
  .body { flex: 1; min-height: 0; display: grid; place-items: center; padding: 8px; overflow: auto; }
  img, video { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: 8px; }
  /* Удержание пальца на фото → «Сохранить в Фото» */
  img { -webkit-touch-callout: default; -webkit-user-select: auto; user-select: auto; }
  pre {
    align-self: start; width: 100%; margin: 0; padding: 12px; border-radius: 12px; background: rgba(255, 255, 255, .06);
    white-space: pre-wrap; word-break: break-word; font: 13px/1.5 var(--mono);
  }
  .tip { margin: 0; padding: 8px 16px 12px; font-size: 12.5px; opacity: .6; text-align: center; }
  @keyframes fade { from { opacity: 0; } }
</style>
