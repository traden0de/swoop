<script lang="ts">
  import { onMount } from 'svelte';
  import { Creature, type CreatureOptions } from './creature';

  let { options = {}, onready, class: cls = '' }: {
    options?: CreatureOptions;
    onready?: (c: Creature) => void;
    class?: string;
  } = $props();

  let canvas: HTMLCanvasElement;

  onMount(() => {
    const c = new Creature(canvas, options);
    onready?.(c);
    return () => c.destroy();
  });
</script>

<canvas bind:this={canvas} class={cls}></canvas>

<style>
  canvas { width: 100%; height: 100%; }
</style>
