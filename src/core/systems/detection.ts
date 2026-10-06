import { BALANCE } from '../content/balance';

const V = BALANCE.npc.vision;

/** How far an NPC can pick out a target standing in the given light (0 dark..1 lit). */
export function effectiveRange(range: number, light: number): number {
  return range * (V.darkRangeMult + (1 - V.darkRangeMult) * light);
}

export interface DetectionInput {
  distance: number;
  /** Light-adjusted range (see effectiveRange). */
  range: number;
  fillRate: number;
  light: number;
}

/**
 * Detection meter gain per second for a target in view. The near zone (inner part of the cone)
 * spots you fast; the far zone ramps up as you get closer. Darkness slows everything down.
 */
export function detectionRate({ distance, range, fillRate, light }: DetectionInput): number {
  const near = range * V.nearFraction;
  const zone = distance <= near ? V.nearMult : 1 + (1 - distance / range);
  const lightMult = V.darkFillMult + (1 - V.darkFillMult) * light;
  return fillRate * zone * lightMult;
}
