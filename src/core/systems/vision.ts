import { BALANCE } from '../content/balance';
import type { Grid } from '../level/grid';
import type { Box, Vec2 } from '../model/types';
import { angleDiff, angleTo, dist } from '../util/math';

/**
 * Walk the tiles a ray passes through (grid DDA / Amanatides–Woo), starting with the tile the
 * ray leaves from. `visit(col, row, t)` gets the distance at which the ray enters each tile;
 * return true to stop. Stops by itself once `maxDist` is reached.
 */
export function traverseRay(
  grid: Grid,
  origin: Vec2,
  angle: number,
  maxDist: number,
  visit: (col: number, row: number, t: number) => boolean,
): void {
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

  if (visit(col, row, 0)) return;
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
    if (t >= maxDist) return;
    if (visit(col, row, t)) return;
  }
}

/** Distance along a ray to where it enters a box (slab test), or Infinity if it misses. */
function rayBoxDistance(ox: number, oy: number, dx: number, dy: number, b: Box): number {
  let tMin = -Infinity;
  let tMax = Infinity;
  if (Math.abs(dx) < 1e-12) {
    if (ox < b.minX || ox > b.maxX) return Infinity;
  } else {
    const t1 = (b.minX - ox) / dx;
    const t2 = (b.maxX - ox) / dx;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }
  if (Math.abs(dy) < 1e-12) {
    if (oy < b.minY || oy > b.maxY) return Infinity;
  } else {
    const t1 = (b.minY - oy) / dy;
    const t2 = (b.maxY - oy) / dy;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  }
  if (tMax < Math.max(tMin, 0)) return Infinity;
  return Math.max(tMin, 0);
}

/**
 * Distance along a ray until it hits something that blocks sight — an opaque tile, or the
 * actual shape of tall furniture inside a tile — capped at `maxDist`.
 */
export function castRay(grid: Grid, origin: Vec2, angle: number, maxDist: number): number {
  let hit = maxDist;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  traverseRay(grid, origin, angle, maxDist, (col, row, t) => {
    if (t > 0 && grid.isOpaque(col, row)) {
      hit = Math.min(hit, t);
      return true;
    }
    for (const b of grid.opaqueBoxesAt(col, row)) {
      const tb = rayBoxDistance(origin.x, origin.y, dx, dy, b);
      if (tb < hit) hit = tb;
    }
    return hit < maxDist;
  });
  return hit;
}

export function hasLineOfSight(grid: Grid, from: Vec2, to: Vec2): boolean {
  const d = dist(from, to);
  if (d < 1e-6) return true;
  return castRay(grid, from, angleTo(from, to), d) >= d - 1e-6;
}

/**
 * Height-aware sight: walls and tall props always block; waist-high cover also blocks when the
 * target is crouching close behind it.
 */
export function lineOfSight(grid: Grid, from: Vec2, to: Vec2, targetCrouching: boolean): boolean {
  const d = dist(from, to);
  if (d < 1e-6) return true;
  const ts = grid.tileSize;
  const reach = BALANCE.npc.vision.coverReach;
  let blocked = false;
  traverseRay(grid, from, angleTo(from, to), d - 1e-6, (col, row, t) => {
    if (t <= 0) return false;
    if (grid.isOpaque(col, row)) return (blocked = true);
    if (targetCrouching && grid.isLowCover(col, row)) {
      const cx = (col + 0.5) * ts;
      const cy = (row + 0.5) * ts;
      if (Math.hypot(cx - to.x, cy - to.y) <= reach) return (blocked = true);
    }
    return false;
  });
  return !blocked;
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

export function canSee(grid: Grid, cone: ViewCone, target: Vec2, targetCrouching = false): boolean {
  return inCone(cone, target) && lineOfSight(grid, cone.pos, target, targetCrouching);
}

const EPS_ANGLE = 1e-4;
/** Angular step used to round off the arc where sight reaches max range. */
const ARC_STEP = (2.5 * Math.PI) / 180;

/**
 * Exact visibility outline around `origin`: rays are cast at every sight-blocking corner in
 * range (and just either side of it), so shadow edges line up with walls instead of stepping
 * between evenly spaced rays. Returns perimeter points ordered by angle; pass a `cone` to clip
 * to a field of view (the outline then runs from its left edge to its right edge).
 */
export function visibilityOutline(
  grid: Grid,
  corners: readonly Vec2[],
  origin: Vec2,
  range: number,
  cone?: { facing: number; fov: number },
): Vec2[] {
  const angles: number[] = [];
  const half = cone ? cone.fov / 2 : Math.PI;
  const base = cone ? cone.facing - half : -Math.PI;
  const span = cone ? cone.fov : Math.PI * 2;
  // Angles are stored relative to the start of the sweep so sorting gives a clean outline.
  const rel = (a: number) => {
    let r = (a - base) % (Math.PI * 2);
    if (r < 0) r += Math.PI * 2;
    return r;
  };

  const reach = range + grid.tileSize * 1.5;
  for (const c of corners) {
    const dx = c.x - origin.x;
    const dy = c.y - origin.y;
    if (dx * dx + dy * dy > reach * reach) continue;
    const r = rel(Math.atan2(dy, dx));
    for (const off of [-EPS_ANGLE, 0, EPS_ANGLE]) {
      const v = r + off;
      if (v >= 0 && v <= span) angles.push(v);
    }
  }
  const steps = Math.ceil(span / ARC_STEP);
  for (let i = 0; i <= steps; i++) angles.push((span * i) / steps);
  angles.sort((a, b) => a - b);

  const points: Vec2[] = [];
  let last = -1;
  for (const r of angles) {
    if (r - last < 1e-7) continue;
    last = r;
    const a = base + r;
    const d = castRay(grid, origin, a, range);
    points.push({ x: origin.x + Math.cos(a) * d, y: origin.y + Math.sin(a) * d });
  }
  return points;
}

/** Wall-clipped cone for rendering: [origin, ...outline]. */
export function visionPolygon(
  grid: Grid,
  corners: readonly Vec2[],
  cone: ViewCone,
  range = cone.range,
): Vec2[] {
  return [
    { ...cone.pos },
    ...visibilityOutline(grid, corners, cone.pos, range, { facing: cone.facing, fov: cone.fov }),
  ];
}
