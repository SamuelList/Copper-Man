import { BALANCE } from '../content/balance';
import { PERSONALITIES } from '../content/npcs';
import { tileCenter } from '../level/grid';
import type { TileRect } from '../level/types';
import type { PersonalityDef, TilePos, Vec2 } from '../model/types';
import { angleTo, inRange, turnToward } from '../util/math';
import type { Rng } from '../util/rng';
import { followPath, setPathTo, updateDetection, type NavContext, type Walker } from './navigation';

export type StudentMode = 'idle' | 'wander' | 'alarmed' | 'asleep';

export interface StudentState extends Walker {
  id: string;
  personality: PersonalityDef;
  mode: StudentMode;
  detection: number;
  timer: number;
  /** Seconds until this student can raise another alert. */
  cooldown: number;
  /** Area the student wanders in (their room, a little more for roamers, a little less for stay-puts). */
  area: TileRect;
  /** Dozers: seconds until they wake up or nod off again. */
  dozeTimer: number;
}

export interface StudentTuning {
  walkSpeed: number;
}

export interface StudentContext {
  dt: number;
  nav: NavContext;
  /** Player is visible AND doing something this student would snitch on. */
  sees: boolean;
  /** Detection meter gain per second while `sees`. */
  rate: number;
  /** Detection meter drain per second when not seeing (default: balance). */
  decay?: number;
  playerPos: Vec2;
  rng: Rng;
  tuning: StudentTuning;
}

/** What a student did this frame when their meter filled. */
export type StudentOutcome = 'snitch' | 'laugh' | null;

const S = BALANCE.student;
const NPC = BALANCE.npc;

/** The area a personality wanders: tight around their seat, their room, or out into the halls. */
function wanderArea(p: PersonalityDef, spawn: TilePos, room: TileRect): TileRect {
  if (p.wander === 'stay') return { col: spawn.col - 1, row: spawn.row - 1, w: 3, h: 3 };
  if (p.wander === 'room') return room;
  const r = S.roamTiles;
  return { col: room.col - r, row: room.row - r, w: room.w + r * 2, h: room.h + r * 2 };
}

export function createStudent(
  id: string,
  spawn: TilePos,
  room: TileRect,
  tileSize: number,
  rng: Rng,
  personality: PersonalityDef = PERSONALITIES.get('regular'),
): StudentState {
  return {
    id,
    personality,
    pos: tileCenter(tileSize, spawn.col, spawn.row),
    facing: rng.range(-Math.PI, Math.PI),
    path: [],
    pathIndex: 0,
    mode: 'idle',
    detection: 0,
    timer: inRange(personality.idleSeconds, rng.next()),
    cooldown: 0,
    area: wanderArea(personality, spawn, room),
    // Dozers start somewhere random in their sleep cycle.
    dozeTimer: rng.range(0, S.dozeCycleSeconds),
  };
}

/** Pick a student personality at random, weighted by how common each is. */
export function rollPersonality(rng: Rng): PersonalityDef {
  const all = PERSONALITIES.all;
  let r = rng.next() * all.reduce((sum, p) => sum + p.weight, 0);
  for (const p of all) {
    r -= p.weight;
    if (r <= 0) return p;
  }
  return all[0]!;
}

/** Can this student see anything right now? (Dozers are blind while asleep.) */
export const isAwake = (s: StudentState) => s.mode !== 'asleep';

function pickWanderTarget(student: StudentState, nav: NavContext, rng: Rng): TilePos | null {
  const { col, row, w, h } = student.area;
  for (let i = 0; i < 20; i++) {
    const t = { col: rng.int(col, col + w - 1), row: rng.int(row, row + h - 1) };
    if (nav.passable(t.col, t.row)) return t;
  }
  return null;
}

/** Dozers drift between sleeping and (groggily) awake. */
function updateDoze(student: StudentState, dt: number, rng: Rng) {
  const awake = student.personality.awakeFraction;
  if (awake === undefined) return;
  student.dozeTimer -= dt;
  if (student.dozeTimer > 0) return;
  if (student.mode === 'asleep') {
    student.mode = 'idle';
    student.timer = inRange(student.personality.idleSeconds, rng.next());
    student.dozeTimer = S.dozeCycleSeconds * awake * rng.range(0.7, 1.3);
  } else if (student.mode !== 'alarmed') {
    student.mode = 'asleep';
    student.path = [];
    student.pathIndex = 0;
    student.dozeTimer = S.dozeCycleSeconds * (1 - awake) * rng.range(0.7, 1.3);
  }
}

/**
 * Students wander (how far depends on personality). If they watch the player long enough they
 * snitch, which the session forwards to the boss, or, for some, just laugh. Dozers nod off.
 */
export function updateStudent(student: StudentState, ctx: StudentContext): StudentOutcome {
  const { dt, nav, rng, tuning } = ctx;
  const p = student.personality;
  updateDoze(student, dt, rng);
  student.cooldown = Math.max(0, student.cooldown - dt);
  const canNotice = ctx.sees && student.cooldown <= 0 && isAwake(student);
  student.detection = updateDetection(
    student.detection,
    canNotice,
    ctx.rate,
    ctx.decay ?? NPC.vision.decayRate,
    dt,
  );

  if (student.detection >= 1 && student.mode !== 'alarmed') {
    student.mode = 'alarmed';
    student.timer = S.alarmSeconds;
    student.cooldown = S.alertCooldownSeconds;
    student.detection = 0;
    student.facing = angleTo(student.pos, ctx.playerPos);
    return rng.next() < p.snitchChance ? 'snitch' : 'laugh';
  }

  // Noticing something: stop and stare.
  if (canNotice) {
    student.facing = turnToward(
      student.facing,
      angleTo(student.pos, ctx.playerPos),
      NPC.turnRate * dt,
    );
    return null;
  }

  switch (student.mode) {
    case 'asleep':
      break;
    case 'alarmed':
    case 'idle': {
      student.timer -= dt;
      if (student.mode === 'idle') student.facing += Math.sin(student.timer * 1.3) * 0.6 * dt;
      if (student.timer <= 0) {
        const target = pickWanderTarget(student, nav, rng);
        if (target && setPathTo(student, nav, target)) student.mode = 'wander';
        else student.timer = inRange(p.idleSeconds, rng.next());
      }
      break;
    }
    case 'wander': {
      if (followPath(student, nav, tuning.walkSpeed * p.speedMult, dt, NPC.turnRate)) {
        student.mode = 'idle';
        student.timer = inRange(p.idleSeconds, rng.next());
      }
      break;
    }
  }
  return null;
}
