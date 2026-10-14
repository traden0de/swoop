// Базовые кирпичики анимации: easing, сглаживание, твины по ключевым кадрам.
// Перенесено из mochi-creature/index.html (разделы 1 и 4) и обёрнуто в класс,
// чтобы на странице могло жить несколько существ.

export type RGB = [number, number, number];
export type Ease = (t: number) => number;

export const E = {
  out: (t: number) => 1 - (1 - t) ** 3,
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  back: (t: number) => {
    const c1 = 1.7, c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2; // с перелётом
  },
  in: (t: number) => t * t * t,
  lin: (t: number) => t,
} satisfies Record<string, Ease>;

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
/** Сглаживание, не зависящее от FPS: base — доля разницы, которая останется через 1 секунду. */
export const smooth = (base: number, dt: number) => 1 - Math.pow(base, dt);
export const rgba = (c: RGB | number[], a: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

/** Ключ твина: [цель, миллисекунды, easing]. */
export type Key = [number, number, Ease];

interface Tween {
  keys: Key[];
  i: number;
  from: number;
  t0: number;
  onDone?: () => void;
}

/**
 * Мини-движок твинов. anim('sy', [[0.78, 70, E.out], [1, 170, E.inOut]]) — цепочка ключей.
 * Пока твин активен, свойство «заблокировано» и сглаживание в update() его не трогает.
 */
export class Tweens<T extends Record<string, number>> {
  private map = new Map<keyof T, Tween>();
  constructor(private target: T) {}

  anim(key: keyof T, keys: Key[], now: number, onDone?: () => void) {
    this.map.set(key, { keys, i: 0, from: this.target[key], t0: now, onDone });
  }
  /** Идёт ли хоть один твин — тогда нужна полная частота кадров. */
  get active() {
    return this.map.size > 0;
  }
  locked(key: keyof T) {
    return this.map.has(key);
  }
  run(now: number) {
    for (const [key, tw] of this.map) {
      const [to, ms, ease] = tw.keys[tw.i];
      const p = clamp(((now - tw.t0) * 1000) / ms, 0, 1);
      (this.target[key] as number) = tw.from + (to - tw.from) * ease(p);
      if (p >= 1) {
        tw.from = to;
        tw.i++;
        tw.t0 = now;
        if (tw.i >= tw.keys.length) {
          this.map.delete(key);
          tw.onDone?.();
        }
      }
    }
  }
}

/** Пружина: vel += (k·(target − pos) − c·vel)·dt. Даёт вторичное движение и «клацанье». */
export class Spring {
  pos = 0;
  vel = 0;
  target = 0;
  constructor(public k: number, public c: number, init = 0) {
    this.pos = this.target = init;
  }
  /** Задать пружину через собственную частоту ω (рад/с) и коэффициент затухания ζ. */
  static fromOmega(omega: number, zeta: number, init = 0) {
    return new Spring(omega * omega, 2 * zeta * omega, init);
  }
  step(dt: number) {
    this.vel += (this.k * (this.target - this.pos) - this.c * this.vel) * dt;
    this.pos += this.vel * dt;
    return this.pos;
  }
}
