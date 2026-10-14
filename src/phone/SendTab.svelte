<script lang="ts">
  import { t } from '../shared/i18n.svelte';
  import { bytes, duration, when } from '../shared/format';
  import Icon from '../shared/Icon.svelte';
  import FileTile from '../shared/FileTile.svelte';
  import type { HistoryItem } from '../shared/types';
  import type { Job, Uploader } from './uploader.svelte';

  let { uploader, history }: { uploader: Uploader; history: HistoryItem[] } = $props();

  let input: HTMLInputElement;
  let showOriginals = $state(false);

  // Скорость по скользящему окну — для «осталось N»
  let samples: { t: number; sent: number }[] = [];
  let eta = $state('');
  $effect(() => {
    const { total, sent } = uploader.totals;
    if (uploader.active.length === 0) {
      samples = [];
      eta = '';
      return;
    }
    const now = performance.now();
    samples.push({ t: now, sent });
    samples = samples.filter((s) => now - s.t < 8000);
    const first = samples[0];
    const speed = (sent - first.sent) / Math.max(0.001, (now - first.t) / 1000);
    eta = speed > 0 && now - first.t > 1500 ? t('remaining', { t: duration((total - sent) / speed) }) : '';
  });

  function pick() {
    input.value = '';
    input.click();
  }
  function onFiles() {
    if (input.files?.length) uploader.add(input.files);
  }

  function statusText(j: Job) {
    if (j.status === 'uploading') return `${Math.floor((j.sent / Math.max(1, j.size)) * 100)}%`;
    return t(j.status === 'queued' ? 'queued' : j.status === 'done' ? 'done' : j.status === 'error' ? 'failed' : 'cancelled');
  }
  const pct = (j: Job) => (j.size ? (j.sent / j.size) * 100 : j.status === 'done' ? 100 : 0);
</script>

<input bind:this={input} type="file" multiple hidden onchange={onFiles} />

<button class="pick" onclick={pick}>
  <span class="plus"><Icon name="plus" size={26} stroke={2.2} /></span>
  <span>
    <b>{t('pickFiles')}</b>
    <small>{t('pickHint')}</small>
  </span>
</button>

<button class="link" onclick={() => (showOriginals = !showOriginals)}><Icon name="info" size={15} />{t('aboutOriginals')}</button>
{#if showOriginals}
  <p class="note">{t('originalsHint')}</p>
{/if}

{#if uploader.jobs.length}
  {@const tot = uploader.totals}
  {#if uploader.active.length}
    <div class="summary">
      <span>{bytes(tot.sent)} / {bytes(tot.total)}</span>
      <span class="muted">{eta}</span>
    </div>
    <div class="bar"><i style:width="{(tot.sent / Math.max(1, tot.total)) * 100}%"></i></div>
    <p class="note warn">{t('keepAwake')}</p>
  {/if}

  <div class="list">
    {#each uploader.jobs as j (j.uid)}
      <div class="row">
        <FileTile name={j.name} mime={j.mime} thumb={j.thumb} />
        <div class="main">
          <div class="name">{j.name}</div>
          <div class="meta">
            <span>{bytes(j.size)}</span>·
            <span class:ok={j.status === 'done'} class:err={j.status === 'error'}>{statusText(j)}</span>
            {#if j.retrying}<span class="spin" title={t('reconnecting')}><Icon name="retry" size={13} /></span>{/if}
          </div>
          {#if j.status === 'uploading' || j.status === 'queued'}
            <div class="bar"><i style:width="{pct(j)}%"></i></div>
          {/if}
        </div>
        {#if j.status === 'uploading' || j.status === 'queued'}
          <button class="icon-btn" aria-label={t('cancel')} onclick={() => uploader.cancel(j)}><Icon name="x" size={16} /></button>
        {:else if j.status === 'error'}
          <button class="icon-btn" aria-label={t('retry')} onclick={() => uploader.retry(j)}><Icon name="retry" size={17} /></button>
        {:else if j.status === 'done'}
          <span class="check"><Icon name="check" size={16} stroke={2.4} /></span>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<div class="section-title">{t('sentBefore')}</div>
{#if history.length}
  {#each history.slice(0, 50) as h (h.id)}
    <div class="row slim">
      <FileTile name={h.name} mime={h.mime} size={36} />
      <div class="main">
        <div class="name">{h.name}</div>
        <div class="meta">{bytes(h.size)} · {when(h.created)}</div>
      </div>
    </div>
  {/each}
{:else}
  <div class="empty">{t('nothingSent')}</div>
{/if}

<style>
  .pick {
    width: 100%; display: flex; align-items: center; gap: 14px; text-align: left;
    padding: 18px; border-radius: 22px; border: none;
    background: var(--accent); color: var(--accent-ink);
    box-shadow: 0 10px 30px color-mix(in srgb, var(--accent) 35%, transparent);
    transition: transform .12s;
  }
  .pick:active { transform: scale(.98); }
  .pick .plus {
    width: 48px; height: 48px; border-radius: 16px; flex: none; display: grid; place-items: center;
    font-size: 28px; background: rgba(255, 255, 255, .2);
  }
  .pick b { display: block; font-size: 18px; }
  .pick small { display: block; opacity: .85; font-size: 13px; margin-top: 2px; }
  .link {
    display: inline-flex; align-items: center; gap: 6px; border: none; background: none;
    color: var(--text-3); font-size: 12.5px; margin: 10px 4px 2px; padding: 0;
  }
  .summary { display: flex; justify-content: space-between; font-size: 14px; font-weight: 600; margin: 18px 2px 6px; }
  .list { margin-top: 12px; }
  .note { margin: 10px 0 0; }
  .spin { display: inline-flex; color: var(--warn); animation: spin 1.2s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .ok { color: var(--ok); }
  .err { color: var(--err); }
  .check {
    width: 28px; height: 28px; border-radius: 50%; background: var(--ok-soft); color: var(--ok);
    display: grid; place-items: center; font-weight: 800; flex: none;
  }
  .slim { padding: 8px 12px; }
</style>
