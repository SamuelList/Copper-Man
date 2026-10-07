import { TILE_SIZE } from '../content/balance';
import { PERSONALITIES, TEACHERS } from '../content/npcs';
import { center, testGrid, testLevel } from '../test/helpers';
import { createRng } from '../util/rng';
import { dist } from '../util/math';
import {
  addHeat,
  choosePatrolPoint,
  createBoss,
  sendBossBackToPatrol,
  updateBoss,
  type BossContext,
  type BossState,
  type PatrolPoint,
} from './bossBrain';
import { createStudent, rollPersonality, updateStudent } from './studentBrain';
import { createCustodian, isMopping, updateCustodian } from './custodianBrain';
import { createTeacher, updateTeacher } from './teacherBrain';

const MAP = [
  '############',
  '#1........2#',
  '#..........#',
  '#..........#',
  '#P.........#',
  '############',
];
const level = testLevel(MAP);
const grid = testGrid(MAP);
const nav = { cols: grid.cols, rows: grid.rows, tileSize: TILE_SIZE, passable: grid.bossPassable };
const tuning = { walkSpeed: 80 };
/** Detection gain used whenever a test says the NPC sees the player. */
const SEE_RATE = 1.5;

/** Two rooms' worth of patrol points: the left and right ends of the map. */
const POINTS: PatrolPoint[] = [
  { tile: { col: 1, row: 1 }, roomId: 'west', look: null },
  { tile: { col: 10, row: 1 }, roomId: 'east', look: null },
  { tile: { col: 10, row: 4 }, roomId: 'east', look: null },
];
const roomAt = (p: { x: number }) => (p.x < 6 * TILE_SIZE ? 'west' : 'east');

function ctx(overrides: Partial<BossContext> = {}): BossContext {
  const sees = overrides.sees ?? false;
  return {
    dt: 0.05,
    now: 0,
    nav,
    rng: createRng(1),
    points: POINTS,
    guardSpots: [{ tile: { col: 2, row: 4 }, look: 0 }],
    hideSpots: [
      { col: 4, row: 2 },
      { col: 8, row: 3 },
      { col: 6, row: 4 },
    ],
    roomAt,
    sees: false,
    playerPos: center(1, 4),
    playerVel: { x: 0, y: 0 },
    stimulus: null,
    speedMult: 1,
    tuning,
    ...overrides,
    rate: overrides.rate ?? (sees ? SEE_RATE : 0),
  };
}

function run(times: number, fn: () => void) {
  for (let i = 0; i < times; i++) fn();
}

const newBoss = () => createBoss(level.bossRoute[0]!, POINTS.length, TILE_SIZE, createRng(2));

/** Run until a mode shows up (or give up), recording every mode seen. */
function runUntil(boss: BossState, mode: string, c: Partial<BossContext> = {}, max = 2000) {
  const modes = new Set<string>();
  for (let i = 0; i < max && boss.mode !== mode; i++) {
    updateBoss(boss, ctx({ ...c, now: i * 0.05 }));
    modes.add(boss.mode);
  }
  return modes;
}

