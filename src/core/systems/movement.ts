import { BALANCE } from '../content/balance';
import type { Grid } from '../level/grid';
import type { Box, Vec2 } from '../model/types';

const PUSH_ITERATIONS = 4;
const SKIN = 0.01;
const ASSIST_COS = Math.cos((BALANCE.player.slideAssistDegrees * Math.PI) / 180);

interface Contact {
  x: number;
  y: number;
  /** Unit normal pointing away from what we hit, or null if nothing was touched. */
  nx: number;
  ny: number;
  hit: boolean;
}

/** Push a circle out of one box. Returns true if it overlapped. */
function pushOut(b: Box, c: Contact, r: number): boolean {
  const qx = Math.max(b.minX, Math.min(c.x, b.maxX));
  const qy = Math.max(b.minY, Math.min(c.y, b.maxY));
  let dx = c.x - qx;
  let dy = c.y - qy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  let d = Math.sqrt(d2);
  if (d < 1e-6) {
    // Centre is inside the box: leave along the shallowest side.
    const left = c.x - b.minX;
    const right = b.maxX - c.x;
    const up = c.y - b.minY;
    const down = b.maxY - c.y;
    const m = Math.min(left, right, up, down);
    if (m === left) [dx, dy, d] = [-1, 0, left];
    else if (m === right) [dx, dy, d] = [1, 0, right];
    else if (m === up) [dx, dy, d] = [0, -1, up];
    else [dx, dy, d] = [0, 1, down];
    c.x += dx * (d + r + SKIN);
    c.y += dy * (d + r + SKIN);
  } else {
    dx /= d;
    dy /= d;
    c.x += dx * (r - d + SKIN);
    c.y += dy * (r - d + SKIN);
  }
  c.nx += dx;
  c.ny += dy;
  c.hit = true;
  return true;
}

const scratch: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

/** Resolve a circle against whole-tile blockers and object hitboxes around it. */
function resolve(grid: Grid, x: number, y: number, r: number): Contact {
  const c: Contact = { x, y, nx: 0, ny: 0, hit: false };
  const ts = grid.tileSize;
  for (let iter = 0; iter < PUSH_ITERATIONS; iter++) {
    let moved = false;
    const c0 = Math.floor((c.x - r) / ts);
    const c1 = Math.floor((c.x + r) / ts);
    const r0 = Math.floor((c.y - r) / ts);
    const r1 = Math.floor((c.y + r) / ts);
    for (let row = r0; row <= r1; row++) {
      for (let col = c0; col <= c1; col++) {
        if (grid.isSolid(col, row)) {
          scratch.minX = col * ts;
          scratch.minY = row * ts;
          scratch.maxX = scratch.minX + ts;
          scratch.maxY = scratch.minY + ts;
          moved = pushOut(scratch, c, r) || moved;
          continue;
        }
        for (const b of grid.solidBoxesAt(col, row)) moved = pushOut(b, c, r) || moved;
      }
    }
    if (!moved) break;
  }
  const n = Math.hypot(c.nx, c.ny);
  if (n > 1e-9) {
    c.nx /= n;
    c.ny /= n;
  }
  return c;
}

/**
 * Move a round body (radius `r`) by (dx, dy), sliding smoothly around walls and furniture.
 *
 * Pushing into a wall at a shallow angle (within BALANCE.player.slideAssistDegrees) carries you
 * along it at full speed, so running down a hallway with a diagonal key never feels sticky.
 * Sub-steps keep fast movement from tunnelling through thin objects.
 */
export function moveWithCollision(
  grid: Grid,
  pos: Vec2,
  r: number,
  dx: number,
  dy: number,
  slideAssist = true,
): Vec2 {
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return pos;
  const steps = Math.max(1, Math.ceil(len / (r * 0.5)));
  const sx = dx / steps;
  const sy = dy / steps;
  const stepLen = len / steps;
  let x = pos.x;
  let y = pos.y;
  for (let i = 0; i < steps; i++) {
    let c = resolve(grid, x + sx, y + sy, r);
    if (slideAssist && c.hit) {
      // Slide along the surface; if we were mostly moving along it, keep full speed.
      const into = sx * c.nx + sy * c.ny;
      if (into < 0) {
        const tx = sx - into * c.nx;
        const ty = sy - into * c.ny;
        const tLen = Math.hypot(tx, ty);
        if (tLen > 1e-9 && tLen / stepLen >= ASSIST_COS) {
          c = resolve(grid, x + (tx / tLen) * stepLen, y + (ty / tLen) * stepLen, r);
        }
      }
    }
    x = c.x;
    y = c.y;
  }
  return { x, y };
}

