import { BALANCE } from '../content/balance';
import { tileCenter, worldToTile } from '../level/grid';
import type { TilePos, Vec2 } from '../model/types';
import { angleTo, dist, inRange, turnToward } from '../util/math';
import type { Rng } from '../util/rng';
import {
  followPath,
  moveToward,
  pathDone,
  setPathTo,
  updateDetection,
  type NavContext,
  type Walker,
} from './navigation';

/**
 * - patrol: walking to the next place he's decided to check.
 * - inspect: standing in a room he dropped in on, looking around.
 * - suspicious: he's noticed you doing something; the meter is filling.
 * - chase: after you.
 * - investigate: heading to something (a report, a noise, a stripped fixture, where you vanished).
 * - search: checking hiding spots around there.
 * - guard: staking out the way to your van.
 */
export type BossMode =
  'patrol' | 'inspect' | 'suspicious' | 'chase' | 'investigate' | 'search' | 'guard';

/** Things that pull the boss away from his rounds, weakest first. */
export type StimulusKind = 'noise' | 'evidence' | 'report';
const PRIORITY: Record<StimulusKind, number> = { noise: 1, evidence: 2, report: 3 };

export interface Stimulus {
  kind: StimulusKind;
  pos: Vec2;
}

/** A place the boss can decide to go and check. */
export interface PatrolPoint {
  tile: TilePos;
  /** Room it belongs to (heat is tracked per room). */
  roomId: string | null;
  /** Direction to look around while inspecting (null: keep facing the way he walked in). */
  look: number | null;
}

/** A spot just inside an exit, facing back into the school (where he'd wait for you). */
export interface GuardSpot {
  tile: TilePos;
  look: number;
}

/** What he remembers: how much trouble each room has had, and when he last checked each spot. */
export interface BossMemory {
  heat: Map<string, number>;
  lastVisit: number[];
}

export interface BossState extends Walker {
  mode: BossMode;
  /** 0..1: at 1 the boss gives chase. */
  detection: number;
  lastKnown: Vec2 | null;
  /** Your velocity when last seen (px/s), so he can guess where you ran. */
  lastVel: Vec2;
  /** Mode countdown (inspect, look-around, guard) or time since last sighting (chase). */
  timer: number;
  repathTimer: number;
  /** Patrol point being walked to or inspected. */
  target: number;
  /** Hiding spots still to check while searching. */
  spots: Vec2[];
  /** Direction he sweeps his gaze around. */
  scanCenter: number;
  /** What he's responding to, so a weaker stimulus can't distract him from a stronger one. */
  focus: StimulusKind | null;
  /** You got away from him: he may stake out the exit afterwards. */
  escaped: boolean;
  memory: BossMemory;
}

export interface BossTuning {
  walkSpeed: number;
}

export interface BossContext {
  dt: number;
  /** Seconds since the shift started. */
  now: number;
  nav: NavContext;
  rng: Rng;
  points: readonly PatrolPoint[];
  guardSpots: readonly GuardSpot[];
  /** Tiles worth checking for someone hiding (next to cover, stalls, lockers…). */
  hideSpots: readonly TilePos[];
  roomAt(pos: Vec2): string | null;
  /** Player is visible AND suspicious this frame. */
  sees: boolean;
  /** Detection meter gain per second while `sees` (zone + light adjusted; see systems/detection). */
  rate: number;
  playerPos: Vec2;
  playerVel: Vec2;
  stimulus: Stimulus | null;
  speedMult: number;
  tuning: BossTuning;
  /** Detection meter drain per second while the player is out of view (default: balance). */
  decay?: number;
}

/** Something he'd say out loud (the UI picks the words). */
export type BossRemark =
  'huh' | 'spotted' | 'lost' | 'noise' | 'evidence' | 'report' | 'guard' | 'giveUp';

export interface BossResult {
  /** Boss physically reached the player while chasing. */
  caught: boolean;
  modeChanged: boolean;
  previousMode: BossMode;
  remark: BossRemark | null;
}

const B = BALANCE.boss;
const NPC = BALANCE.npc;

