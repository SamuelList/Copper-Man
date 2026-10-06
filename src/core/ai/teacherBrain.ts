import { BALANCE } from '../content/balance';
import { tileCenter, worldToTile } from '../level/grid';
import type { TeacherDef, TilePos, Vec2 } from '../model/types';
import { angleTo, inRange, turnToward } from '../util/math';
import type { Rng } from '../util/rng';
import { followPath, setPathTo, updateDetection, type NavContext, type Walker } from './navigation';

/**
 * - teach: at their post at the front of the class, keeping an eye on the room.
 * - walk: on the way somewhere (`next` says where).
 * - hall: standing outside their door, watching the hallway.
 * - break: coffee in the teachers' lounge.
 * - suspicious: noticed you; the meter is filling.
 * - confront: staring you down while they radio Mr. Gravy.
 * - check: a teacher's pet tattled; they go and look.
 */
export type TeacherMode = 'teach' | 'walk' | 'hall' | 'break' | 'suspicious' | 'confront' | 'check';

/** A place a teacher stands, and which way they face there. */
export interface Post {
  tile: TilePos;
  look: number;
}

export interface TeacherState extends Walker {
  id: string;
  def: TeacherDef;
  mode: TeacherMode;
  /** Where they're walking to, and what they'll do on arrival. */
  next: 'teach' | 'hall' | 'break' | 'check';
  detection: number;
  timer: number;
  /** Seconds until they can call in another report. */
  cooldown: number;
  front: Post;
  hall: Post | null;
  lounge: Post | null;
  /** Where they're looking: what they're watching, or where a tip sent them. */
  focusPos: Vec2 | null;
  /** Direction to sweep their gaze around at a post. */
  scanCenter: number;
}

export interface TeacherContext {
  dt: number;
  nav: NavContext;
  rng: Rng;
  /** Player is visible AND suspicious this frame. */
  sees: boolean;
  rate: number;
  decay?: number;
  playerPos: Vec2;
  /** A teacher's pet told them something's up over there. */
  tip: Vec2 | null;
}

const T = BALANCE.teacher;
const NPC = BALANCE.npc;

export function createTeacher(
  id: string,
  def: TeacherDef,
  front: Post,
  hall: Post | null,
  lounge: Post | null,
  tileSize: number,
  rng: Rng,
): TeacherState {
  return {
    id,
    def,
    pos: tileCenter(tileSize, front.tile.col, front.tile.row),
    facing: front.look,
    path: [],
    pathIndex: 0,
    mode: 'teach',
    next: 'teach',
    detection: 0,
    timer: inRange(T.teachSeconds, rng.next()),
    cooldown: 0,
    front,
    hall,
    lounge,
    focusPos: null,
    scanCenter: front.look,
  };
}

function walkTo(t: TeacherState, nav: NavContext, post: Post | null, next: TeacherState['next']) {
  if (!post || !setPathTo(t, nav, post.tile)) return false;
  t.mode = 'walk';
  t.next = next;
  t.scanCenter = post.look;
  return true;
}

function backToClass(t: TeacherState, nav: NavContext, rng: Rng) {
  if (!walkTo(t, nav, t.front, 'teach')) {
    t.mode = 'teach';
    t.timer = inRange(T.teachSeconds, rng.next());
  }
}

/** Sweep the gaze around their post. */
function watch(t: TeacherState, dt: number, sweep: number) {
  t.timer -= dt;
  const want = t.scanCenter + Math.sin(t.timer * sweep) * 0.9;
  t.facing = turnToward(t.facing, want, NPC.turnRate * 0.5 * dt);
}

/**
 * Teachers keep a routine: teach, step into the hall, sometimes a coffee break. They notice
 * scrapping and full bags faster than students, and when their meter fills they don't shout,
 * they radio Mr. Gravy (returns 'report' that frame) and stare you down.
 */
export function updateTeacher(t: TeacherState, ctx: TeacherContext): 'report' | null {
  const { dt, nav, rng } = ctx;
  const speed = T.walkSpeed * t.def.speedMult;
  t.cooldown = Math.max(0, t.cooldown - dt);
  const canNotice = ctx.sees && t.cooldown <= 0 && t.mode !== 'confront';
  t.detection = updateDetection(
    t.detection,
    canNotice,
    ctx.rate,
    ctx.decay ?? NPC.vision.decayRate,
    dt,
  );

  if (canNotice) {
    t.focusPos = { ...ctx.playerPos };
    if (t.detection >= 1) {
      t.mode = 'confront';
      t.timer = T.confrontSeconds;
      t.cooldown = T.reportCooldownSeconds;
      t.detection = 0;
      t.path = [];
      t.pathIndex = 0;
      return 'report';
    }
    if (t.mode !== 'suspicious') {
      t.mode = 'suspicious';
      t.path = [];
      t.pathIndex = 0;
    }
  } else if (ctx.tip && t.mode !== 'confront' && t.mode !== 'suspicious') {
    t.focusPos = { ...ctx.tip };
    if (setPathTo(t, nav, worldToTile(nav.tileSize, ctx.tip.x, ctx.tip.y))) {
      t.mode = 'walk';
      t.next = 'check';
    }
  }

  switch (t.mode) {
    case 'teach':
      watch(t, dt, 0.8);
      if (t.timer <= 0) {
        const takeBreak = t.lounge !== null && rng.next() < T.breakChance;
        if (!(takeBreak ? walkTo(t, nav, t.lounge, 'break') : walkTo(t, nav, t.hall, 'hall'))) {
          t.timer = inRange(T.teachSeconds, rng.next());
        }
      }
      break;
    case 'walk':
      if (followPath(t, nav, speed, dt, NPC.turnRate)) {
        t.mode = t.next;
        t.timer =
          t.next === 'teach'
            ? inRange(T.teachSeconds, rng.next())
            : t.next === 'break'
              ? inRange(T.breakSeconds, rng.next())
              : inRange(T.hallSeconds, rng.next());
        if (t.next === 'check' && t.focusPos) t.scanCenter = angleTo(t.pos, t.focusPos);
      }
      break;
    case 'hall':
    case 'break':
    case 'check':
      watch(t, dt, t.mode === 'break' ? 0.4 : 1.4);
      if (t.timer <= 0) backToClass(t, nav, rng);
      break;
    case 'suspicious':
      if (t.focusPos)
        t.facing = turnToward(t.facing, angleTo(t.pos, t.focusPos), NPC.turnRate * dt);
      if (!ctx.sees && t.detection <= 0) backToClass(t, nav, rng);
      break;
    case 'confront':
      t.timer -= dt;
      if (ctx.sees) t.focusPos = { ...ctx.playerPos };
      if (t.focusPos)
        t.facing = turnToward(t.facing, angleTo(t.pos, t.focusPos), NPC.turnRate * dt);
      if (t.timer <= 0) backToClass(t, nav, rng);
      break;
  }
  return null;
}
