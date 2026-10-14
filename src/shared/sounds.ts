// Мягкие звуки, синтезированные Web Audio: никаких файлов, по паре осцилляторов на звук.

let ctx: AudioContext | null = null;
let enabled = false;

export function setSoundsEnabled(v: boolean) {
  enabled = v;
}

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Один тон с огибающей: быстрая атака, экспоненциальное затухание. */
function tone(freq: number, at: number, dur: number, opts: { type?: OscillatorType; gain?: number; to?: number } = {}) {
  const c = ac();
  if (!c) return;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(opts.gain ?? 0.12, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

export const sfx = {
  /** Тычок в существо. */
  poke: () => tone(520, 0, 0.12, { to: 380, type: 'triangle', gain: 0.1 }),
  /** Файл улетел с телефона. */
  whoosh: () => tone(300, 0, 0.22, { to: 900, gain: 0.07 }),
  /** Ящик проглотил файл. */
  gulp: () => {
    tone(420, 0, 0.09, { to: 260, type: 'triangle', gain: 0.12 });
    tone(220, 0.07, 0.12, { to: 150, gain: 0.1 });
  },
  /** Всё готово. */
  done: () => {
    tone(784, 0, 0.18, { gain: 0.09 });
    tone(1047, 0.1, 0.28, { gain: 0.09 });
  },
  /** Пришёл текст. */
  pop: () => tone(880, 0, 0.1, { to: 1200, gain: 0.08 }),
  error: () => {
    tone(220, 0, 0.18, { type: 'square', gain: 0.04 });
    tone(180, 0.14, 0.24, { type: 'square', gain: 0.04 });
  },
};
