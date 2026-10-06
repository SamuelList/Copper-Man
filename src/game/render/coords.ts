import { TILE_SIZE } from '@core/content/balance';
import type { WallSide } from '@core/level/footprint';

/** Simulation pixels → world units (1 unit = 1 tile). Map x → world X, map y → world Z. */
export const toWorld = (px: number) => px / TILE_SIZE;

/** Character models face +X; turn them to a map heading (radians, y-down). */
export const headingToRotation = (facing: number) => -facing;

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