describe('boss brain', () => {
  it('plans his own rounds: walks to a point, then stops and looks around', () => {
    const boss = newBoss();
    const start = { ...boss.pos };
    const modes = runUntil(boss, 'inspect');
    expect(modes.has('patrol')).toBe(true);
    expect(boss.mode).toBe('inspect');
    expect(dist(boss.pos, start)).toBeGreaterThan(TILE_SIZE);
    // And then moves on somewhere else.
    runUntil(boss, 'patrol');
    expect(boss.mode).toBe('patrol');
  });

  it('checks rooms with a history of trouble far more often', () => {
    const counts = { west: 0, east: 0 };
    const rng = createRng(7);
    const boss = newBoss();
    boss.pos = center(5, 2);
    addHeat(boss.memory, 'west', 5);
    for (let i = 0; i < 400; i++) {
      boss.target = -1;
      const pick = choosePatrolPoint(boss, ctx({ rng, now: 100 }));
      counts[POINTS[pick]!.roomId as 'west' | 'east']++;
    }
    // One west point vs two east points, but the heat wins.
    expect(counts.west).toBeGreaterThan(counts.east * 2);
  });

  it('gets suspicious, then chases, then catches a visible suspicious player', () => {
    const boss = newBoss();
    const playerPos = center(4, 1);
    const first = updateBoss(boss, ctx({ sees: true, playerPos }));
    expect(boss.mode).toBe('suspicious');
    expect(first.remark).toBe('huh');
    run(40, () => updateBoss(boss, ctx({ sees: true, playerPos })));
    expect(boss.mode).toBe('chase');
    let caught = false;
    run(80, () => {
      caught ||= updateBoss(boss, ctx({ sees: true, playerPos })).caught;
    });
    expect(caught).toBe(true);
  });

  it("goes to look when he isn't sure what he saw", () => {
    const boss = newBoss();
    updateBoss(boss, ctx({ sees: true, playerPos: center(4, 1), dt: 0.1 }));
    expect(boss.mode).toBe('suspicious');
    run(60, () => updateBoss(boss, ctx()));
    expect(['investigate', 'search']).toContain(boss.mode);
  });

  it('hurries to a report, checks hiding spots, then gets back to his rounds', () => {
    const boss = newBoss();
    const r = updateBoss(boss, ctx({ stimulus: { kind: 'report', pos: center(8, 3) } }));
    expect(r.remark).toBe('report');
    expect(boss.mode).toBe('investigate');
    const modes = runUntil(boss, 'patrol');
    expect(modes.has('search')).toBe(true);
    expect(boss.mode).toBe('patrol');
  });

  it('a noise does not distract him from a report', () => {
    const boss = newBoss();
    updateBoss(boss, ctx({ stimulus: { kind: 'report', pos: center(8, 3) } }));
    updateBoss(boss, ctx({ stimulus: { kind: 'noise', pos: center(2, 2) } }));
    expect(boss.focus).toBe('report');
    expect(boss.lastKnown).toEqual(center(8, 3));
    // But a report overrides a noise.
    const other = newBoss();
    updateBoss(other, ctx({ stimulus: { kind: 'noise', pos: center(2, 2) } }));
    updateBoss(other, ctx({ stimulus: { kind: 'report', pos: center(8, 3) } }));
    expect(other.lastKnown).toEqual(center(8, 3));
  });

  it('when he loses you, he heads where you were running, not where you were', () => {
    const boss = newBoss();
    boss.mode = 'chase';
    boss.detection = 1;
    boss.pos = center(1, 2);
    // Last seen at (4,2) running east.
    updateBoss(boss, ctx({ sees: true, playerPos: center(4, 2), playerVel: { x: 150, y: 0 } }));
    let remark = null;
    run(80, () => {
      remark ??= updateBoss(boss, ctx({ playerPos: center(10, 4) })).remark;
    });
    expect(remark).toBe('lost');
    expect(boss.escaped).toBe(true);
    expect(boss.lastKnown!.x).toBeGreaterThan(center(4, 2).x + TILE_SIZE * 2);
  });

  it('can be sent back to his rounds after a catch', () => {
    const boss = newBoss();
    boss.mode = 'chase';
    boss.detection = 1;
    sendBossBackToPatrol(boss);
    expect(boss.mode).toBe('patrol');
    expect(boss.detection).toBe(0);
  });
});

describe('student brain', () => {
  const area = { col: 1, row: 1, w: 10, h: 4 };
  const studentNav = { ...nav, passable: grid.studentPassable };
  const sTuning = { walkSpeed: 55 };

  it('wanders within its room', () => {
    const rng = createRng(3);
    const s = createStudent('s', { col: 5, row: 2 }, area, TILE_SIZE, rng);
    const seen = new Set<string>();
    run(400, () => {
      updateStudent(s, {
        dt: 0.05,
        nav: studentNav,
        sees: false,
        rate: 0,
        playerPos: center(1, 4),
        rng,
        tuning: sTuning,
      });
      seen.add(s.mode);
      const col = Math.floor(s.pos.x / TILE_SIZE);
      expect(col).toBeGreaterThanOrEqual(1);
      expect(col).toBeLessThanOrEqual(10);
    });
    expect(seen.has('wander')).toBe(true);
  });

  it('shouts once after watching scrapping, then cools down', () => {
    const rng = createRng(4);
    const s = createStudent('s', { col: 5, row: 2 }, area, TILE_SIZE, rng);
    let shouts = 0;
    run(60, () => {
      if (
        updateStudent(s, {
          dt: 0.05,
          nav: studentNav,
          sees: true,
          rate: SEE_RATE,
          playerPos: center(7, 2),
          rng,
          tuning: sTuning,
        })
      ) {
        shouts++;
      }
    });
    expect(shouts).toBe(1);
    expect(s.cooldown).toBeGreaterThan(0);
  });
});