export function createBoss(
  start: TilePos,
  pointCount: number,
  tileSize: number,
  rng: Rng,
): BossState {
  return {
    pos: tileCenter(tileSize, start.col, start.row),
    facing: 0,
    path: [],
    pathIndex: 0,
    mode: 'patrol',
    detection: 0,
    lastKnown: null,
    lastVel: { x: 0, y: 0 },
    timer: 0,
    repathTimer: 0,
    target: -1,
    spots: [],
    scanCenter: 0,
    focus: null,
    escaped: false,
    // Pretend he checked everything at random times in the last minute, so rounds vary per shift.
    memory: {
      heat: new Map(),
      lastVisit: Array.from({ length: pointCount }, () => -rng.range(0, 60)),
    },
  };
}

function enter(boss: BossState, mode: BossMode) {
  boss.mode = mode;
  boss.timer = 0;
  boss.repathTimer = 0;
  boss.path = [];
  boss.pathIndex = 0;
  if (mode !== 'investigate' && mode !== 'search') boss.focus = null;
}

/** After catching (or excusing) the player the boss goes back to his rounds. */
export function sendBossBackToPatrol(boss: BossState) {
  enter(boss, 'patrol');
  boss.target = -1;
  boss.detection = 0;
  boss.lastKnown = null;
  boss.escaped = false;
}

/** Remember trouble in a room: he'll come back to check it more often. */
export function addHeat(memory: BossMemory, roomId: string | null, amount: number) {
  if (!roomId) return;
  memory.heat.set(roomId, (memory.heat.get(roomId) ?? 0) + amount);
}

export const heatOf = (memory: BossMemory, roomId: string | null) =>
  roomId ? (memory.heat.get(roomId) ?? 0) : 0;

/**
 * Where to go next. Every patrol point is weighted by how long since he checked it, how much
 * trouble its room has had, and how far away it is, then one is drawn at random. Rounds are
 * unpredictable, but a room you keep stripping gets a lot more attention.
 */
export function choosePatrolPoint(boss: BossState, ctx: BossContext): number {
  const { points, nav, now, rng } = ctx;
  if (points.length === 0) return -1;
  const weights = points.map((p, i) => {
    if (i === boss.target && points.length > 1) return 0;
    const stale = Math.min(150, now - (boss.memory.lastVisit[i] ?? 0));
    const heat = heatOf(boss.memory, p.roomId);
    const c = tileCenter(nav.tileSize, p.tile.col, p.tile.row);
    const tiles = dist(boss.pos, c) / nav.tileSize;
    return ((stale + 10) * (1 + 2 * heat)) / (1 + tiles / 20);
  });
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rng.next() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i]!;
    if (r <= 0 && weights[i]! > 0) return i;
  }
  return weights.findIndex((w) => w > 0);
}

/** Can this stimulus pull him off what he's doing? */
function canRespond(boss: BossState, kind: StimulusKind) {
  switch (boss.mode) {
    case 'patrol':
    case 'inspect':
    case 'guard':
      return true;
    case 'investigate':
    case 'search':
      return boss.focus === null || PRIORITY[kind] >= PRIORITY[boss.focus];
    default:
      return false;
  }
}

/** Walk along your last heading (stopping at walls) to guess where you went. */
function predict(from: Vec2, vel: Vec2, nav: NavContext): Vec2 {
  const speed = Math.hypot(vel.x, vel.y);
  if (speed < 1) return from;
  const steps = Math.ceil((speed * B.predictSeconds) / (nav.tileSize / 2));
  let best = from;
  for (let i = 1; i <= steps; i++) {
    const t = (i / steps) * B.predictSeconds;
    const p = { x: from.x + vel.x * t, y: from.y + vel.y * t };
    const tile = worldToTile(nav.tileSize, p.x, p.y);
    if (!nav.passable(tile.col, tile.row)) break;
    best = p;
  }
  return best;
}

