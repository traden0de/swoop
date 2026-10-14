<script lang="ts">
  import { onMount } from 'svelte';
  import { getCurrentWindow } from '@tauri-apps/api/window';
  import { getCurrentWebview } from '@tauri-apps/api/webview';
  import CreatureView from '../creature/Creature.svelte';
  import type { Creature } from '../creature/creature';
  import { sfx, setSoundsEnabled } from '../shared/sounds';
  import { listen } from '@tauri-apps/api/event';
  import { applyUiSettings, core, onServerEvent, retry } from '../desktop/api';
  import type { Settings } from '../shared/types';

  // Мини-виджет: существо поверх окон. Тащи — двигает окно, двойной клик — открывает Swoop,
  // брошенные на него файлы попадают на полку для телефона.

  let creature: Creature | undefined = $state();
  let active = $state<Record<string, { size: number; received: number }>>({});
  let dragging = $state(false);

  const list = $derived(Object.values(active));
  const progress = $derived.by(() => {
    if (!list.length) return null;
    const size = list.reduce((s, a) => s + a.size, 0);
    return size ? list.reduce((s, a) => s + a.received, 0) / size : 0;
  });

  $effect(() => creature?.setBase(dragging ? 'dragOver' : list.length ? 'receiving' : 'idle'));
  $effect(() => creature?.setProgress(progress));

  let down: { x: number; y: number } | null = null;
  function onDown(e: PointerEvent) {
    if (e.button === 0) down = { x: e.screenX, y: e.screenY };
  }
  function onMove(e: PointerEvent) {
    if (!down || !(e.buttons & 1)) return;
    if (Math.hypot(e.screenX - down.x, e.screenY - down.y) > 4) {
      down = null;
      void getCurrentWindow().startDragging();
    }
  }

  onMount(() => {
    const unsubs: Promise<() => void>[] = [];
    retry(core.bootstrap).then((b) => {
      setSoundsEnabled(b.settings.sounds);
      applyUiSettings(b.settings);
    });
    unsubs.push(
      onServerEvent((e) => {
        if (e.type === 'uploadStarted') active[e.id] = { size: e.size, received: e.offset };
        else if (e.type === 'uploadProgress' && active[e.id]) active[e.id].received = e.received;
        else if (e.type === 'uploadCancelled') delete active[e.id];
        else if (e.type === 'uploadDone') {
          delete active[e.id];
          creature?.swallow();
          if (!Object.keys(active).length) setTimeout(() => creature?.flash('done', 2200), 700);
        } else if (e.type === 'text' && e.item.deviceId !== null) creature?.love();
      }),
    );
    unsubs.push(
      listen<Settings>('swoop-settings', (e) => {
        setSoundsEnabled(e.payload.sounds);
        applyUiSettings(e.payload);
      }),
    );
    unsubs.push(
      getCurrentWebview().onDragDropEvent(async (e) => {
        const p = e.payload;
        if (p.type === 'enter' || p.type === 'over') dragging = true;
        else if (p.type === 'leave') dragging = false;
        else if (p.type === 'drop') {
          dragging = false;
          if ((await core.shelfAdd(p.paths)) > 0) {
            creature?.swallow();
            sfx.gulp();
          }
        }
      }),
    );
    return () => unsubs.forEach((p) => p.then((f) => f()));
  });
</script>

<div
  class="widget"
  role="presentation"
  onpointerdown={onDown}
  onpointermove={onMove}
  onpointerup={() => (down = null)}
  ondblclick={() => core.showMain()}
>
  <CreatureView
    class="soft-edge"
    options={{ centerY: 0.58, sleepAfter: 90, scale: 0.74, onPoke: () => sfx.poke() }}
    onready={(c) => (creature = c)}
  />
  {#if progress !== null}
    <span class="pct">{Math.floor(progress * 100)}%</span>
  {/if}
</div>

<style>
  :global(html), :global(body.widget) { background: transparent !important; overflow: hidden; }
  .widget { position: fixed; inset: 0; cursor: grab; }
  /* Окно с запасом под свечение, а у самой границы — мягкое затухание вместо резкого среза */
  .widget :global(canvas.soft-edge) {
    -webkit-mask-image: radial-gradient(closest-side, #000 70%, transparent 100%);
    mask-image: radial-gradient(closest-side, #000 70%, transparent 100%);
  }
  .pct {
    position: absolute; left: 50%; bottom: 22px; transform: translateX(-50%);
    font: 700 11px var(--font); color: #fff; background: rgba(76, 111, 255, .9);
    padding: 2px 8px; border-radius: 999px; pointer-events: none;
  }
</style>
