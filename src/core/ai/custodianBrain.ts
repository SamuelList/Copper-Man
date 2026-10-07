import { BALANCE } from '../content/balance';
import { tileCenter, worldToTile } from '../level/grid';
import type { TilePos, Vec2 } from '../model/types';
import { angleTo, inRange, turnToward } from '../util/math';
import type { Rng } from '../util/rng';
import { followPath, setPathTo, updateDetection, type NavContext, type Walker } from './navigation';

/**
 * - walk: heading somewhere (`next` says what he'll do there).
 * - mop: mopping a spot in the room he's cleaning.
 * - refill: back in his closet, wringing out the mop.
 * - inspect: kneeling at a stripped fixture, working out what happened.
 * - radio: calling Mr. Gravy.
 * - suspicious: watching someone who looks like they're taking things apart.
 */
export type CustodianMode = 'walk' | 'mop' | 'refill' | 'inspect' | 'radio' | 'suspicious';

/** A room on his cleaning schedule and the spots he mops in it. */
export interface CleaningJob {
  roomId: string;
  spots: TilePos[];
}

/** A stripped fixture he's noticed. `fresh`: stripped moments ago. */
export interface Sighting {
  id: string;
  pos: Vec2;
  fresh: boolean;
}

export interface CustodianState extends Walker {
  mode: CustodianMode;
  next: 'mop' | 'refill' | 'inspect';
  /** Rooms in the order he'll clean them this shift (indices into the job list). */
  order: number[];
  /** Position in `order`. */
  step: number;
  spot: number;
  /** Seconds left on the current room (0: not started). */
  jobTimer: number;
  /** Mode countdown: this mop spot, the refill, the inspection, the radio call. */
  timer: number;
  jobsSinceRefill: number;
  detection: number;
  /** Seconds until he can call in another report. */
  cooldown: number;
  /** Stripped fixtures found this shift: each one makes him likelier to call it in. */
  finds: number;
  inspecting: Sighting | null;
  /** Fixture ids he's already looked at (forgotten once they're fixed). */
  known: Set<string>;
  focusPos: Vec2 | null;
}

export interface CustodianContext {
  dt: number;
  nav: NavContext;
  rng: Rng;
  jobs: readonly CleaningJob[];
  home: TilePos;
  /** The player is visible and scrapping. */
  sees: boolean;
  rate: number;
  decay?: number;
  playerPos: Vec2;
  /** A stripped fixture he can see right now. */
  spotted: Sighting | null;
}

export type CustodianEvent =
  | { kind: 'inspecting'; fixtureId: string }
  | { kind: 'report'; about: 'fixture' | 'player'; pos: Vec2; fixtureId?: string }
  | { kind: 'shrug'; fixtureId: string };

const C = BALANCE.custodian;
const NPC = BALANCE.npc;

export function createCustodian(
  home: TilePos,
  jobCount: number,
  tileSize: number,
  rng: Rng,
): CustodianState {
  // His schedule this shift: every room once, in a shuffled order.
  const order = Array.from({ length: jobCount }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [order[i], order[j]] = [order[j]!, order[i]!];
  }
  return {
    pos: tileCenter(tileSize, home.col, home.row),
    facing: 0,
    path: [],
    pathIndex: 0,
    mode: 'refill',
    next: 'mop',
    order,
    step: -1,
    spot: 0,
    jobTimer: 0,
    timer: 1.5,
    jobsSinceRefill: 0,
    detection: 0,
    cooldown: 0,
    finds: 0,
    inspecting: null,
    known: new Set(),
    focusPos: null,
  };
}

/** Is he pushing a mop right now (mopping a spot or moving between spots)? */
export const isMopping = (c: CustodianState) =>
  c.mode === 'mop' || (c.mode === 'walk' && c.next === 'mop' && c.jobTimer > 0);

const currentJob = (c: CustodianState, jobs: readonly CleaningJob[]) => jobs[c.order[c.step] ?? -1];

function walkTo(c: CustodianState, nav: NavContext, tile: TilePos, next: CustodianState['next']) {
  if (!setPathTo(c, nav, tile)) return false;
  c.mode = 'walk';
  c.next = next;
  return true;
}

/** On to the next room on the schedule (via the closet every few rooms). */
function nextJob(c: CustodianState, ctx: CustodianContext) {
  c.jobTimer = 0;
  c.spot = 0;
  if (c.jobsSinceRefill >= C.refillEvery && walkTo(c, ctx.nav, ctx.home, 'refill')) return;
  for (let tries = 0; tries < ctx.jobs.length; tries++) {
    c.step = (c.step + 1) % Math.max(1, c.order.length);
    const job = currentJob(c, ctx.jobs);
    if (job?.spots[0] && walkTo(c, ctx.nav, job.spots[0], 'mop')) return;
  }
  c.mode = 'refill';
  c.timer = C.refillSeconds;
}

/** Back to the room he was cleaning, or on to the next one. */
function resume(c: CustodianState, ctx: CustodianContext) {
  c.inspecting = null;
  const spot = currentJob(c, ctx.jobs)?.spots[c.spot];
  if (c.jobTimer > 0 && spot && walkTo(c, ctx.nav, spot, 'mop')) return;
  nextJob(c, ctx);
}

