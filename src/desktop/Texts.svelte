<script lang="ts">
  import { writeText } from '@tauri-apps/plugin-clipboard-manager';
  import { t } from '../shared/i18n.svelte';
  import { isLink, when } from '../shared/format';
  import type { Settings, TextItem } from '../shared/types';
  import { core } from './api';
  import Icon from '../shared/Icon.svelte';

  let {
    texts,
    settings,
    onsettings,
    onsent,
  }: { texts: TextItem[]; settings: Settings | null; onsettings: (s: Settings) => void; onsent: (item: TextItem) => void } =
    $props();

  let draft = $state('');
  let copiedId = $state<number | null>(null);

  async function send() {
    const text = draft.trim();
    if (!text) return;
    onsent(await core.sendText(text));
    draft = '';
  }

  async function copy(m: TextItem) {
    await writeText(m.text);
    copiedId = m.id;
    setTimeout(() => copiedId === m.id && (copiedId = null), 1500);
  }
</script>

<div class="composer">
  <textarea
    rows="2"
    placeholder={t('textComposer')}
    bind:value={draft}
    onkeydown={(e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    }}
  ></textarea>
  <button class="pill primary" disabled={!draft.trim()} onclick={send}><Icon name="send" size={16} />{t('send')}</button>
</div>
<label class="auto">
  <input
    type="checkbox"
    class="switch"
    checked={settings?.autoCopy}
    onchange={async (e) => onsettings(await core.updateSettings({ autoCopy: e.currentTarget.checked }))}
  />
  {t('autoCopy')}
</label>

{#if texts.length}
  <div class="feed">
    {#each texts as m (m.id)}
      <div class="bubble" class:pc={m.deviceId === null}>
        <div class="who">{m.deviceId === null ? t('fromPc') : m.deviceName} · {when(m.created)}</div>
        {#if isLink(m.text)}
          <a class="selectable text" href={m.text.trim()} onclick={(e) => { e.preventDefault(); core.openUrl(m.text.trim()); }}>{m.text}</a>
        {:else}
          <div class="selectable text">{m.text}</div>
        {/if}
        <div class="actions">
          <button class="pill sm" onclick={() => copy(m)}>
            <Icon name={copiedId === m.id ? 'check' : 'copy'} size={15} />{copiedId === m.id ? t('copied') : t('copy')}
          </button>
          <button class="pill sm ghost" onclick={() => core.removeText(m.id)} title={t('remove')} aria-label={t('remove')}><Icon name="trash" size={15} /></button>
        </div>
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
  .composer { display: flex; gap: 10px; align-items: flex-end; }
  .composer textarea { resize: vertical; min-height: 46px; }
  .auto { display: flex; gap: 10px; cursor: pointer; align-items: center; font-size: 13px; color: var(--text-2); margin: 10px 2px 0; }
  .feed { display: flex; flex-direction: column; gap: 10px; margin-top: 18px; }
  .bubble {
    max-width: 78%; align-self: flex-start; padding: 10px 14px 8px; border-radius: 18px 18px 18px 6px;
    background: var(--surface); border: 1px solid var(--border);
  }
  .bubble.pc { align-self: flex-end; border-radius: 18px 18px 6px 18px; background: var(--accent-soft); border-color: transparent; }
  .who { font-size: 12px; color: var(--text-3); margin-bottom: 2px; }
  .text { white-space: pre-wrap; word-break: break-word; user-select: text; }
  a.text { color: var(--accent); }
  .actions { display: flex; gap: 4px; justify-content: flex-end; margin-top: 6px; }
</style>
