import { BALANCE } from '../content/balance';
import type { TileRect } from '../level/types';
import { tileCenter } from '../level/grid';
import type { TilePos, Vec2 } from '../model/types';
import { angleTo, dist, inRange, turnToward } from '../util/math';
import type { Rng } from '../util/rng';
import { followPath, setPathTo, updateDetection, type NavContext, type Walker } from './navigation';

export type StudentMode = 'idle' | 'wander' | 'alarmed';

export interface StudentState extends Walker {
  id: string;
  mode: StudentMode;
  detection: number;
  timer: number;
  /** Seconds until this student can raise another alert. */
  cooldown: number;
  /** Area the student wanders in (their room). */
  area: TileRect;
}

export interface StudentTuning {
  walkSpeed: number;
  range: number;
  fillRate: number;
}

export interface StudentContext {
  dt: number;
  nav: NavContext;
  /** Player is visible AND doing something a student would snitch on. */
  sees: boolean;
  playerPos: Vec2;
  rng: Rng;
  tuning: StudentTuning;
}

const S = BALANCE.student;
const NPC = BALANCE.npc;

export function createStudent(
  id: string,
  spawn: TilePos,
  area: TileRect,
  tileSize: number,
  rng: Rng,
): StudentState {
  return {
    id,
    pos: tileCenter(tileSize, spawn.col, spawn.row),
    facing: rng.range(-Math.PI, Math.PI),
    path: [],
    pathIndex: 0,
    mode: 'idle',
    detection: 0,
    timer: inRange(S.idleSeconds, rng.next()),
    cooldown: 0,
    area,
  };
}

function pickWanderTarget(student: StudentState, nav: NavContext, rng: Rng): TilePos | null {
  const { col, row, w, h } = student.area;
  for (let i = 0; i < 20; i++) {
    const t = { col: rng.int(col, col + w - 1), row: rng.int(row, row + h - 1) };
    if (nav.passable(t.col, t.row)) return t;
  }
  return null;
}

/**
 * Students wander their room. If they watch the player scrapping long enough they shout,
 * which the session forwards to the boss as an alert. Returns true on the frame they shout.
 */
export function updateStudent(student: StudentState, ctx: StudentContext): boolean {
  const { dt, nav, rng, tuning } = ctx;
  student.cooldown = Math.max(0, student.cooldown - dt);
  const canNotice = ctx.sees && student.cooldown <= 0;
  student.detection = updateDetection(
    student.detection,
    canNotice,
    dist(student.pos, ctx.playerPos),
    tuning.range,
    tuning.fillRate,
    NPC.vision.decayRate,
    dt,
  );

  if (student.detection >= 1 && student.mode !== 'alarmed') {
    student.mode = 'alarmed';
    student.timer = S.alarmSeconds;
    student.cooldown = S.alertCooldownSeconds;
    student.detection = 0;
    student.facing = angleTo(student.pos, ctx.playerPos);
    return true;
  }

  // Noticing something: stop and stare.
  if (canNotice) {
    student.facing = turnToward(
      student.facing,
      angleTo(student.pos, ctx.playerPos),
      NPC.turnRate * dt,
    );
    return false;
  }

  switch (student.mode) {
    case 'alarmed':
    case 'idle': {
      student.timer -= dt;
      if (student.mode === 'idle') student.facing += Math.sin(student.timer * 1.3) * 0.6 * dt;
      if (student.timer <= 0) {
        const target = pickWanderTarget(student, nav, rng);
        if (target && setPathTo(student, nav, target)) student.mode = 'wander';
        else student.timer = inRange(S.idleSeconds, rng.next());
      }
      break;
    }
    case 'wander': {
      if (followPath(student, nav, tuning.walkSpeed, dt, NPC.turnRate)) {
        student.mode = 'idle';
        student.timer = inRange(S.idleSeconds, rng.next());
      }
      break;
    }
  }
  return false;
}
