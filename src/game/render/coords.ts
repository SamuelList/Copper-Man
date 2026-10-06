import { TILE_SIZE } from '@core/content/balance';
import { tileAt } from '@core/level/asciiLevel';
import type { LevelDef } from '@core/level/types';

/** Simulation pixels → world units (1 unit = 1 tile). Map x → world X, map y → world Z. */
export const toWorld = (px: number) => px / TILE_SIZE;

/** Character models face +X; turn them to a map heading (radians, y-down). */
export const headingToRotation = (facing: number) => -facing;

export type WallSide = 'north' | 'south' | 'west' | 'east';

/** Which neighbouring wall a fixture on this tile should be mounted against, if any. */
export function wallSide(level: LevelDef, col: number, row: number): WallSide | null {
  if (tileAt(level, col, row - 1) === 'wall') return 'north';
  if (tileAt(level, col - 1, row) === 'wall') return 'west';
  if (tileAt(level, col + 1, row) === 'wall') return 'east';
  if (tileAt(level, col, row + 1) === 'wall') return 'south';
  return null;
}

/** Rotation that puts a model's back (local -Z) against the given wall. */
export function mountRotation(side: WallSide | null): number {
  switch (side) {
    case 'south':
      return Math.PI;
    case 'west':
      return Math.PI / 2;
    case 'east':
      return -Math.PI / 2;
    default:
      return 0;
  }
}
