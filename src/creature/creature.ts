// Существо-почтальон Swoop. Каждый кадр: update(dt) пересчитывает числа, draw() рисует фигуры.
// Техники из mochi-creature: суперэллипс, 4 слоя заливки, глаза на сфере, твины, пружины, частицы.
// Своё: кепка почтальона на пружине, морф тела в почтовый ящик с ртом-щелью, «глотание» карточек
// файлов, заливка-волна по прогрессу приёма.

import { E, Spring, Tweens, clamp, lerp, rand, rgba, smooth, type RGB } from './engine';
import { STATES, type Badge, type CreatureState, type EyeShape, type StateConfig } from './states';
import { isDarkTheme } from '../shared/theme.svelte';

export type { CreatureState } from './states';

export interface CreatureOptions {
  /** Реагировать на тычки (клик / тап по телу). */
  interactive?: boolean;
  /** Размер существа относительно холста. */
  scale?: number;
  /** Через сколько секунд простоя в idle засыпает. 0 — никогда. */
  sleepAfter?: number;
  /** Вертикальное положение центра, доля высоты холста. */
  centerY?: number;
  onPoke?: (count: number) => void;
  onDizzy?: () => void;
}

const EYE_W = 0.25, EYE_H = 0.27; // размер глаза в долях R
const EYE_SP = 0.37;              // угол между глазами на «сфере»
const EYE_P = -0.1;               // глаза чуть ниже экватора
const BODY_N = 2.6;               // сквиркл тела
const BOX_N = 6.5;                // почтовый ящик — почти прямоугольник
const INK = '#2a1d17';
const CAP = '#34449a', CAP_DARK = '#25306f', ENVELOPE = '#ffd56b';

type ParticleType = 'heart' | 'star' | 'spark' | 'sweat' | 'z';
interface Particle {
  type: ParticleType;
  x: number; y: number; vx: number; vy: number;
  age: number; life: number; rot: number; size: number;
}
/** Карточка файла, летящая в рот (in) или из рук вверх (out). */
interface Card {
  dir: 'in' | 'out';
  t0: number;
  dur: number;
  x0: number;
  hue: number;
  done?: boolean;
}