/**
 * A short sidestep around an object that's wedged against a wall (e.g. a drinking fountain).
 * Unit direction, distance left, and the input direction it was planned for.
 */
export interface Detour {
  x: number;
  y: number;
  remaining: number;
  forX: number;
  forY: number;
}

const DETOUR_KEEP_COS = Math.cos(Math.PI / 4);
/** Only detour when the input runs at least this much along the blocking face (going past it). */
const DETOUR_MIN_ALONG = 0.3;

/** The object hitbox the body would push into when stepping along (ux, uy), if any. */
function blockingBox(grid: Grid, x: number, y: number, r: number, ux: number, uy: number) {
  const ts = grid.tileSize;
  const px = x + ux * r * 0.6;
  const py = y + uy * r * 0.6;
  let best: Box | null = null;
  let bestPen = 0;
  for (let row = Math.floor((py - r) / ts); row <= Math.floor((py + r) / ts); row++) {
    for (let col = Math.floor((px - r) / ts); col <= Math.floor((px + r) / ts); col++) {
      for (const b of grid.solidBoxesAt(col, row)) {
        const qx = Math.max(b.minX, Math.min(px, b.maxX));
        const qy = Math.max(b.minY, Math.min(py, b.maxY));
        const pen = r - Math.hypot(px - qx, py - qy);
        if (pen > bestPen) {
          bestPen = pen;
          best = b;
        }
      }
    }
  }
  return best;
}

/**
 * Player movement: wall sliding plus a little steering. If you're trying to run past an object
 * that's wedged against a wall and you'd otherwise be stuck in the corner, take a short detour
 * around its free end, then carry on. Walking straight into an object still just stops you.
 */
export function steerMove(
  grid: Grid,
  pos: Vec2,
  r: number,
  dx: number,
  dy: number,
  detour: Detour | null,
): { pos: Vec2; detour: Detour | null } {
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return { pos, detour: null };
  const ux = dx / len;
  const uy = dy / len;
  if (detour && ux * detour.forX + uy * detour.forY < DETOUR_KEEP_COS) detour = null;

  if (detour) {
    const step = Math.min(len, detour.remaining);
    const next = moveWithCollision(grid, pos, r, detour.x * step, detour.y * step, false);
    const moved = Math.hypot(next.x - pos.x, next.y - pos.y);
    if (moved >= step * 0.5) {
      const remaining = detour.remaining - moved;
      return { pos: next, detour: remaining > 0.5 ? { ...detour, remaining } : null };
    }
  }

  const next = moveWithCollision(grid, pos, r, dx, dy, true);
  const progress = (next.x - pos.x) * ux + (next.y - pos.y) * uy;
  if (progress >= len * 0.35) return { pos: next, detour: null };

  const box = blockingBox(grid, pos.x, pos.y, r, ux, uy);
  if (!box) return { pos: next, detour: null };
  // Which face are we against? Its tangents are the two ways around.
  const qx = Math.max(box.minX, Math.min(pos.x, box.maxX));
  const qy = Math.max(box.minY, Math.min(pos.y, box.maxY));
  const verticalFace = Math.abs(pos.x - qx) >= Math.abs(pos.y - qy);
  const options = verticalFace
    ? [
        { x: 0, y: -1, dist: pos.y - (box.minY - r) + 1 },
        { x: 0, y: 1, dist: box.maxY + r - pos.y + 1 },
      ]
    : [
        { x: -1, y: 0, dist: pos.x - (box.minX - r) + 1 },
        { x: 1, y: 0, dist: box.maxX + r - pos.x + 1 },
      ];
  if (Math.abs(options[0]!.x * ux + options[0]!.y * uy) < DETOUR_MIN_ALONG) {
    return { pos: next, detour: null }; // heading straight into it: just stop
  }
  options.sort((a, b) => b.x * ux + b.y * uy - (a.x * ux + a.y * uy));
  for (const o of options) {
    const step = Math.min(len, o.dist);
    const probe = moveWithCollision(grid, pos, r, o.x * step, o.y * step, false);
    const moved = Math.hypot(probe.x - pos.x, probe.y - pos.y);
    if (moved >= step * 0.5) {
      const remaining = o.dist - moved;
      return {
        pos: probe,
        detour: remaining > 0.5 ? { x: o.x, y: o.y, remaining, forX: ux, forY: uy } : null,
      };
    }
  }
  return { pos: next, detour: null };
}
