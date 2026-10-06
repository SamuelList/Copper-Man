import type { Box, Footprint } from '../model/types';
import { tileAt } from './asciiLevel';
import type { LevelDef } from './types';

export type WallSide = 'north' | 'south' | 'west' | 'east';

/**
 * Which neighbouring wall an object on this tile backs onto. Shared by collision (core) and the
 * renderer, so a hitbox always lines up with its model.
 */
export function mountSide(level: LevelDef, col: number, row: number): WallSide | null {
  if (tileAt(level, col, row - 1) === 'wall') return 'north';
  if (tileAt(level, col - 1, row) === 'wall') return 'west';
  if (tileAt(level, col + 1, row) === 'wall') return 'east';
  if (tileAt(level, col, row + 1) === 'wall') return 'south';
  return null;
}

/** The floor area (pixels) an object actually covers on its tile. */
export function footprintBox(
  fp: Footprint,
  col: number,
  row: number,
  side: WallSide | null,
  ts: number,
): Box {
  const x0 = col * ts;
  const y0 = row * ts;
  const cx = x0 + ts / 2;
  const cy = y0 + ts / 2;
  const w = fp.w * ts;
  const d = fp.d * ts;
  if (fp.anchor === 'wall' && side) {
    switch (side) {
      case 'north':
        return { minX: cx - w / 2, maxX: cx + w / 2, minY: y0, maxY: y0 + d };
      case 'south':
        return { minX: cx - w / 2, maxX: cx + w / 2, minY: y0 + ts - d, maxY: y0 + ts };
      case 'west':
        return { minX: x0, maxX: x0 + d, minY: cy - w / 2, maxY: cy + w / 2 };
      case 'east':
        return { minX: x0 + ts - d, maxX: x0 + ts, minY: cy - w / 2, maxY: cy + w / 2 };
    }
  }
  return { minX: cx - w / 2, maxX: cx + w / 2, minY: cy - d / 2, maxY: cy + d / 2 };
}
