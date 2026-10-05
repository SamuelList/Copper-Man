import { BALANCE } from '../content/balance';
import { tileCenter, worldToTile } from '../level/grid';
import type { TilePos, Vec2 } from '../model/types';
import { angleTo, dist, turnToward } from '../util/math';
import {
  followPath,
  moveToward,
  pathDone,
  setPathTo,
  updateDetection,
  type NavContext,
  type Walker,
} from './navigation';

export type BossMode = 'patrol' | 'suspicious' | 'chase' | 'investigate' | 'search' | 'return';

export interface BossState extends Walker {
  mode: BossMode;
  /** 0..1 — at 1 the boss gives chase. */
  detection: number;
  routeIndex: number;
  lastKnown: Vec2 | null;
  /** Mode-specific countdown (search) or count-up (time since last sighting while chasing). */
  timer: number;
  repathTimer: number;
}

export interface BossTuning {
  walkSpeed: number;
  range: number;
  fillRate: number;
}

export interface BossContext {
  dt: number;
  nav: NavContext;
  route: readonly TilePos[];
  /** Player is visible AND suspicious this frame. */
  sees: boolean;
  playerPos: Vec2;
  /** A student shouted this frame. */
  alert: Vec2 | null;
  speedMult: number;
  tuning: BossTuning;
}

export interface BossResult {
  /** Boss physically reached the player while chasing. */
  caught: boolean;
  modeChanged: boolean;
  previousMode: BossMode;
}

const B = BALANCE.boss;
const NPC = BALANCE.npc;

export function createBoss(route: readonly TilePos[], tileSize: number): BossState {
  const start = route[0] ?? { col: 0, row: 0 };
  return {
    pos: tileCenter(tileSize, start.col, start.row),
    facing: 0,
    path: [],
    pathIndex: 0,
    mode: 'patrol',
    detection: 0,
    routeIndex: 0,
    lastKnown: null,
    timer: 0,
    repathTimer: 0,
  };
}

function nearestWaypoint(boss: BossState, route: readonly TilePos[], tileSize: number): number {
  let best = 0;
  let bestD = Infinity;
  route.forEach((wp, i) => {
    const d = dist(boss.pos, tileCenter(tileSize, wp.col, wp.row));
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

function enter(boss: BossState, mode: BossMode) {
  boss.mode = mode;
  boss.timer = 0;
  boss.repathTimer = 0;
  boss.path = [];
  boss.pathIndex = 0;
}

/** After catching (or excusing) the player the boss walks back to the patrol route. */
export function sendBossBackToPatrol(boss: BossState) {
  enter(boss, 'return');
  boss.detection = 0;
  boss.lastKnown = null;
}

/**
 * Boss state machine: patrol → suspicious → chase → (lose sight) investigate → search → return.
 * Student alerts trigger an investigation. Mutates `boss` in place.
 */
export function updateBoss(boss: BossState, ctx: BossContext): BossResult {
  const { dt, nav, tuning } = ctx;
  const previousMode = boss.mode;
  const walk = tuning.walkSpeed * ctx.speedMult;
  const turn = NPC.turnRate;
  const playerDist = dist(boss.pos, ctx.playerPos);
  let caught = false;

  boss.detection = updateDetection(
    boss.detection,
    ctx.sees,
    playerDist,
    tuning.range,
    tuning.fillRate,
    NPC.vision.decayRate,
    dt,
  );
  if (ctx.sees) boss.lastKnown = { ...ctx.playerPos };

  switch (boss.mode) {
    case 'patrol': {
      if (ctx.sees) {
        enter(boss, 'suspicious');
        break;
      }
      if (ctx.alert) {
        boss.lastKnown = { ...ctx.alert };
        enter(boss, 'investigate');
        break;
      }
      if (pathDone(boss)) {
        boss.routeIndex = (boss.routeIndex + 1) % Math.max(1, ctx.route.length);
        const wp = ctx.route[boss.routeIndex];
        if (wp) setPathTo(boss, nav, wp);
      }
      followPath(boss, nav, walk, dt, turn);
      break;
    }
    case 'suspicious': {
      if (boss.lastKnown)
        boss.facing = turnToward(boss.facing, angleTo(boss.pos, boss.lastKnown), turn * dt);
      if (boss.detection >= 1) enter(boss, 'chase');
      else if (!ctx.sees && boss.detection <= 0) enter(boss, 'return');
      break;
    }
    case 'chase': {
      boss.timer = ctx.sees ? 0 : boss.timer + dt;
      if (boss.timer > B.loseSightSeconds) {
        enter(boss, 'investigate');
        break;
      }
      const speed = walk * B.chaseMult;
      const target = ctx.sees ? ctx.playerPos : boss.lastKnown;
      if (target && ctx.sees && dist(boss.pos, target) < nav.tileSize * 1.5) {
        moveToward(boss, target, speed, dt, turn);
      } else if (target) {
        boss.repathTimer -= dt;
        if (boss.repathTimer <= 0 || pathDone(boss)) {
          boss.repathTimer = B.repathSeconds;
          setPathTo(boss, nav, worldToTile(nav.tileSize, target.x, target.y));
        }
        if (pathDone(boss)) moveToward(boss, target, speed, dt, turn);
        else followPath(boss, nav, speed, dt, turn);
      }
      caught = dist(boss.pos, ctx.playerPos) <= NPC.catchRadius;
      break;
    }
    case 'investigate': {
      if (ctx.sees) {
        enter(boss, 'suspicious');
        break;
      }
      const target = boss.lastKnown;
      if (!target) {
        enter(boss, 'return');
        break;
      }
      if (
        boss.path.length === 0 &&
        !setPathTo(boss, nav, worldToTile(nav.tileSize, target.x, target.y))
      ) {
        enter(boss, 'search');
        boss.timer = B.searchSeconds;
        break;
      }
      if (followPath(boss, nav, walk * B.investigateMult, dt, turn)) {
        enter(boss, 'search');
        boss.timer = B.searchSeconds;
      }
      break;
    }
    case 'search': {
      if (ctx.sees) {
        enter(boss, 'suspicious');
        break;
      }
      boss.facing += turn * 0.35 * dt;
      boss.timer -= dt;
      if (boss.timer <= 0) enter(boss, 'return');
      break;
    }
    case 'return': {
      if (ctx.sees) {
        enter(boss, 'suspicious');
        break;
      }
      if (ctx.alert) {
        boss.lastKnown = { ...ctx.alert };
        enter(boss, 'investigate');
        break;
      }
      if (boss.path.length === 0) {
        boss.routeIndex = nearestWaypoint(boss, ctx.route, nav.tileSize);
        const wp = ctx.route[boss.routeIndex];
        if (!wp || !setPathTo(boss, nav, wp) || boss.path.length === 0) {
          enter(boss, 'patrol');
          break;
        }
      }
      if (followPath(boss, nav, walk, dt, turn)) enter(boss, 'patrol');
      break;
    }
  }

  return { caught, modeChanged: boss.mode !== previousMode, previousMode };
}
