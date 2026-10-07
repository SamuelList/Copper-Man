import type { Box } from '../model/types';

/**
 * Read-only view of the collision/visibility grid. Out-of-bounds tiles are solid and opaque.
 *
 * Whole-tile blockers (walls, the van, locked doors) answer `isSolid` / `isOpaque`. Furniture
 * and fixtures only fill part of their tile, so they're reported as boxes sized to the object.
 */
export interface Grid {
  readonly cols: number;
  readonly rows: number;
  readonly tileSize: number;
  /** The whole tile blocks movement. */
  isSolid(col: number, row: number): boolean;
  /** The whole tile blocks line of sight. */
  isOpaque(col: number, row: number): boolean;
  /** Object hitboxes (pixels) inside this tile that block movement. */
  solidBoxesAt(col: number, row: number): readonly Box[];
  /** Object boxes (pixels) inside this tile that block line of sight (tall furniture). */
  opaqueBoxesAt(col: number, row: number): readonly Box[];
}

export const inBounds = (grid: Pick<Grid, 'cols' | 'rows'>, col: number, row: number) =>
  col >= 0 && row >= 0 && col < grid.cols && row < grid.rows;

export const tileCenter = (tileSize: number, col: number, row: number) => ({
  x: (col + 0.5) * tileSize,
  y: (row + 0.5) * tileSize,
});

export const worldToTile = (tileSize: number, x: number, y: number) => ({
  col: Math.floor(x / tileSize),
  row: Math.floor(y / tileSize),
});

export const tileBox = (tileSize: number, col: number, row: number): Box => ({
  minX: col * tileSize,
  minY: row * tileSize,
  maxX: (col + 1) * tileSize,
  maxY: (row + 1) * tileSize,
});

export const boxCenter = (b: Box) => ({ x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });

/** Distance from a point to the nearest point of a box (0 when inside). */
export function distanceToBox(b: Box, x: number, y: number): number {
  const dx = Math.max(b.minX - x, 0, x - b.maxX);
  const dy = Math.max(b.minY - y, 0, y - b.maxY);
  return Math.hypot(dx, dy);
}
