import { TILE_SIZE } from '../content/balance';
import { center, testGrid, testLevel } from '../test/helpers';
import { createRng } from '../util/rng';
import { createBoss, sendBossBackToPatrol, updateBoss, type BossContext } from './bossBrain';
import { createStudent, updateStudent } from './studentBrain';

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

function ctx(overrides: Partial<BossContext> = {}): BossContext {
  const sees = overrides.sees ?? false;
  return {
    dt: 0.05,
    nav,
    route: level.bossRoute,
    sees: false,
    playerPos: center(1, 4),
    alert: null,
    speedMult: 1,
    tuning,
    ...overrides,
    rate: overrides.rate ?? (sees ? SEE_RATE : 0),
  };
}

function run(times: number, fn: () => void) {
  for (let i = 0; i < times; i++) fn();
}

describe('boss brain', () => {
  it('patrols along the route', () => {
    const boss = createBoss(level.bossRoute, TILE_SIZE);
    const start = { ...boss.pos };
    run(40, () => updateBoss(boss, ctx()));
    expect(boss.mode).toBe('patrol');
    expect(boss.pos.x).toBeGreaterThan(start.x);
  });

  it('gets suspicious, then chases, then catches a visible suspicious player', () => {
    const boss = createBoss(level.bossRoute, TILE_SIZE);
    const playerPos = center(4, 1);
    updateBoss(boss, ctx({ sees: true, playerPos }));
    expect(boss.mode).toBe('suspicious');
    run(40, () => updateBoss(boss, ctx({ sees: true, playerPos })));
    expect(boss.mode).toBe('chase');
    let caught = false;
    run(80, () => {
      caught ||= updateBoss(boss, ctx({ sees: true, playerPos })).caught;
    });
    expect(caught).toBe(true);
  });

  it('calms down if the player slips away before the meter fills', () => {
    const boss = createBoss(level.bossRoute, TILE_SIZE);
    updateBoss(boss, ctx({ sees: true, playerPos: center(4, 1), dt: 0.1 }));
    expect(boss.mode).toBe('suspicious');
    run(60, () => updateBoss(boss, ctx()));
    expect(['return', 'patrol']).toContain(boss.mode);
  });

  it('investigates student alerts, searches, then returns to patrol', () => {
    const boss = createBoss(level.bossRoute, TILE_SIZE);
    updateBoss(boss, ctx({ alert: center(3, 3) }));
    expect(boss.mode).toBe('investigate');
    const modes = new Set<string>();
    run(400, () => {
      updateBoss(boss, ctx());
      modes.add(boss.mode);
    });
    expect(modes.has('search')).toBe(true);
    expect(boss.mode).toBe('patrol');
  });

  it('can be sent back to patrol after a catch', () => {
    const boss = createBoss(level.bossRoute, TILE_SIZE);
    boss.mode = 'chase';
    boss.detection = 1;
    sendBossBackToPatrol(boss);
    expect(boss.mode).toBe('return');
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
