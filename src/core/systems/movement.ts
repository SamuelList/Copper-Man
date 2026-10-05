import type { Grid } from '../level/grid';
import type { Vec2 } from '../model/types';

const EPS = 0.001;

function overlapsSolid(grid: Grid, x: number, y: number, r: number): boolean {
  const ts = grid.tileSize;
  const c0 = Math.floor((x - r) / ts);
  const c1 = Math.floor((x + r - EPS) / ts);
  const r0 = Math.floor((y - r) / ts);
  const r1 = Math.floor((y + r - EPS) / ts);
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      if (grid.isSolid(col, row)) return true;
    }
  }
  return false;
}

function stepAxis(grid: Grid, pos: Vec2, r: number, d: number, axis: 'x' | 'y'): Vec2 {
  if (d === 0) return pos;
  const ts = grid.tileSize;
  const next = { ...pos, [axis]: pos[axis] + d };
  if (!overlapsSolid(grid, next.x, next.y, r)) return next;
  // Snap flush against the tile we ran into.
  const edge = d > 0 ? next[axis] + r : next[axis] - r;
  const tile = Math.floor(edge / ts);
  next[axis] = d > 0 ? tile * ts - r - EPS : (tile + 1) * ts + r + EPS;
  return overlapsSolid(grid, next.x, next.y, r) ? pos : next;
}

/**
 * Move a square body (half-size `r`) by (dx, dy), sliding along walls. Axis-separated so the
 * player slides along walls instead of sticking. Sub-steps prevent tunnelling on long frames.
 */
export function moveWithCollision(grid: Grid, pos: Vec2, r: number, dx: number, dy: number): Vec2 {
  const maxStep = grid.tileSize * 0.4;
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / maxStep));
  let p = pos;
  for (let i = 0; i < steps; i++) {
    p = stepAxis(grid, p, r, dx / steps, 'x');
    p = stepAxis(grid, p, r, dy / steps, 'y');
  }
  return p;
}