const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export class Creature {
  // Всё, что анимируется, — просто числа (README, раздел 1).
  private m = {
    yaw: 0, pitch: 0, tilt: 0, roll: 0, sx: 1, sy: 1, ox: 0, oy: 0, open: 1, es: 1,
    tint: 0, blush: 0, badgeS: 0, morph: 0, capLift: 0, capSpin: 0, level: 0,
  };
  private tg = { yaw: 0, pitch: 0, tilt: 0, sx: 1, sy: 1, es: 1 };
  private tw = new Tweens(this.m);
  private col: number[] = STATES.idle.color.slice();

  private base: CreatureState = 'idle';
  private state: CreatureState = 'idle';
  private cfg: StateConfig = STATES.idle;
  private flashTimer: ReturnType<typeof setTimeout> | null = null;
  private progress: number | null = null;

  private badge: Badge = null;
  private badgeWanted: Badge = null;
  private eyeOverride: EyeShape | null = null;
  private eyeOverrideUntil = 0;
  private particles: Particle[] = [];
  private cards: Card[] = [];

  private cap = { dx: 0, dy: 0, vx: 0, vy: 0 }; // кепка отстаёт от головы
  private mouth = Spring.fromOmega(25, 0.6);    // рот-щель «клацает»
  private prevYaw = 0;
  private prevOy = 0;

  private nextBlink = 1;
  private lastAmbient = 0;
  private lastActivity = 0;
  private autoSlept = false;
  private pokes: number[] = [];
  private wander = { x: 0, y: 0, next: 0 };
  private pointer = { x: 0, y: 0, at: -1e9 };

  private now = performance.now() / 1000;
  private last = this.now;
  private raf = 0;
  private running = false;
  private W = 0;
  private H = 0;
  private DPR = 1;
  private g: CanvasRenderingContext2D;
  private ro: ResizeObserver;
  private dark = isDarkTheme();
  private calm = reducedMotion();
  private opts: Required<Omit<CreatureOptions, 'onPoke' | 'onDizzy'>> & CreatureOptions;
  private cleanup: (() => void)[] = [];

  constructor(private canvas: HTMLCanvasElement, options: CreatureOptions = {}) {
    this.opts = { interactive: true, scale: 1, sleepAfter: 30, centerY: 0.56, ...options };
    this.g = canvas.getContext('2d')!;
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
    this.resize();
    this.lastActivity = this.now;

    const onMove = (e: PointerEvent) => {
      this.pointer = { x: e.clientX, y: e.clientY, at: this.now };
      this.wake();
    };
    const onDown = (e: PointerEvent) => {
      if (this.opts.interactive && this.hit(e.clientX, e.clientY)) this.poke();
    };
    const onVis = () => (document.hidden ? this.stop() : this.start());
    const mqDark = matchMedia('(prefers-color-scheme: dark)');
    const onDark = () => (this.dark = isDarkTheme());
    // Тему могли выбрать вручную — следим и за атрибутом data-theme
    const themeObs = new MutationObserver(onDark);
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    addEventListener('pointermove', onMove, { passive: true });
    canvas.addEventListener('pointerdown', onDown);
    document.addEventListener('visibilitychange', onVis);
    mqDark.addEventListener('change', onDark);
    this.cleanup.push(
      () => removeEventListener('pointermove', onMove),
      () => canvas.removeEventListener('pointerdown', onDown),
      () => document.removeEventListener('visibilitychange', onVis),
      () => mqDark.removeEventListener('change', onDark),
      () => themeObs.disconnect(),
    );

    this.start();
    // Приветствие: подпрыгнуть и приподнять кепку
    setTimeout(() => this.greet(), 350);
  }

  // ---------- публичный API ----------

  /** Постоянное состояние (то, к которому существо возвращается после flash). */
  setBase(s: CreatureState) {
    this.base = s;
    if (!this.flashTimer) this.setState(s);
  }
  /** Временное состояние на ms миллисекунд, затем возврат к базовому. */
  flash(s: CreatureState, ms = 2400) {
    if (this.flashTimer) clearTimeout(this.flashTimer);
    this.setState(s);
    this.flashTimer = setTimeout(() => {
      this.flashTimer = null;
      this.setState(this.base);
    }, ms);
  }
  get current() {
    return this.state;
  }
  /** Прогресс приёма 0..1 (рисуется волной внутри тела) или null. */
  setProgress(p: number | null) {
    this.progress = p === null ? null : clamp(p, 0, 1);
  }
  /** Карточка файла влетает в рот-щель; по прилёте — «глоток». */
  swallow() {
    this.wake();
    this.cards.push({ dir: 'in', t0: this.now, dur: 0.75, x0: rand(-0.5, 0.5), hue: rand(0, 1) });
    this.mouth.target = 1;
  }
  /** Существо подбрасывает карточку вверх — файл улетает на ПК. */
  toss() {
    this.wake();
    this.cards.push({ dir: 'out', t0: this.now, dur: 0.9, x0: rand(-0.15, 0.15), hue: rand(0, 1) });
    this.squash(0.86);
    this.tw.anim('oy', [[-0.12, 120, E.out], [0, 260, E.back]], this.now);
  }
  love() {
    this.wake();
    this.eyeOverride = 'happy';
    this.eyeOverrideUntil = this.now + 1.6;
    this.tw.anim('blush', [[1, 250, E.out], [1, 1000, E.lin], [0, 500, E.inOut]], this.now);
    this.tw.anim('oy', [[-0.15, 160, E.out], [0, 320, E.back]], this.now);
    this.emit('heart', this.calm ? 2 : 5);
  }
  celebrate() {
    this.emit('spark', this.calm ? 3 : 7);
    this.tipCap();
  }
  greet() {
    this.tw.anim('oy', [[-0.3, 220, E.out], [0, 380, E.back]], this.now);
    this.tipCap();
    this.emit('star', 3);
    this.blink();
  }
  /** Любая активность извне будит существо. */
  wake() {
    this.lastActivity = this.now;
    if (this.autoSlept && this.state === 'sleeping') {
      this.autoSlept = false;
      this.setState(this.base === 'sleeping' ? 'idle' : this.base);
      this.tw.anim('es', [[1.3, 110, E.out], [1, 380, E.back]], this.now);
      this.emit('spark', 3);
    }
  }
  destroy() {
    this.stop();
    this.ro.disconnect();
    this.cleanup.forEach((f) => f());
    if (this.flashTimer) clearTimeout(this.flashTimer);
  }

  // ---------- состояния и действия ----------

  private setState(s: CreatureState) {
    if (s === this.state) return;
    const prev = this.state;
    this.state = s;
    this.cfg = STATES[s];
    this.setBadge(this.cfg.badge);
    const n = this.now;
    switch (s) {
      case 'done':
        if (!this.calm) this.doRoll(950, 1);
        setTimeout(() => this.celebrate(), this.calm ? 0 : 500);
        break;
      case 'error':
        this.tw.anim('ox', [[0.08, 50, E.out], [-0.08, 70, E.inOut], [0.05, 70, E.inOut], [0, 90, E.out]], n);
        this.emit('sweat', 1);
        break;
      case 'dragOver':
        this.tw.anim('oy', [[-0.2, 150, E.out], [0, 300, E.back]], n);
        this.tw.anim('es', [[1.25, 120, E.out], [1, 400, E.back]], n);
        break;
      case 'dizzy':
        if (!this.calm) this.doRoll(1300, 2);
        break;
      default:
        if (prev === 'dragOver' && s === 'idle') this.squash();
        this.blink();
    }
  }
  private blink() {
    if (this.tw.locked('open')) return;
    this.tw.anim('open', [[0.06, 70, E.inOut], [1, 130, E.out]], this.now);
  }
  private squash(k = 0.78) {
    this.cap.vy += 0.6;
    const n = this.now;
    this.tw.anim('sy', [[k, 70, E.out], [1.1, 130, E.out], [1, 170, E.inOut]], n);
    this.tw.anim('sx', [[2 - k * 1.08, 70, E.out], [0.95, 130, E.out], [1, 170, E.inOut]], n);
  }
  private doRoll(ms: number, turns: number) {
    this.tw.anim('roll', [[turns * Math.PI * 2, ms, E.inOut]], this.now, () => (this.m.roll = 0));
    this.tw.anim('oy', [[-0.45, ms * 0.45, E.out], [0, ms * 0.55, E.back]], this.now);
  }
  /** Кепка подпрыгивает и прокручивается — «здравствуйте!». */
  private tipCap() {
    if (this.tw.locked('capLift')) return;
    this.tw.anim('capLift', [[1, 220, E.out], [0, 420, E.back]], this.now);
    if (!this.calm) this.tw.anim('capSpin', [[Math.PI * 2, 640, E.inOut]], this.now, () => (this.m.capSpin = 0));
  }
  private setBadge(b: Badge) {
    if (b === this.badgeWanted) return;
    this.badgeWanted = b;
    this.tw.anim('badgeS', [[0, 90, E.inOut]], this.now, () => {
      this.badge = this.badgeWanted;
      if (this.badge) this.tw.anim('badgeS', [[1, 280, E.back]], this.now);
    });
  }
  private poke() {
    this.wake();
    if (this.state === 'dizzy') return;
    this.pokes = this.pokes.filter((t) => this.now - t < 1.7);
    this.pokes.push(this.now);
    this.squash();
    this.cap.vy -= 1.2;
    this.cap.vx += Math.random() < 0.5 ? 0.7 : -0.7;
    this.opts.onPoke?.(this.pokes.length);
    if (this.pokes.length >= 3) {
      this.pokes = [];
      this.opts.onDizzy?.();
      this.flash('dizzy', 2600);
    } else {
      this.eyeOverride = 'line'; // недовольно прищурился
      this.eyeOverrideUntil = this.now + 0.8;
    }
  }
  private emit(type: ParticleType, count: number) {
    for (let i = 0; i < count; i++) {
      const z = type === 'z', sweat = type === 'sweat';
      this.particles.push({
        type,
        x: sweat ? rand(0.7, 0.9) * (Math.random() < 0.5 ? -1 : 1) : rand(-0.45, 0.45) + (z ? 0.55 : 0),
        y: sweat ? -0.45 : -0.7 - rand(0, 0.2),
        vx: rand(-0.17, 0.17) + (z ? 0.18 : 0),
        vy: sweat ? 0.35 : -(0.45 + rand(0, 0.35)),
        age: -i * 0.14, // отрицательный возраст = вылет с задержкой
        life: 1.3 + rand(0, 0.5),
        rot: rand(0, Math.PI * 2),
        size: 0.15 + rand(0, 0.08),
      });
    }
  }

  // ---------- цикл кадров ----------

  private start() {
    if (this.running) return;
    this.running = true;
    this.last = performance.now() / 1000;
    const frame = (ts: number) => {
      if (!this.running) return;
      this.now = ts / 1000;
      const dt = clamp(this.now - this.last, 1e-3, 0.05);
      this.last = this.now;
      this.update(dt);
      this.draw();
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }
  private stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }
  private resize() {
    const r = this.canvas.getBoundingClientRect();
    this.DPR = devicePixelRatio || 1;
    this.W = r.width;
    this.H = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * this.DPR));
    this.canvas.height = Math.max(1, Math.round(r.height * this.DPR));
  }
  private geom() {
    const R = Math.min(this.W / 2.9, this.H / 3.2) * this.opts.scale;
    const morph = this.m.morph;
    return {
      R,
      rx: R * lerp(1.14, 0.98, morph),
      ry: R * lerp(0.88, 0.98, morph),
      cx: this.W / 2 + this.m.ox * R,
      cy: this.H * this.opts.centerY + this.m.oy * R,
      ground: this.H * this.opts.centerY,
    };
  }
  private hit(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    const { rx, ry, cx, cy } = this.geom();
    const dx = (clientX - r.left - cx) / rx, dy = (clientY - r.top - cy) / ry;
    return dx * dx + dy * dy < 1.1;
  }

  private update(dt: number) {
    const m = this.m, tg = this.tg, cfg = this.cfg, t = this.now;
    this.tw.run(t);

    // Куда смотреть: на курсор, если он недавно двигался; иначе — блуждающий взгляд
    let lx: number, ly: number;
    if (t - this.pointer.at < 2.5) {
      const r = this.canvas.getBoundingClientRect();
      const { cx, cy } = this.geom();
      lx = clamp((this.pointer.x - r.left - cx) / (innerWidth * 0.35), -1, 1);
      ly = -clamp((this.pointer.y - r.top - cy) / (innerHeight * 0.35), -1, 1);
    } else {
      if (t > this.wander.next) {
        const center = Math.random() < 0.45;
        this.wander = { x: center ? 0 : rand(-0.7, 0.7), y: center ? 0 : rand(-0.3, 0.5), next: t + rand(1.4, 4) };
      }
      lx = this.wander.x;
      ly = this.wander.y;
    }
    let ty = lx * 0.62, tp = ly * 0.5;
    if (cfg.look) { ty = ty * 0.35 + cfg.look[0] * 0.55; tp = tp * 0.3 + cfg.look[1] * 0.5; }
    if (cfg.scans) { ty = Math.sin(t * 2.2) * 0.6; tp = -0.04; }
    if (this.state === 'sleeping') { ty = 0; tp = -0.14; }
    if (this.state === 'dizzy') ty = Math.sin(t * 9) * 0.25;
    tg.yaw = ty;
    tg.pitch = tp;
    tg.tilt = this.state === 'dizzy' ? Math.sin(t * 5) * 0.09 : 0;

    // Подпрыгивание в ожидании
    const bounce = cfg.bounces && !this.calm ? -Math.abs(Math.sin(t * 5.2)) * 0.07 : 0;
    if (!this.tw.locked('oy')) m.oy += (bounce - m.oy) * smooth(0.0008, dt);

    // Дыхание: sy и sx в противофазе
    if (cfg.breathes) { tg.sy = 1 + Math.sin(t * 1.8) * 0.035; tg.sx = 1 - Math.sin(t * 1.8) * 0.02; }
    else { tg.sy = 1 + Math.sin(t * 2.2) * 0.008; tg.sx = 1 - Math.sin(t * 2.2) * 0.005; }

    // Экспоненциальное сглаживание к целям
    const kLook = smooth(0.0025, dt), kGen = smooth(0.0008, dt);
    for (const k of ['yaw', 'pitch'] as const) if (!this.tw.locked(k)) m[k] += (tg[k] - m[k]) * kLook;
    for (const k of ['tilt', 'sx', 'sy', 'es'] as const) if (!this.tw.locked(k)) m[k] += (tg[k] - m[k]) * kGen;
    m.tint += (cfg.tint - m.tint) * smooth(0.002, dt);
    m.morph += ((cfg.morph ?? 0) - m.morph) * smooth(0.004, dt);
    const lvl = this.state === 'receiving' && this.progress !== null ? this.progress : 0;
    m.level += (lvl - m.level) * smooth(lvl < m.level ? 0.0005 : 0.02, dt);
    this.col = this.col.map((c, i) => c + (cfg.color[i] - c) * smooth(0.002, dt));

    // Рот: открытость из состояния, «жевание», и пока карточки летят — открыт настежь
    const incoming = this.cards.some((c) => c.dir === 'in' && !c.done);
    let mt = cfg.mouth ?? 0;
    if (cfg.chew) mt += Math.max(0, Math.sin(t * 7)) * 0.25;
    if (incoming) mt = 1;
    this.mouth.target = mt * clamp(m.morph * 1.6, 0, 1);
    this.mouth.step(dt);

    // Карточки: по прилёте — клац и глоток
    for (const c of this.cards) {
      if (!c.done && t - c.t0 >= c.dur) {
        c.done = true;
        if (c.dir === 'in') {
          this.mouth.vel -= 18;
          this.squash(0.86);
        }
      }
    }
    this.cards = this.cards.filter((c) => t - c.t0 < c.dur + 0.05);

    // Моргание через случайный интервал, иногда двойное
    if (t > this.nextBlink) {
      if (this.state !== 'sleeping' && this.state !== 'dizzy') {
        this.blink();
        if (Math.random() < 0.22) setTimeout(() => this.blink(), 230);
      }
      this.nextBlink = t + 2.2 + Math.random() * 3.2;
    }
    if (this.eyeOverride && t > this.eyeOverrideUntil) this.eyeOverride = null;

    // Фоновые частицы
    if (t - this.lastAmbient > 1.3) {
      this.lastAmbient = t;
      if (cfg.zz) this.emit('z', 1);
      if (this.state === 'dragOver' && Math.random() < 0.3) this.emit('sweat', 1);
    }
    for (const p of this.particles) {
      p.age += dt;
      if (p.age > 0) { p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 1.5; }
    }
    this.particles = this.particles.filter((p) => p.age < p.life);

    // Засыпает от скуки
    if (this.opts.sleepAfter > 0 && this.state === 'idle' && this.base === 'idle' && t - this.lastActivity > this.opts.sleepAfter) {
      this.autoSlept = true;
      this.setState('sleeping');
    }

    // Пружина (stiffness 60, damping 9): кепка отстаёт от движений головы
    const yawVel = (m.yaw - this.prevYaw) / dt, oyVel = (m.oy - this.prevOy) / dt;
    this.prevYaw = m.yaw;
    this.prevOy = m.oy;
    const cap = this.cap;
    const tDx = clamp(-yawVel * 0.35 - m.tilt * 2, -1, 1), tDy = clamp(oyVel * 0.5, -1, 1);
    cap.vx += (60 * (tDx - cap.dx) - 9 * cap.vx) * dt;
    cap.vy += (60 * (tDy - cap.dy) - 9 * cap.vy) * dt;
    cap.dx += cap.vx * dt;
    cap.dy += cap.vy * dt;
  }

  // ---------- отрисовка ----------

  private bodyPath(rx: number, ry: number, morph: number) {
    // Тело — суперэллипс, перетекающий точка-в-точку в почти-прямоугольник ящика
    const p = new Path2D(), n = 72, e1 = 2 / BODY_N, e2 = 2 / BOX_N;
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      const sc = Math.sign(c), ss = Math.sign(s), ac = Math.abs(c), as = Math.abs(s);
      const x = rx * sc * lerp(ac ** e1, ac ** e2, morph);
      const y = ry * ss * lerp(as ** e1, as ** e2, morph);
      i ? p.lineTo(x, y) : p.moveTo(x, y);
    }
    p.closePath();
    return p;
  }

  private draw() {
    const g = this.g, m = this.m, W = this.W, H = this.H;
    g.setTransform(this.DPR, 0, 0, this.DPR, 0, 0);
    g.clearRect(0, 0, W, H);
    const { R, rx, ry, cx, cy, ground } = this.geom();

    // Тень на «земле»: меньше и бледнее в прыжке
    const lift = clamp(-m.oy, 0, 1);
    g.fillStyle = `rgba(${this.dark ? '0,0,0' : '90,60,30'},${(this.dark ? 0.35 : 0.14) - lift * 0.1})`;
    g.beginPath();
    g.ellipse(cx, ground + ry * 1.04, rx * 0.85 * (1 - lift * 0.4) * m.sx, ry * 0.13 * (1 - lift * 0.4), 0, 0, Math.PI * 2);
    g.fill();

    g.save();
    // Масштаб вокруг «подошвы», чтобы при сплющивании существо стояло на земле
    g.translate(cx, cy + ry);
    g.rotate(m.tilt);
    g.scale(m.sx, m.sy);
    g.translate(0, -ry);

    this.drawFlag(R, rx, ry);
    const body = this.bodyPath(rx, ry, m.morph);

    // Слой 1: базовый тёплый градиент + цветное свечение
    const base = g.createLinearGradient(rx * 0.7, -ry * 0.85, -rx * 0.8, ry * 0.9);
    base.addColorStop(0, '#FFF5E8');
    base.addColorStop(1, '#E8C8A6');
    g.shadowColor = rgba(this.col, this.cfg.glow * (this.dark ? 0.7 : 0.45));
    g.shadowBlur = R * 0.7;
    g.fillStyle = base;
    g.fill(body);
    g.shadowBlur = 0;
    g.shadowColor = 'transparent';

    // Слой 2: оттенок состояния снизу вверх
    if (m.tint > 0.01) {
      const tgr = g.createLinearGradient(0, ry, 0, -ry);
      tgr.addColorStop(0, rgba(this.col, 0.72 * m.tint));
      tgr.addColorStop(1, rgba(this.col, 0));
      g.fillStyle = tgr;
      g.fill(body);
    }

    g.save();
    g.clip(body);
    // Заливка-волна: существо «наполняется» по мере приёма файла
    if (m.level > 0.004) this.drawLevel(rx, ry);
    g.restore();

    // Слой 3: тень по краю — объём
    const rim = g.createRadialGradient(0, 0, R * 0.15, 0, 0, R * 1.25);
    rim.addColorStop(0, 'rgba(0,0,0,0)');
    rim.addColorStop(0.6, 'rgba(0,0,0,0)');
    rim.addColorStop(1, 'rgba(60,30,10,.2)');
    g.fillStyle = rim;
    g.fill(body);
    // Слой 4: блик — глянец
    const hl = g.createRadialGradient(rx * 0.34, -ry * 0.46, 0, rx * 0.34, -ry * 0.46, R * 0.42);
    hl.addColorStop(0, 'rgba(255,255,255,.6)');
    hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hl;
    g.fill(body);

    // Лицо обрезается по контуру тела
    g.save();
    g.clip(body);
    this.drawBlush(R, rx, ry);
    this.drawEyes(R, rx, ry);
    this.drawMouth(R, rx, ry);
    g.restore();

    this.drawCap(R, ry);
    g.restore();

    this.drawCards(R, cx, cy, ry);
    this.drawBadge(cx, cy, R, rx, ry);
    this.drawParticles(cx, cy, R);
  }

  private drawLevel(rx: number, ry: number) {
    const g = this.g, t = this.now;
    const y0 = ry - this.m.level * ry * 2.05;
    const amp = ry * 0.05;
    g.beginPath();
    g.moveTo(-rx * 1.2, ry * 1.2);
    for (let i = 0; i <= 24; i++) {
      const x = -rx * 1.2 + (i / 24) * rx * 2.4;
      g.lineTo(x, y0 + Math.sin(x / rx * 4 + t * 3) * amp + Math.sin(x / rx * 7 - t * 2) * amp * 0.4);
    }
    g.lineTo(rx * 1.2, ry * 1.2);
    g.closePath();
    g.fillStyle = rgba(this.col, 0.38);
    g.fill();
  }

  private drawCap(R: number, ry: number) {
    // Кепка почтальона: тулья, козырёк, конвертик-эмблема. Висит на пружине и подпрыгивает при приветствии.
    const g = this.g, m = this.m;
    const bx = Math.sin(m.yaw) * R * 0.28 + this.cap.dx * R * 0.08;
    const by = -ry * 0.86 - m.capLift * R * 0.55 + this.cap.dy * R * 0.06;
    const w = R * 0.92, h = R * 0.42;
    g.save();
    g.translate(bx, by);
    g.rotate(-0.12 + this.cap.dx * 0.18 + m.yaw * 0.1);
    g.scale(Math.cos(m.capSpin) * 0.98 + 0.02 * Math.sign(Math.cos(m.capSpin) || 1), 1);

    // тулья
    g.beginPath();
    g.moveTo(-w / 2, 0);
    g.bezierCurveTo(-w / 2, -h * 1.15, w / 2, -h * 1.15, w / 2, 0);
    g.closePath();
    const cg = g.createLinearGradient(0, -h, 0, 0);
    cg.addColorStop(0, '#4a5cc0');
    cg.addColorStop(1, CAP);
    g.fillStyle = cg;
    g.fill();
    // околыш
    g.fillStyle = CAP_DARK;
    g.beginPath();
    g.roundRect(-w / 2, -h * 0.18, w, h * 0.24, h * 0.1);
    g.fill();
    // козырёк смотрит туда же, куда голова
    const vis = Math.sin(m.yaw) * w * 0.3;
    g.beginPath();
    g.ellipse(vis + w * 0.12, h * 0.05, w * 0.42, h * 0.16, 0, 0, Math.PI);
    g.fillStyle = CAP_DARK;
    g.fill();
    // эмблема-конверт
    const ex = vis * 0.6, ey = -h * 0.55, ew = w * 0.24, eh = ew * 0.68;
    g.fillStyle = ENVELOPE;
    g.beginPath();
    g.roundRect(ex - ew / 2, ey - eh / 2, ew, eh, ew * 0.12);
    g.fill();
    g.strokeStyle = '#c99a2e';
    g.lineWidth = ew * 0.09;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(ex - ew / 2 + ew * 0.1, ey - eh / 2 + eh * 0.18);
    g.lineTo(ex, ey + eh * 0.08);
    g.lineTo(ex + ew / 2 - ew * 0.1, ey - eh / 2 + eh * 0.18);
    g.stroke();
    // блик
    g.fillStyle = 'rgba(255,255,255,.18)';
    g.beginPath();
    g.ellipse(w * 0.16, -h * 0.72, w * 0.16, h * 0.12, -0.3, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  private drawFlag(R: number, rx: number, ry: number) {
    // Флажок почтового ящика сбоку: появляется при морфе и поднимается, пока идёт приём
    const g = this.g, m = this.m;
    if (m.morph < 0.05) return;
    const up = this.state === 'receiving' ? 1 : 0;
    const ang = lerp(Math.PI * 0.5, 0, up) + this.cap.dx * 0.2;
    const px = -rx * 1.02 - R * 0.05 - Math.sin(m.yaw) * rx * 0.1, py = -ry * 0.05;
    g.save();
    g.globalAlpha = clamp((m.morph - 0.05) * 3, 0, 1);
    g.translate(px, py);
    g.rotate(-ang);
    g.fillStyle = '#d9483b';
    g.beginPath();
    g.roundRect(-R * 0.04, -R * 0.62, R * 0.08, R * 0.62, R * 0.04);
    g.fill();
    g.beginPath();
    g.roundRect(-R * 0.04, -R * 0.62, R * 0.3, R * 0.2, R * 0.05);
    g.fill();
    g.fillStyle = '#a8342a';
    g.beginPath();
    g.arc(0, 0, R * 0.06, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  private drawBlush(R: number, rx: number, ry: number) {
    const g = this.g, m = this.m;
    const b = Math.max(m.blush, 0.35 + m.tint * 0.3);
    const off = Math.sin(m.yaw) * rx * 0.8;
    g.fillStyle = `rgba(255,120,130,${0.42 * b})`;
    for (const sd of [-1, 1]) {
      g.beginPath();
      g.ellipse(sd * rx * 0.55 + off, ry * 0.18, R * 0.16, R * 0.09, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  private drawMouth(R: number, rx: number, ry: number) {
    // Рот-щель ящика под глазами; ширина зависит от морфа, высота — от пружины
    const g = this.g, m = this.m;
    const open = clamp(this.mouth.pos, -0.1, 1.3);
    if (m.morph < 0.05 || open < 0.02) return;
    const cxm = Math.sin(m.yaw) * rx * 0.75;
    const cym = ry * 0.42 - Math.sin(m.pitch) * ry * 0.3;
    const w = R * 0.62 * m.morph * Math.max(0.3, Math.cos(m.yaw));
    const h = R * 0.22 * open;
    g.fillStyle = INK;
    g.beginPath();
    g.roundRect(cxm - w / 2, cym - h / 2, w, Math.max(h, 1), Math.min(h / 2, w / 2));
    g.fill();
    if (h > R * 0.08) {
      g.fillStyle = '#e46b78'; // язычок
      g.beginPath();
      g.ellipse(cxm, cym + h * 0.28, w * 0.24, h * 0.22, 0, 0, Math.PI * 2);
      g.fill();
    }
  }

  // Глаза «на сфере»: позиция = проекция точки шара, ракурс = cos(угла)
  private drawEyes(R: number, rx: number, ry: number) {
    const g = this.g, m = this.m;
    const shape = this.eyeOverride || this.cfg.eye;
    const lift = m.morph * 0.12; // у ящика глаза чуть выше — освобождают место рту
    for (const sd of [-1, 1]) {
      const eyeYaw = sd * EYE_SP + m.yaw;
      let ep = EYE_P + lift + m.pitch + m.roll;
      ep = (((ep + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      const cp = Math.cos(ep);
      if (Math.cos(eyeYaw) * cp <= 0.04) continue; // глаз ушёл «за горизонт» шара
      const x = Math.sin(eyeYaw) * cp * rx, y = -Math.sin(ep) * ry;
      const fx = Math.max(0.18, Math.cos(eyeYaw)), fy = Math.max(0.18, cp);
      g.save();
      g.translate(x, y);
      g.scale(fx, fy);
      this.drawEye(shape, R * EYE_W * m.es, R * EYE_H * m.es, sd);
      g.restore();
    }
  }

  private drawEye(shape: EyeShape, w: number, h: number, sd: number): void {
    const g = this.g, m = this.m;
    g.fillStyle = INK;
    g.strokeStyle = INK;
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const rr = (x: number, y: number, ww: number, hh: number, r: number) => {
      g.beginPath();
      g.roundRect(x, y, ww, hh, r);
    };
    switch (shape) {
      case 'wide':
        return this.drawEye('pill', w * 1.16, h * 1.12, sd);
      case 'pill': {
        const hh = Math.max(h * m.open, w * 0.3);
        rr(-w / 2, -hh / 2, w, hh, Math.min(w / 2, hh / 2));
        g.fill();
        if (m.open > 0.5) {
          // блик в глазу
          g.fillStyle = 'rgba(255,255,255,.85)';
          g.beginPath();
          g.ellipse(w * 0.14, -hh * 0.2, w * 0.13, w * 0.13, 0, 0, Math.PI * 2);
          g.fill();
        }
        break;
      }
      case 'flat': {
        const hh = w * 0.34;
        rr(-w / 2, -hh / 2 + h * 0.1, w, hh, hh / 2);
        g.fill();
        break;
      }
      case 'line': {
        g.rotate(-sd * 0.25);
        const hh = w * 0.26;
        rr(-w * 0.55, -hh / 2, w * 1.1, hh, hh / 2);
        g.fill();
        break;
      }
      case 'happy':
        g.lineWidth = w * 0.3;
        g.beginPath();
        g.moveTo(-w * 0.45, h * 0.18);
        g.quadraticCurveTo(0, -h * 0.5, w * 0.45, h * 0.18);
        g.stroke();
        break;
      case 'closed':
        g.lineWidth = w * 0.26;
        g.beginPath();
        g.moveTo(-w * 0.45, 0);
        g.quadraticCurveTo(0, h * 0.4, w * 0.45, 0);
        g.stroke();
        break;
      case 'spiral': {
        g.lineWidth = w * 0.14;
        g.beginPath();
        const turns = 2.2, steps = 60, spin = this.now * 7 * sd;
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * turns * Math.PI * 2, r = (w * 0.55 * i) / steps;
          const px = Math.cos(a + spin) * r, py = Math.sin(a + spin) * r;
          i ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.stroke();
        break;
      }
    }
  }

  private drawCards(R: number, cx: number, cy: number, ry: number) {
    const g = this.g, m = this.m;
    for (const c of this.cards) {
      const p = clamp((this.now - c.t0) / c.dur, 0, 1);
      let x: number, y: number, s: number, rot: number, a: number;
      if (c.dir === 'in') {
        // Сверху по дуге прямо в рот-щель
        const e = E.in(p);
        const mx = cx + Math.sin(m.yaw) * R * 0.7, my = cy + ry * 0.42;
        x = lerp(cx + c.x0 * R * 2, mx, e) + Math.sin(p * Math.PI) * R * 0.3 * Math.sign(c.x0 || 1);
        y = lerp(Math.max(R * 0.3, cy - R * 2.2), my, e);
        s = lerp(1, 0.25, E.in(clamp((p - 0.6) / 0.4, 0, 1)));
        rot = (1 - p) * 0.8 * Math.sign(c.x0 || 1);
        a = clamp(p * 6, 0, 1) * (p > 0.92 ? (1 - p) / 0.08 : 1);
      } else {
        // Из «рук» вверх и прочь
        const e = E.out(p);
        x = cx + c.x0 * R + Math.sin(p * 5) * R * 0.08;
        y = lerp(cy - R * 0.4, cy - R * 3, e);
        s = lerp(0.6, 1.05, e);
        rot = Math.sin(p * 4) * 0.25;
        a = p < 0.7 ? 1 : (1 - p) / 0.3;
      }
      g.save();
      g.globalAlpha = a;
      g.translate(x, y);
      g.rotate(rot);
      g.scale(s, s);
      this.drawFileCard(R * 0.42, c.hue);
      g.restore();
    }
  }

  /** Карточка-файл с загнутым уголком. */
  private drawFileCard(w: number, hue: number) {
    const g = this.g, h = w * 1.25, f = w * 0.3;
    const colors = ['#5b8def', '#34d399', '#f59e0b', '#ec4899', '#8b5cf6'];
    const accent = colors[Math.floor(hue * colors.length) % colors.length];
    g.shadowColor = 'rgba(0,0,0,.18)';
    g.shadowBlur = w * 0.25;
    g.shadowOffsetY = w * 0.06;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.moveTo(-w / 2 + w * 0.12, -h / 2);
    g.lineTo(w / 2 - f, -h / 2);
    g.lineTo(w / 2, -h / 2 + f);
    g.lineTo(w / 2, h / 2 - w * 0.12);
    g.quadraticCurveTo(w / 2, h / 2, w / 2 - w * 0.12, h / 2);
    g.lineTo(-w / 2 + w * 0.12, h / 2);
    g.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - w * 0.12);
    g.lineTo(-w / 2, -h / 2 + w * 0.12);
    g.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + w * 0.12, -h / 2);
    g.fill();
    g.shadowColor = 'transparent';
    g.shadowBlur = 0;
    g.shadowOffsetY = 0;
    g.fillStyle = '#e6e8ef';
    g.beginPath();
    g.moveTo(w / 2 - f, -h / 2);
    g.lineTo(w / 2 - f, -h / 2 + f);
    g.lineTo(w / 2, -h / 2 + f);
    g.closePath();
    g.fill();
    g.fillStyle = accent;
    g.beginPath();
    g.roundRect(-w * 0.3, -h * 0.12, w * 0.6, h * 0.34, w * 0.08);
    g.fill();
    g.fillStyle = '#d5d9e3';
    g.beginPath();
    g.roundRect(-w * 0.3, h * 0.3, w * 0.42, w * 0.07, w * 0.035);
    g.fill();
  }

  private drawBadge(cx: number, cy: number, R: number, rx: number, ry: number) {
    const g = this.g;
    if (!this.badge || this.m.badgeS < 0.01) return;
    const x = cx + rx * 0.86, y = cy - ry * 0.7, s = this.m.badgeS;
    const r = R * 0.2 * s * (this.badge === 'dot' ? 0.6 : 1);
    g.fillStyle = rgba(this.col, 1);
    g.strokeStyle = this.dark ? '#111318' : '#fbf6ef';
    g.lineWidth = R * 0.05;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
    g.stroke();
    g.fillStyle = '#fff';
    if (this.badge === 'dots') {
      for (let i = 0; i < 3; i++) {
        const dy = -Math.abs(Math.sin(this.now * 6 - i * 0.6)) * r * 0.18;
        g.beginPath();
        g.arc(x + (i - 1) * r * 0.45, y + dy, r * 0.13, 0, Math.PI * 2);
        g.fill();
      }
    } else if (this.badge === 'bang') {
      g.font = `800 ${r * 1.4}px system-ui`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('!', x, y + r * 0.05);
    }
  }

  private starPath(outer: number, inner: number, points: number) {
    const g = this.g;
    g.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const a = (i * Math.PI) / points - Math.PI / 2, r = i % 2 ? inner : outer;
      i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
  }

  private drawParticles(cx: number, cy: number, R: number) {
    const g = this.g;
    for (const p of this.particles) {
      if (p.age < 0) continue;
      const k = p.age / p.life;
      const a = Math.min(1, p.age / 0.15) * (k > 0.7 ? (1 - k) / 0.3 : 1); // fade in / fade out
      const s = p.size * R;
      g.save();
      g.globalAlpha = a;
      g.translate(cx + p.x * R, cy + p.y * R);
      switch (p.type) {
        case 'heart':
          g.rotate(Math.sin(p.rot) * 0.3);
          g.beginPath();
          g.moveTo(0, s * 0.35);
          g.bezierCurveTo(-s * 1.1, -s * 0.35, -s * 0.45, -s * 1.05, 0, -s * 0.45);
          g.bezierCurveTo(s * 0.45, -s * 1.05, s * 1.1, -s * 0.35, 0, s * 0.35);
          g.fillStyle = '#ff5c8a';
          g.fill();
          break;
        case 'star':
          g.rotate(p.rot);
          this.starPath(s * 0.6, s * 0.26, 5);
          g.fillStyle = '#ffd43b';
          g.fill();
          break;
        case 'spark':
          g.rotate(p.rot);
          this.starPath(s * 0.55, s * 0.12, 4);
          g.fillStyle = rgba(this.col, 1);
          g.fill();
          break;
        case 'sweat':
          g.beginPath();
          g.moveTo(0, -s * 0.55);
          g.bezierCurveTo(s * 0.5, 0, s * 0.4, s * 0.45, 0, s * 0.45);
          g.bezierCurveTo(-s * 0.4, s * 0.45, -s * 0.5, 0, 0, -s * 0.55);
          g.fillStyle = '#74c0fc';
          g.fill();
          break;
        case 'z':
          g.fillStyle = '#aab4c8';
          g.font = `700 ${s * 1.6}px system-ui`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText('z', 0, 0);
          break;
      }
      g.restore();
    }
  }
}
