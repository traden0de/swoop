<script lang="ts">
  import { t } from '../shared/i18n.svelte';
  import { isLink, when } from '../shared/format';
  import type { TextItem } from '../shared/types';
  import { api } from './api';
  import { copyText, selectElementText } from './clipboard';
  import Icon from '../shared/Icon.svelte';

  let { texts, onsent }: { texts: TextItem[]; onsent: (item: TextItem) => void } = $props();

  let draft = $state('');
  let busy = $state(false);
  let copiedId = $state<number | null>(null);
  let failedId = $state<number | null>(null);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    busy = true;
    try {
      const item = await api.sendText(text);
      draft = '';
      onsent(item);
    } catch {
      /* статус связи и так виден в шапке */
    } finally {
      busy = false;
    }
  }

  function copy(item: TextItem, e: MouseEvent) {
    if (copyText(item.text)) {
      failedId = null;
      copiedId = item.id;
      setTimeout(() => copiedId === item.id && (copiedId = null), 1500);
      return;
    }
    // Система не дала скопировать — выделяем текст, чтобы скопировать из меню iOS
    const text = (e.currentTarget as HTMLElement).closest('.bubble')?.querySelector('.text');
    if (text) selectElementText(text);
    failedId = item.id;
  }
</script>

<div class="composer">
  <textarea
    rows="3"
    placeholder={t('textPlaceholder')}
    bind:value={draft}
    onkeydown={(e) => e.key === 'Enter' && (e.metaKey || e.ctrlKey) && send()}
  ></textarea>
  <button class="pill primary" disabled={!draft.trim() || busy} onclick={send}><Icon name="send" size={16} />{t('send')}</button>
</div>

{#if texts.length}
  <div class="feed">
    {#each texts as m (m.id)}
      <div class="bubble" class:mine={m.deviceId !== null}>
        <div class="who">{m.deviceId === null ? t('fromPc') : m.deviceName} · {when(m.created)}</div>
        {#if isLink(m.text)}
          <a class="selectable text" href={m.text.trim()} target="_blank" rel="noopener">{m.text}</a>
        {:else}
          <div class="selectable text">{m.text}</div>
        {/if}
        <button class="pill sm ghost" onclick={(e) => copy(m, e)}>
          <Icon name={copiedId === m.id ? 'check' : 'copy'} size={15} />{copiedId === m.id ? t('copied') : t('copy')}
        </button>
        {#if failedId === m.id}<div class="hint">{t('copyFailed')}</div>{/if}
      </div>
    {/each}
  </div>
{:else}
  <div class="empty-state">
    <span class="art"><Icon name="message" size={28} stroke={1.6} /></span>
    <p>{t('textEmpty')}</p>
  </div>
{/if}

<style>
  .composer { display: flex; flex-direction: column; gap: 8px; align-items: flex-end; }
  .composer textarea { resize: none; }
  .feed { display: flex; flex-direction: column; gap: 10px; margin-top: 18px; }
  .bubble {
    max-width: 88%; align-self: flex-start; padding: 10px 12px 6px; border-radius: 18px 18px 18px 6px;
    background: var(--surface); border: 1px solid var(--border);
  }
  .bubble.mine { align-self: flex-end; border-radius: 18px 18px 6px 18px; background: var(--accent-soft); border-color: transparent; }
  .who { font-size: 12px; color: var(--text-3); margin-bottom: 2px; }
  .text { white-space: pre-wrap; word-break: break-word; }
  a.text { color: var(--accent); }
  .hint { font-size: 12px; color: var(--warn); margin-top: 4px; }
  .bubble .pill { margin: 4px -8px 0 auto; display: flex; }
</style>
