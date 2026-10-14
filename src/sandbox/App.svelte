<script lang="ts">
  import CreatureView from '../creature/Creature.svelte';
  import type { Creature, CreatureState } from '../creature/creature';
  import { STATES } from '../creature/states';

  let c: Creature | undefined = $state();
  let current = $state<CreatureState>('idle');
  let progress = $state(0.4);
  const states = Object.keys(STATES) as CreatureState[];

  function pick(s: CreatureState) {
    current = s;
    c?.setBase(s);
  }
  $effect(() => { c?.setProgress(progress); });
</script>

<main>
  <div class="stage"><CreatureView onready={(x) => (c = x)} /></div>
  <div class="ui">
    {#each states as s}
      <button class="pill sm" class:primary={s === current} onclick={() => pick(s)}>{s}</button>
    {/each}
  </div>
  <div class="ui">
    <button class="pill sm" onclick={() => c?.swallow()}>swallow</button>
    <button class="pill sm" onclick={() => c?.toss()}>toss</button>
    <button class="pill sm" onclick={() => c?.love()}>love</button>
    <button class="pill sm" onclick={() => c?.greet()}>greet</button>
    <button class="pill sm" onclick={() => c?.flash('done')}>flash done</button>
    <label class="muted">progress <input type="range" min="0" max="1" step="0.01" bind:value={progress} /></label>
  </div>
</main>

<style>
  main { height: 100vh; display: flex; flex-direction: column; align-items: center; padding: 16px; gap: 10px; }
  .stage { flex: 1; width: 100%; max-width: 720px; min-height: 0; }
  .ui { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; align-items: center; }
</style>
