<script lang="ts">
  import Icon from './Icon.svelte';
  import { KIND_STYLE, ext, fileKind } from './fileKind';

  // Плашка файла вместо эмодзи: цвет по типу, глиф и расширение.
  // size — сторона квадрата в px; variant="cover" растягивается на всю карточку (сетка на ПК).
  let {
    name,
    mime,
    size = 44,
    thumb = null,
    variant = 'square',
  }: { name: string; mime: string; size?: number; thumb?: string | null; variant?: 'square' | 'cover' } = $props();

  const style = $derived(KIND_STYLE[fileKind(mime, name)]);
  const label = $derived(ext(name).slice(0, 4).toUpperCase());
  const iconSize = $derived(variant === 'cover' ? 34 : Math.round(size * 0.46));
</script>

<div
  class="tile {variant}"
  style:--c={style.color}
  style:width={variant === 'square' ? `${size}px` : null}
  style:height={variant === 'square' ? `${size}px` : null}
>
  {#if thumb}
    <img src={thumb} alt="" />
  {:else}
    <Icon name={style.icon} size={iconSize} stroke={variant === 'cover' ? 1.5 : 1.8} />
    {#if label && variant === 'cover'}<span class="ext">{label}</span>{/if}
  {/if}
</div>

<style>
  .tile {
    position: relative; flex: none; display: grid; place-items: center; overflow: hidden;
    border-radius: 12px; color: var(--c);
    background: color-mix(in srgb, var(--c) 13%, var(--surface));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 18%, transparent);
  }
  .cover {
    width: 100%; height: 100%; border-radius: 0; box-shadow: none;
    background:
      radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--c) 24%, transparent), transparent 60%),
      color-mix(in srgb, var(--c) 12%, var(--surface-2));
  }
  img { width: 100%; height: 100%; object-fit: cover; }
  .ext {
    position: absolute; bottom: 10px; left: 50%; transform: translateX(-50%);
    font: 700 10.5px/1 var(--font); letter-spacing: .06em; color: var(--c);
    padding: 3px 7px; border-radius: 6px; background: color-mix(in srgb, var(--c) 14%, var(--surface));
  }
</style>
