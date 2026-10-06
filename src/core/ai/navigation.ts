import { tileCenter, worldToTile } from '../level/grid';
import type { TilePos, Vec2 } from '../model/types';
import { findPath, type Passable } from '../systems/pathfinding';
import { dist, turnToward } from '../util/math';

/** What an NPC needs to know about the map to move around. */
export interface NavContext {
  cols: number;
  rows: number;
  tileSize: number;
  passable: Passable;
}

export interface Walker {
  pos: Vec2;
  facing: number;
  path: TilePos[];
  pathIndex: number;
}

/**
 * The walkable tile nearest to `goal` (itself if walkable). NPCs can't stand inside a fixture's
 * tile, but they can walk right up to it.
 */
export function walkableNear(nav: NavContext, goal: TilePos, radius = 2): TilePos | null {
  if (nav.passable(goal.col, goal.row)) return goal;
  let best: TilePos | null = null;
  let bestD = Infinity;
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const c = goal.col + dc;
      const r = goal.row + dr;
      if (c < 0 || r < 0 || c >= nav.cols || r >= nav.rows || !nav.passable(c, r)) continue;
      const d = dc * dc + dr * dr;
      if (d < bestD) {
        bestD = d;
        best = { col: c, row: r };
      }
    }
  }
  return best;
}

export function setPathTo(walker: Walker, nav: NavContext, goal: TilePos): boolean {
  const start = worldToTile(nav.tileSize, walker.pos.x, walker.pos.y);
  const target = walkableNear(nav, goal);
  const path = target ? findPath(nav.cols, nav.rows, nav.passable, start, target) : null;
  walker.path = path ?? [];
  walker.pathIndex = 0;
  return path !== null;
}

export const pathDone = (walker: Walker) => walker.pathIndex >= walker.path.length;

/** Move toward a point; returns true once reached. Turns the walker to face its heading. */
export function moveToward(
  walker: Walker,
  target: Vec2,
  speed: number,
  dt: number,
  turnRate: number,
): boolean {
  const d = dist(walker.pos, target);
  const step = speed * dt;
  if (d > 0.01) {
    walker.facing = turnToward(
      walker.facing,
      Math.atan2(target.y - walker.pos.y, target.x - walker.pos.x),
      turnRate * dt,
    );
  }
  if (d <= step) {
    walker.pos = { ...target };
    return true;
  }
  walker.pos = {
    x: walker.pos.x + ((target.x - walker.pos.x) / d) * step,
    y: walker.pos.y + ((target.y - walker.pos.y) / d) * step,
  };
  return false;
}

/** Advance along the current path. Returns true when the path is finished. */
export function followPath(
  walker: Walker,
  nav: NavContext,
  speed: number,
  dt: number,
  turnRate: number,
): boolean {
  let remaining = dt;
  while (!pathDone(walker) && remaining > 0) {
    const tile = walker.path[walker.pathIndex]!;
    const target = tileCenter(nav.tileSize, tile.col, tile.row);
    const before = dist(walker.pos, target);
    const reached = moveToward(walker, target, speed, remaining, turnRate);
    if (!reached) return false;
    remaining -= speed > 0 ? before / speed : remaining;
    walker.pathIndex++;
  }
  return pathDone(walker);
}

/**
 * Detection meter shared by every observer: rises at `rate` (see systems/detection) while the
 * target is in view, decays otherwise.
 */
export function updateDetection(
  meter: number,
  sees: boolean,
  rate: number,
  decayRate: number,
  dt: number,
): number {
  const next = sees ? meter + rate * dt : meter - decayRate * dt;
  return Math.min(1, Math.max(0, next));
}
