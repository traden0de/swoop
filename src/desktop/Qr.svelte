<script lang="ts">
  import QRCode from 'qrcode';

  let { text, size = 200 }: { text: string; size?: number } = $props();

  // Рисуем QR сами: модули — скруглённые точки, «глазки» — мягкие квадраты в тон приложению
  const qr = $derived.by(() => {
    const q = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const n = q.modules.size;
    const data = q.modules.data;
    const isFinder = (r: number, c: number) =>
      (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    const dots: [number, number][] = [];
    for (let r = 0; r < n; r++)
      for (let c = 0; c < n; c++) if (data[r * n + c] && !isFinder(r, c)) dots.push([c, r]);
    return { n, dots, finders: [[0, 0], [n - 7, 0], [0, n - 7]] as [number, number][] };
  });
</script>

<svg viewBox="-2 -2 {qr.n + 4} {qr.n + 4}" width={size} height={size} role="img" aria-label="QR">
  <rect x="-2" y="-2" width={qr.n + 4} height={qr.n + 4} rx="3" fill="#fff" />
  {#each qr.dots as [x, y]}
    <circle cx={x + 0.5} cy={y + 0.5} r="0.42" fill="#1d2140" />
  {/each}
  {#each qr.finders as [x, y]}
    <rect x={x + 0.5} y={y + 0.5} width="6" height="6" rx="1.9" fill="none" stroke="#1d2140" stroke-width="1" />
    <rect x={x + 2} y={y + 2} width="3" height="3" rx="0.9" fill="#4c6fff" />
  {/each}
</svg>

<style>
  svg { display: block; }
</style>