describe('student personalities', () => {
  const area = { col: 1, row: 1, w: 10, h: 4 };
  const studentNav = { ...nav, passable: grid.studentPassable };
  const sTuning = { walkSpeed: 55 };
  const step = (
    s: ReturnType<typeof createStudent>,
    rng: ReturnType<typeof createRng>,
    sees: boolean,
  ) =>
    updateStudent(s, {
      dt: 0.05,
      nav: studentNav,
      sees,
      rate: sees ? SEE_RATE : 0,
      playerPos: center(7, 2),
      rng,
      tuning: sTuning,
    });

  it('rolls a mix of personalities', () => {
    const rng = createRng(11);
    const ids = new Set(Array.from({ length: 200 }, () => rollPersonality(rng).id));
    expect(ids.size).toBe(PERSONALITIES.all.length);
  });

  it('the class clown often laughs instead of snitching', () => {
    const rng = createRng(5);
    const outcomes = { snitch: 0, laugh: 0 };
    for (let i = 0; i < 40; i++) {
      const s = createStudent(
        'c',
        { col: 5, row: 2 },
        area,
        TILE_SIZE,
        rng,
        PERSONALITIES.get('class-clown'),
      );
      for (let k = 0; k < 40; k++) {
        const o = step(s, rng, true);
        if (o) {
          outcomes[o]++;
          break;
        }
      }
    }
    expect(outcomes.laugh).toBeGreaterThan(5);
    expect(outcomes.snitch).toBeGreaterThan(5);
  });

  it('a sleepyhead dozes off and sees nothing while asleep', () => {
    const rng = createRng(6);
    const s = createStudent(
      'z',
      { col: 5, row: 2 },
      area,
      TILE_SIZE,
      rng,
      PERSONALITIES.get('sleepy'),
    );
    let slept = false;
    run(800, () => {
      step(s, rng, false);
      if (s.mode === 'asleep') slept = true;
    });
    expect(slept).toBe(true);
    s.mode = 'asleep';
    s.dozeTimer = 100;
    run(60, () => expect(step(s, rng, true)).toBeNull());
    expect(s.detection).toBe(0);
  });

  it('roamers wander past their room; phone zombies barely move', () => {
    const rng = createRng(8);
    const room = { col: 4, row: 2, w: 3, h: 2 };
    const roamer = createStudent(
      'r',
      { col: 5, row: 2 },
      room,
      TILE_SIZE,
      rng,
      PERSONALITIES.get('class-clown'),
    );
    const phone = createStudent(
      'p',
      { col: 5, row: 2 },
      room,
      TILE_SIZE,
      rng,
      PERSONALITIES.get('phone'),
    );
    expect(roamer.area.w).toBeGreaterThan(room.w);
    expect(phone.area.w).toBeLessThanOrEqual(3);
  });
});

describe('teacher brain', () => {
  const front = { tile: { col: 5, row: 1 }, look: Math.PI / 2 };
  const hall = { tile: { col: 9, row: 4 }, look: 0 };
  const lounge = { tile: { col: 2, row: 4 }, look: 0 };
  const tctx = (
    rng: ReturnType<typeof createRng>,
    sees = false,
    tip: { x: number; y: number } | null = null,
  ) => ({
    dt: 0.05,
    nav,
    rng,
    sees,
    rate: sees ? SEE_RATE : 0,
    playerPos: center(7, 3),
    tip,
  });

  it('keeps a routine: teach, then the hall or the lounge, then back', () => {
    const rng = createRng(9);
    const t = createTeacher('t', TEACHERS.all[0]!, front, hall, lounge, TILE_SIZE, rng);
    const modes = new Set<string>();
    run(3000, () => {
      updateTeacher(t, tctx(rng));
      modes.add(t.mode);
    });
    expect(modes.has('teach')).toBe(true);
    expect(modes.has('walk')).toBe(true);
    expect(modes.has('hall') || modes.has('break')).toBe(true);
  });

  it('radios the boss once sure, then stares you down and cools off', () => {
    const rng = createRng(10);
    const t = createTeacher('t', TEACHERS.all[0]!, front, hall, lounge, TILE_SIZE, rng);
    let reports = 0;
    run(80, () => {
      if (updateTeacher(t, tctx(rng, true)) === 'report') reports++;
    });
    expect(reports).toBe(1);
    expect(t.cooldown).toBeGreaterThan(0);
  });

  it("goes to check when a teacher's pet tattles", () => {
    const rng = createRng(12);
    const t = createTeacher('t', TEACHERS.all[0]!, front, hall, lounge, TILE_SIZE, rng);
    updateTeacher(t, tctx(rng, false, center(9, 3)));
    expect(t.mode).toBe('walk');
    expect(t.next).toBe('check');
    for (let i = 0; i < 400 && t.mode !== 'check'; i++) updateTeacher(t, tctx(rng));
    expect(t.mode).toBe('check');
    expect(dist(t.pos, center(9, 3))).toBeLessThan(TILE_SIZE);
  });
});

