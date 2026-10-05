import type { Grid } from '../level/grid';
import type { Vec2 } from '../model/types';
import { angleDiff, angleTo, dist } from '../util/math';

/**
 * Distance along a ray until it enters an opaque tile (grid DDA / Amanatides–Woo), capped at
 * `maxDist`.
 */
export function castRay(grid: Grid, origin: Vec2, angle: number, maxDist: number): number {
  const ts = grid.tileSize;
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  let col = Math.floor(origin.x / ts);
  let row = Math.floor(origin.y / ts);
  const stepX = dirX > 0 ? 1 : -1;
  const stepY = dirY > 0 ? 1 : -1;
  const tDeltaX = dirX !== 0 ? Math.abs(ts / dirX) : Infinity;
  const tDeltaY = dirY !== 0 ? Math.abs(ts / dirY) : Infinity;
  let tMaxX =
    dirX > 0
      ? ((col + 1) * ts - origin.x) / dirX
      : dirX < 0
        ? (col * ts - origin.x) / dirX
        : Infinity;
  let tMaxY =
    dirY > 0
      ? ((row + 1) * ts - origin.y) / dirY
      : dirY < 0
        ? (row * ts - origin.y) / dirY
        : Infinity;

  for (;;) {
    let t: number;
    if (tMaxX < tMaxY) {
      col += stepX;
      t = tMaxX;
      tMaxX += tDeltaX;
    } else {
      row += stepY;
      t = tMaxY;
      tMaxY += tDeltaY;
    }
    if (t >= maxDist) return maxDist;
    if (grid.isOpaque(col, row)) return t;
  }
}

export function hasLineOfSight(grid: Grid, from: Vec2, to: Vec2): boolean {
  const d = dist(from, to);
  if (d < 1e-6) return true;
  return castRay(grid, from, angleTo(from, to), d) >= d - 1e-6;
}

export interface ViewCone {
  pos: Vec2;
  facing: number;
  /** Full field-of-view angle in radians. */
  fov: number;
  range: number;
}

export function inCone(cone: ViewCone, target: Vec2): boolean {
  if (dist(cone.pos, target) > cone.range) return false;
  return Math.abs(angleDiff(cone.facing, angleTo(cone.pos, target))) <= cone.fov / 2;
}

export function canSee(grid: Grid, cone: ViewCone, target: Vec2): boolean {
  return inCone(cone, target) && hasLineOfSight(grid, cone.pos, target);
}

/** Fan of ray hit points for rendering a wall-occluded vision cone. */
export function visionPolygon(grid: Grid, cone: ViewCone, rays = 24): Vec2[] {
  const points: Vec2[] = [{ ...cone.pos }];
  const start = cone.facing - cone.fov / 2;
  for (let i = 0; i <= rays; i++) {
    const a = start + (cone.fov * i) / rays;
    const d = castRay(grid, cone.pos, a, cone.range);
    points.push({ x: cone.pos.x + Math.cos(a) * d, y: cone.pos.y + Math.sin(a) * d });
  }
  return points;
}