/** Hiding spots near where he lost you, nearest first, spread apart. */
export function pickSearchSpots(center: Vec2, ctx: BossContext): Vec2[] {
  const ts = ctx.nav.tileSize;
  const radius = B.searchRadiusTiles * ts;
  const near = ctx.hideSpots
    .map((t) => tileCenter(ts, t.col, t.row))
    .filter((p) => {
      const d = dist(p, center);
      return d <= radius && d >= ts * 0.75;
    })
    // A little randomness so he doesn't check the same corners in the same order every time.
    .map((p) => ({ p, score: dist(p, center) * (0.75 + ctx.rng.next() * 0.5) }))
    .sort((a, b) => a.score - b.score);
  const out: Vec2[] = [];
  for (const { p } of near) {
    if (out.some((q) => dist(p, q) < ts * 2)) continue;
    out.push(p);
    if (out.length >= B.searchSpots) break;
  }
  return out;
}

function goTo(boss: BossState, nav: NavContext, target: Vec2) {
  return setPathTo(boss, nav, worldToTile(nav.tileSize, target.x, target.y));
}

/** Sweep the gaze side to side around `scanCenter` while the timer runs down. */
function lookAround(boss: BossState, dt: number, sweep = 2.4) {
  boss.timer -= dt;
  const want = boss.scanCenter + Math.sin(boss.timer * sweep) * 1.1;
  boss.facing = turnToward(boss.facing, want, NPC.turnRate * 0.6 * dt);
}

function startPatrol(boss: BossState, ctx: BossContext) {
  enter(boss, 'patrol');
  boss.target = choosePatrolPoint(boss, ctx);
  const p = ctx.points[boss.target];
  if (p && !setPathTo(boss, ctx.nav, p.tile)) {
    // Unreachable right now: count it as checked so he picks something else next time.
    boss.memory.lastVisit[boss.target] = ctx.now;
  }
}

function startSearch(boss: BossState, ctx: BossContext, center: Vec2) {
  enter(boss, 'search');
  boss.spots = pickSearchSpots(center, ctx);
  // Look around where he is first.
  boss.timer = B.lookSeconds;
  boss.scanCenter = boss.facing;
}

/** Done searching: maybe stake out the exit you'd use to reach the van, else back to rounds. */
function finishSearch(boss: BossState, ctx: BossContext): BossRemark | null {
  if (boss.escaped && ctx.guardSpots.length > 0 && ctx.rng.next() < B.guardChance) {
    boss.escaped = false;
    const spot = [...ctx.guardSpots].sort(
      (a, b) =>
        dist(boss.pos, tileCenter(ctx.nav.tileSize, a.tile.col, a.tile.row)) -
        dist(boss.pos, tileCenter(ctx.nav.tileSize, b.tile.col, b.tile.row)),
    )[0]!;
    enter(boss, 'guard');
    boss.scanCenter = spot.look;
    boss.timer = inRange(B.guardSeconds, ctx.rng.next());
    if (!setPathTo(boss, ctx.nav, spot.tile)) startPatrol(boss, ctx);
    return boss.mode === 'guard' ? 'guard' : null;
  }
  const gaveUp = boss.escaped;
  boss.escaped = false;
  startPatrol(boss, ctx);
  return gaveUp ? 'giveUp' : null;
}

/**
 * Mr. Gravy's brain. He plans his own rounds (see `choosePatrolPoint`), drops in on rooms and
 * looks around, reacts to reports, noises and stripped fixtures, chases what he sees, guesses
 * where you ran when he loses you, checks hiding spots, and sometimes waits by the exit.
 * Mutates `boss` in place.
 */
