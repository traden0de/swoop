<script lang="ts">
  import { t } from '../shared/i18n.svelte';
  import { when } from '../shared/format';
  import type { Device } from '../shared/types';
  import Icon from '../shared/Icon.svelte';

  let { devices, onrevoke }: { devices: Device[]; onrevoke: (id: string) => void } = $props();
</script>

{#if devices.length}
  <div class="list">
    {#each devices as d (d.id)}
      <div class="row card">
        <span class="ico" class:on={d.online}>
          <Icon name={/ipad|tablet/i.test(d.name) ? 'tablet' : 'phone'} size={22} />
          <i></i>
        </span>
        <div class="main">
          <div class="name">{d.name}</div>
          <div class="meta" class:ok={d.online}>{d.online ? t('online') : t('lastSeen', { t: when(d.lastSeen) })}</div>
        </div>
        <button class="pill sm danger" onclick={() => onrevoke(d.id)}>{t('disconnectDevice')}</button>
      </div>
    {/each}
  </div>
{:else}
  <div class="empty-state">
    <span class="art"><Icon name="phone" size={28} stroke={1.6} /></span>
    <p>{t('devicesEmpty')}</p>
  </div>
{/if}

<style>
  .list { display: flex; flex-direction: column; gap: 10px; }
  .row { display: flex; align-items: center; gap: 14px; padding: 12px 16px; }
  .ico {
    position: relative; width: 44px; height: 44px; border-radius: 14px; flex: none; display: grid; place-items: center;
    background: var(--surface-2); color: var(--text-3);
  }
  .ico.on { background: var(--accent-soft); color: var(--accent); }
  .ico i {
    position: absolute; right: -2px; bottom: -2px; width: 12px; height: 12px; border-radius: 50%;
    background: var(--text-3); border: 2.5px solid var(--surface);
  }
  .ico.on i { background: var(--ok); }
  .main { flex: 1; min-width: 0; }
  .name { font-weight: 650; }
  .meta { font-size: 13px; color: var(--text-2); }
  .meta.ok { color: var(--ok); }
</style>
