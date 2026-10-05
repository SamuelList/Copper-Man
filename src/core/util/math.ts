import type { NumRange, Vec2 } from '../model/types';

export const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Round to hundredths — scrap amounts are displayed and compared at this precision. */
export const round2 = (v: number) => Math.round(v * 100) / 100;

export const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

export const angleTo = (from: Vec2, to: Vec2) => Math.atan2(to.y - from.y, to.x - from.x);

/** Smallest signed difference between two angles, in (-PI, PI]. */
export function angleDiff(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** Rotate `current` toward `target` by at most `maxStep` radians. */
export function turnToward(current: number, target: number, maxStep: number): number {
  const d = angleDiff(current, target);
  if (Math.abs(d) <= maxStep) return target;
  return current + Math.sign(d) * maxStep;
}

export const inRange = (range: NumRange, t: number) => range.min + (range.max - range.min) * t;

export const deg = (degrees: number) => (degrees * Math.PI) / 180;
