import type { Grid } from '@core/level/grid';
import type { Vec2 } from '@core/model/types';
import { traverseRay } from '@core/systems/vision';

/** Rays cast around the eye: every half degree. */
const RAYS = 720;

/**
 * What a first-person camera could possibly see, by tile. A perspective camera's view takes in
 * most of the map, but indoors nearly all of that is behind walls; drawing it anyway costs
 * several times the frame. So a fan of rays walks the grid from the eye, marking every tile
 * until each ray meets a wall, and the renderer skips scenery whose tiles aren't marked.
 *
 * It errs on the side of drawing: only whole-tile blockers stop a ray (furniture doesn't), and
 * queries can pad their area, so nothing in view goes missing.
 */
export class TileVisibility {
  private readonly mask: Uint8Array;
  private from: Vec2 | null = null;

  constructor(private readonly grid: Grid) {
    this.mask = new Uint8Array(grid.cols * grid.rows);
  }

  /** Forget the last eye position (the grid changed: a door opened). */
  invalidate() {
    this.from = null;
  }

  /**
   * Mark what's visible from `origin` (pixels) out to `range`. Skipped if the eye has barely
   * moved since last time; returns whether anything was recomputed.
   */
  update(origin: Vec2, range: number): boolean {
    const { grid, mask } = this;
    if (this.from && Math.hypot(origin.x - this.from.x, origin.y - this.from.y) < 1) return false;
    this.from = { ...origin };
    mask.fill(0);
    const { cols, rows } = grid;
    for (let i = 0; i < RAYS; i++) {
      traverseRay(grid, origin, (i / RAYS) * Math.PI * 2, range, (col, row, t) => {
        if (col < 0 || row < 0 || col >= cols || row >= rows) return true;
        mask[row * cols + col] = 1;
        // The tile you stand in never blocks; any other opaque one is seen, and stops the ray.
        return t > 0 && grid.isOpaque(col, row);
      });
    }
    return true;
  }

  has(col: number, row: number) {
    const { cols, rows } = this.grid;
    return col >= 0 && row >= 0 && col < cols && row < rows && this.mask[row * cols + col] === 1;
  }

  /** Is any tile in this rectangle (inclusive, clamped to the map) visible? */
  anyIn(col0: number, row0: number, col1: number, row1: number) {
    const { cols, rows } = this.grid;
    const c0 = Math.max(0, Math.floor(col0));
    const c1 = Math.min(cols - 1, Math.floor(col1));
    const r0 = Math.max(0, Math.floor(row0));
    const r1 = Math.min(rows - 1, Math.floor(row1));
    for (let row = r0; row <= r1; row++) {
      const offset = row * cols;
      for (let col = c0; col <= c1; col++) if (this.mask[offset + col] === 1) return true;
    }
    return false;
  }
}