/**
 * The head custodian's day: work through the rooms on his schedule, mopping a few spots in
 * each, with trips back to his closet. He notices stripped fixtures as he goes, kneels to look,
 * and may radio Mr. Gravy (always, if it's fresh; more likely the more he finds). He also calls
 * in anyone he catches taking things apart.
 */
export function updateCustodian(c: CustodianState, ctx: CustodianContext): CustodianEvent | null {
  const { dt, nav, rng } = ctx;
  c.cooldown = Math.max(0, c.cooldown - dt);
  const busy = c.mode === 'radio' || c.mode === 'inspect';
  const canNotice = ctx.sees && c.cooldown <= 0 && !busy;
  c.detection = updateDetection(
    c.detection,
    canNotice,
    ctx.rate,
    ctx.decay ?? NPC.vision.decayRate,
    dt,
  );

  if (canNotice) {
    c.focusPos = { ...ctx.playerPos };
    if (c.detection >= 1) {
      c.detection = 0;
      c.cooldown = C.reportCooldownSeconds;
      c.mode = 'radio';
      c.timer = C.radioSeconds;
      c.path = [];
      c.pathIndex = 0;
      return { kind: 'report', about: 'player', pos: { ...ctx.playerPos } };
    }
    if (c.mode !== 'suspicious') {
      c.mode = 'suspicious';
      c.path = [];
      c.pathIndex = 0;
    }
  } else if (
    ctx.spotted &&
    !c.known.has(ctx.spotted.id) &&
    !c.inspecting &&
    !busy &&
    c.mode !== 'suspicious'
  ) {
    // Something's not right with that fixture: go and have a look.
    c.known.add(ctx.spotted.id);
    c.inspecting = ctx.spotted;
    if (
      !walkTo(c, nav, worldToTile(nav.tileSize, ctx.spotted.pos.x, ctx.spotted.pos.y), 'inspect')
    ) {
      c.mode = 'inspect';
      c.timer = C.inspectSeconds;
    }
  }

  switch (c.mode) {
    case 'walk': {
      const speed = isMopping(c) ? C.mopSpeed : C.walkSpeed;
      if (!followPath(c, nav, speed, dt, NPC.turnRate)) break;
      if (c.next === 'refill') {
        c.mode = 'refill';
        c.timer = C.refillSeconds;
      } else if (c.next === 'inspect') {
        c.mode = 'inspect';
        c.timer = C.inspectSeconds;
        if (c.inspecting) return { kind: 'inspecting', fixtureId: c.inspecting.id };
      } else {
        if (c.jobTimer <= 0) c.jobTimer = inRange(C.jobSeconds, rng.next());
        c.mode = 'mop';
        c.timer = inRange(C.mopSpotSeconds, rng.next());
      }
      break;
    }
    case 'mop': {
      c.timer -= dt;
      c.jobTimer -= dt;
      // Swing the mop side to side.
      c.facing += Math.sin(c.timer * 5) * 2 * dt;
      if (c.jobTimer <= 0) {
        c.jobsSinceRefill++;
        nextJob(c, ctx);
      } else if (c.timer <= 0) {
        const spots = currentJob(c, ctx.jobs)?.spots ?? [];
        c.spot = (c.spot + 1) % Math.max(1, spots.length);
        const spot = spots[c.spot];
        if (!spot || !walkTo(c, nav, spot, 'mop')) c.timer = inRange(C.mopSpotSeconds, rng.next());
      }
      break;
    }
    case 'refill':
      c.timer -= dt;
      if (c.timer <= 0) {
        c.jobsSinceRefill = 0;
        nextJob(c, ctx);
      }
      break;
    case 'inspect': {
      c.timer -= dt;
      const seen = c.inspecting;
      if (seen) c.facing = turnToward(c.facing, angleTo(c.pos, seen.pos), NPC.turnRate * dt);
      if (c.timer > 0 || !seen) {
        if (!seen) resume(c, ctx);
        break;
      }
      c.finds++;
      const chance = C.reportChance + C.reportChancePerFind * (c.finds - 1);
      if (c.cooldown <= 0 && (seen.fresh || rng.next() < chance)) {
        c.mode = 'radio';
        c.timer = C.radioSeconds;
        c.cooldown = C.reportCooldownSeconds;
        c.inspecting = null;
        return { kind: 'report', about: 'fixture', pos: { ...seen.pos }, fixtureId: seen.id };
      }
      resume(c, ctx);
      return { kind: 'shrug', fixtureId: seen.id };
    }
    case 'radio':
      c.timer -= dt;
      if (c.focusPos)
        c.facing = turnToward(c.facing, angleTo(c.pos, c.focusPos), NPC.turnRate * dt);
      if (c.timer <= 0) resume(c, ctx);
      break;
    case 'suspicious':
      if (c.focusPos)
        c.facing = turnToward(c.facing, angleTo(c.pos, c.focusPos), NPC.turnRate * dt);
      if (!ctx.sees && c.detection <= 0) resume(c, ctx);
      break;
  }
  return null;
}