describe('custodian brain', () => {
  const jobs = [
    {
      roomId: 'west',
      spots: [
        { col: 2, row: 2 },
        { col: 3, row: 3 },
      ],
    },
    {
      roomId: 'east',
      spots: [
        { col: 9, row: 2 },
        { col: 9, row: 4 },
      ],
    },
  ];
  const home = { col: 1, row: 4 };
  const cctx = (
    rng: ReturnType<typeof createRng>,
    overrides: Partial<Parameters<typeof updateCustodian>[1]> = {},
  ) => ({
    dt: 0.05,
    nav,
    rng,
    jobs,
    home,
    sees: false,
    rate: 0,
    playerPos: center(6, 1),
    spotted: null,
    ...overrides,
  });

  it('works his schedule: mops each room in turn, with trips back to his closet', () => {
    const rng = createRng(21);
    const c = createCustodian(home, jobs.length, TILE_SIZE, rng);
    const modes = new Set<string>();
    const rooms = new Set<number>();
    run(4000, () => {
      updateCustodian(c, cctx(rng));
      modes.add(c.mode);
      if (c.mode === 'mop') rooms.add(c.order[c.step]!);
    });
    expect(modes).toEqual(new Set(['refill', 'walk', 'mop']));
    expect(rooms.size).toBe(2);
    expect(isMopping(c) || c.mode === 'walk' || c.mode === 'refill').toBe(true);
  });

  it('kneels at a freshly stripped fixture and always calls it in', () => {
    const rng = createRng(22);
    const c = createCustodian(home, jobs.length, TILE_SIZE, rng);
    const spotted = { id: 'radiator', pos: center(6, 2), fresh: true };
    const events: string[] = [];
    run(400, () => {
      const e = updateCustodian(c, cctx(rng, { spotted }));
      if (e) events.push(e.kind === 'report' ? `report:${e.about}` : e.kind);
    });
    expect(events).toEqual(['inspecting', 'report:fixture']);
    expect(c.known.has('radiator')).toBe(true);
  });

  it('may let an old one slide, but gets suspicious as he finds more', () => {
    const firstFind = { report: 0, shrug: 0 };
    for (let seed = 0; seed < 60; seed++) {
      const rng = createRng(seed);
      const c = createCustodian(home, jobs.length, TILE_SIZE, rng);
      const spotted = { id: 'sink', pos: center(5, 3), fresh: false };
      for (let i = 0; i < 400; i++) {
        const e = updateCustodian(c, cctx(rng, { spotted }));
        if (e?.kind === 'report') firstFind.report++;
        if (e?.kind === 'shrug') firstFind.shrug++;
        if (e && e.kind !== 'inspecting') break;
      }
    }
    expect(firstFind.report).toBeGreaterThan(10);
    expect(firstFind.shrug).toBeGreaterThan(10);
    // By his fourth find he calls in every one.
    const rng = createRng(3);
    const c = createCustodian(home, jobs.length, TILE_SIZE, rng);
    c.finds = 3;
    let reported = false;
    run(400, () => {
      const e = updateCustodian(
        c,
        cctx(rng, { spotted: { id: 'old', pos: center(5, 3), fresh: false } }),
      );
      reported ||= e?.kind === 'report';
    });
    expect(reported).toBe(true);
  });

  it('calls in someone he watches scrapping', () => {
    const rng = createRng(23);
    const c = createCustodian(home, jobs.length, TILE_SIZE, rng);
    let report = null;
    run(80, () => {
      report ??= updateCustodian(c, cctx(rng, { sees: true, rate: SEE_RATE }));
    });
    expect(report).toMatchObject({ kind: 'report', about: 'player' });
  });
});