export function updateBoss(boss: BossState, ctx: BossContext): BossResult {
  const { dt, nav, tuning } = ctx;
  const previousMode = boss.mode;
  const walk = tuning.walkSpeed * ctx.speedMult;
  const turn = NPC.turnRate;
  let caught = false;
  let remark: BossRemark | null = null;

  // Trouble fades from memory.
  const fade = Math.exp(-dt / B.heatDecaySeconds);
  for (const [room, h] of boss.memory.heat) boss.memory.heat.set(room, h * fade);

  boss.detection = updateDetection(
    boss.detection,
    ctx.sees,
    ctx.rate,
    ctx.decay ?? NPC.vision.decayRate,
    dt,
  );
  if (ctx.sees) {
    boss.lastKnown = { ...ctx.playerPos };
    boss.lastVel = { ...ctx.playerVel };
  }

  // Seeing you beats everything else.
  if (ctx.sees && boss.mode !== 'chase' && boss.mode !== 'suspicious') {
    enter(boss, 'suspicious');
    remark = 'huh';
    addHeat(boss.memory, ctx.roomAt(ctx.playerPos), B.heat.sighting);
  } else if (ctx.stimulus && canRespond(boss, ctx.stimulus.kind)) {
    const s = ctx.stimulus;
    enter(boss, 'investigate');
    boss.focus = s.kind;
    boss.lastKnown = { ...s.pos };
    addHeat(boss.memory, ctx.roomAt(s.pos), B.heat[s.kind]);
    remark = s.kind;
  }

  switch (boss.mode) {
    case 'patrol': {
      if (boss.target < 0 || boss.target >= ctx.points.length) {
        startPatrol(boss, ctx);
        if (boss.target < 0) break;
      }
      if (followPath(boss, nav, walk, dt, turn)) {
        const p = ctx.points[boss.target];
        boss.memory.lastVisit[boss.target] = ctx.now;
        enter(boss, 'inspect');
        const heat = heatOf(boss.memory, p?.roomId ?? null);
        boss.timer = inRange(B.inspectSeconds, ctx.rng.next()) * (1 + Math.min(1, heat * 0.5));
        boss.scanCenter = p?.look ?? boss.facing;
      }
      break;
    }
    case 'inspect': {
      lookAround(boss, dt);
      if (boss.timer <= 0) startPatrol(boss, ctx);
      break;
    }
    case 'suspicious': {
      if (boss.lastKnown) {
        boss.facing = turnToward(boss.facing, angleTo(boss.pos, boss.lastKnown), turn * dt);
      }
      if (boss.detection >= 1) {
        enter(boss, 'chase');
        remark = 'spotted';
      } else if (!ctx.sees && boss.detection <= 0 && boss.lastKnown) {
        // Not sure what he saw, so he goes and has a look instead of shrugging it off.
        enter(boss, 'investigate');
        boss.focus = 'evidence';
      }
      break;
    }
    case 'chase': {
      boss.timer = ctx.sees ? 0 : boss.timer + dt;
      if (boss.timer > B.loseSightSeconds && boss.lastKnown) {
        const guess = predict(boss.lastKnown, boss.lastVel, nav);
        addHeat(boss.memory, ctx.roomAt(boss.lastKnown), B.heat.escape);
        enter(boss, 'investigate');
        boss.focus = 'report';
        boss.lastKnown = guess;
        boss.escaped = true;
        remark = 'lost';
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
          goTo(boss, nav, target);
        }
        if (pathDone(boss)) moveToward(boss, target, speed, dt, turn);
        else followPath(boss, nav, speed, dt, turn);
      }
      caught = dist(boss.pos, ctx.playerPos) <= NPC.catchRadius;
      break;
    }
    case 'investigate': {
      const target = boss.lastKnown;
      if (!target) {
        startPatrol(boss, ctx);
        break;
      }
      if (boss.path.length === 0 && !goTo(boss, nav, target)) {
        startSearch(boss, ctx, boss.pos);
        break;
      }
      const hurry =
        boss.focus === 'report' ? B.reportMult : boss.focus === 'noise' ? 1 : B.investigateMult;
      if (followPath(boss, nav, walk * hurry, dt, turn)) startSearch(boss, ctx, target);
      break;
    }
    case 'search': {
      if (boss.timer > 0) {
        lookAround(boss, dt);
        break;
      }
      if (!pathDone(boss)) {
        if (followPath(boss, nav, walk, dt, turn)) {
          boss.timer = B.lookSeconds;
          boss.scanCenter = boss.facing;
        }
        break;
      }
      const next = boss.spots.shift();
      if (next) {
        if (!goTo(boss, nav, next)) boss.path = [];
        break;
      }
      remark = finishSearch(boss, ctx);
      break;
    }
    case 'guard': {
      if (!pathDone(boss)) {
        followPath(boss, nav, walk, dt, turn);
        break;
      }
      lookAround(boss, dt, 1.2);
      if (boss.timer <= 0) startPatrol(boss, ctx);
      break;
    }
  }

  return { caught, modeChanged: boss.mode !== previousMode, previousMode, remark };
}
