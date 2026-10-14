import type { RGB } from './engine';

export type EyeShape = 'pill' | 'wide' | 'happy' | 'closed' | 'line' | 'flat' | 'spiral';
export type Badge = 'dots' | 'bang' | 'dot' | null;

export interface StateConfig {
  color: RGB;
  /** Сила оттенка состояния снизу вверх, 0..1. */
  tint: number;
  eye: EyeShape;
  badge: Badge;
  glow: number;
  /** Насколько тело превращается в почтовый ящик, 0..1. */
  morph?: number;
  /** Открытость рта-щели, 0..1. */
  mouth?: number;
  /** Рот ритмично «жуёт» (идёт приём). */
  chew?: boolean;
  /** Взгляд, смешанный с курсором: [yaw, pitch] в долях. */
  look?: [number, number];
  scans?: boolean;
  bounces?: boolean;
  breathes?: boolean;
  zz?: boolean;
}

// Поведение — таблица данных, а не код (README, раздел 7).
export const STATES = {
  idle:      { color: [255, 196, 140], tint: 0,   eye: 'pill',   badge: null,   glow: 0.28 },
  waiting:   { color: [120, 160, 255], tint: 0.3, eye: 'pill',   badge: null,   glow: 0.35, scans: true },
  dragOver:  { color: [255, 170, 60],  tint: 0.55, eye: 'wide',  badge: 'bang', glow: 0.6, morph: 0.6, mouth: 0.75, bounces: true },
  receiving: { color: [76, 132, 255],  tint: 0.35, eye: 'pill',  badge: 'dots', glow: 0.55, morph: 1, mouth: 0.3, chew: true, look: [0, 0.35] },
  sending:   { color: [76, 132, 255],  tint: 0.55, eye: 'pill',  badge: 'dots', glow: 0.55, look: [0, 0.6] },
  done:      { color: [52, 212, 153],  tint: 0.35, eye: 'happy', badge: 'dot',  glow: 0.5 },
  error:     { color: [244, 80, 94],   tint: 0.72, eye: 'flat',  badge: 'dot',  glow: 0.55 },
  offline:   { color: [148, 162, 184], tint: 0.45, eye: 'line',  badge: 'bang', glow: 0.25 },
  sleeping:  { color: [148, 162, 184], tint: 0.32, eye: 'closed', badge: null,  glow: 0.2, breathes: true, zz: true },
  dizzy:     { color: [244, 114, 182], tint: 0.7, eye: 'spiral', badge: null,   glow: 0.55 },
} satisfies Record<string, StateConfig>;

export type CreatureState = keyof typeof STATES;
