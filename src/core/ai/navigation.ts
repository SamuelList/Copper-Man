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

export function setPathTo(walker: Walker, nav: NavContext, goal: TilePos): boolean {
  const start = worldToTile(nav.tileSize, walker.pos.x, walker.pos.y);
  const path = findPath(nav.cols, nav.rows, nav.passable, start, goal);
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
