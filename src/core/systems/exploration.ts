import type { Grid } from '../level/grid';
import type { TilePos, Vec2 } from '../model/types';

/**
 * Which tiles of a level the worker has ever laid eyes on. Unexplored tiles are drawn pitch
 * black; explored ones are remembered (greyed out when out of sight). Saved with the career as
 * a run-length string, so a big school only has to be explored once.
 */
export class ExploredMap {
  readonly bits: Uint8Array;
  private seen = 0;
  /** Tiles marked since the last `takeFresh()` (row-major indices), for the renderer. */
  private fresh: number[] = [];

  constructor(
    readonly cols: number,
    readonly rows: number,
    encoded?: string,
  ) {
    this.bits = decodeExplored(encoded, cols * rows) ?? new Uint8Array(cols * rows);
    for (const b of this.bits) this.seen += b;
  }

  has(col: number, row: number) {
    return this.inBounds(col, row) && this.bits[row * this.cols + col] === 1;
  }

  /** Mark a tile seen; true if it wasn't before. */
  mark(col: number, row: number): boolean {
    if (!this.inBounds(col, row)) return false;
    const i = row * this.cols + col;
    if (this.bits[i]) return false;
    this.bits[i] = 1;
    this.seen++;
    this.fresh.push(i);
    return true;
  }

  /** Tiles newly seen since the last call. */
  takeFresh(): number[] {
    const out = this.fresh;
    this.fresh = [];
    return out;
  }

  /** Share of the level seen, 0..1. */
  get fraction() {
    return this.seen / this.bits.length;
  }

  encode() {
    return encodeExplored(this.bits);
  }

  private inBounds(col: number, row: number) {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }
}

/** Run lengths, alternating unseen/seen, starting with unseen: "40.12.300…". */
export function encodeExplored(bits: Uint8Array): string {
  const runs: number[] = [];
  let current = 0;
  let run = 0;
  for (const b of bits) {
    if (b === current) run++;
    else {
      runs.push(run);
      current = b;
      run = 1;
    }
  }
  runs.push(run);
  return runs.join('.');
}

/** Null when the string is missing, malformed, or for a different-sized level. */
export function decodeExplored(encoded: string | undefined, length: number): Uint8Array | null {
  if (!encoded) return null;
  const runs = encoded.split('.').map(Number);
  if (runs.some((n) => !Number.isInteger(n) || n < 0)) return null;
  if (runs.reduce((a, b) => a + b, 0) !== length) return null;
  const bits = new Uint8Array(length);
  let i = 0;
  runs.forEach((n, k) => {
    if (k % 2 === 1) bits.fill(1, i, i + n);
    i += n;
  });
  return bits;
}

/** Ray-casting point-in-polygon test. */
function inside(poly: readonly Vec2[], x: number, y: number) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/**
 * Tiles revealed by a visibility outline (pixels): every tile whose centre is inside it, plus
 * the walls and other blockers bordering those tiles (you saw their faces).
 */
export function tilesInView(outline: readonly Vec2[], grid: Grid): TilePos[] {
  if (outline.length < 3) return [];
  const ts = grid.tileSize;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of outline) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const c0 = Math.max(0, Math.floor(minX / ts));
  const r0 = Math.max(0, Math.floor(minY / ts));
  const c1 = Math.min(grid.cols - 1, Math.floor(maxX / ts));
  const r1 = Math.min(grid.rows - 1, Math.floor(maxY / ts));
  const seen = new Set<number>();
  const out: TilePos[] = [];
  const add = (col: number, row: number) => {
    if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return;
    const k = row * grid.cols + col;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ col, row });
  };
  const visible: TilePos[] = [];
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      if (inside(outline, (col + 0.5) * ts, (row + 0.5) * ts)) visible.push({ col, row });
    }
  }
  for (const t of visible) add(t.col, t.row);
  // Blockers bordering what you saw: walls, doors, tall furniture (you saw their faces).
  for (const t of visible) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const c = t.col + dc;
        const r = t.row + dr;
        if (grid.isOpaque(c, r) || grid.isSolid(c, r) || grid.solidBoxesAt(c, r).length > 0) {
          add(c, r);
        }
      }
    }
  }
  return out;
}
