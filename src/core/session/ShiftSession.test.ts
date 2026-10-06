import { TILE_SIZE } from '../content/balance';
import { SCHOOL_LEVEL } from '../level/levels/school';
import { input, testLevel } from '../test/helpers';
import { ShiftSession } from './ShiftSession';
import type { PlayerInput, ShiftConfig, ShiftEvents } from './types';

/**
 * Layout: van + spawn on the left, a fountain (F) in reach of the spawn's east neighbour,
 * a locked door, and the boss patrolling far away on the right.
 */
const MAP = [
  '##################',
  '#V.F.....L......1#',
  '#VP.....##......2#',
  '#Z......##.......#',
  '##################',
];

function session(overrides: Partial<ShiftConfig> = {}) {
  return new ShiftSession({
    level: testLevel(MAP),
    characterId: 'dalton',
    ownedUpgrades: [],
    day: 1,
    warnings: 0,
    seed: 42,
    durationSeconds: 120,
    ...overrides,
  });
}

function record<K extends keyof ShiftEvents>(s: ShiftSession, type: K) {
  const log: ShiftEvents[K][] = [];
  s.events.on(type, (p) => log.push(p));
  return log;
}

function hold(s: ShiftSession, seconds: number, inp: PlayerInput, dt = 1 / 60) {
  for (let t = 0; t < seconds && s.status === 'running'; t += dt) s.tick(dt, inp);
}

const placePlayer = (s: ShiftSession, col: number, row: number) => {
  s.player.pos = { x: (col + 0.5) * TILE_SIZE, y: (row + 0.5) * TILE_SIZE };
};

describe('ShiftSession', () => {
  it('runs a full scrap → sell loop', () => {
    const s = session();
    const collected = record(s, 'scrap:collected');
    const sold = record(s, 'scrap:sold');

    placePlayer(s, 3, 2); // just below the fountain
    hold(s, 0.1, input());
    expect(s.currentTarget?.kind).toBe('fixture');
    hold(s, 6, input({ interact: true }));
    expect(collected).toHaveLength(1);
    expect(s.getSnapshot().bag.contents.brass).toBe(1);
    expect(s.isSuspicious).toBe(true);

    // Fixture is now recharging and can't be stripped again.
    hold(s, 0.1, input());
    expect(s.getSnapshot().prompt?.enabled).toBe(false);

    placePlayer(s, 2, 2); // next to the van
    hold(s, 0.1, input());
    // Van is focused; the old fixture is still in reach but disabled so the van wins.
    expect(s.currentTarget?.kind).toBe('van');
    hold(s, 2, input({ interact: true }));
    expect(sold).toHaveLength(1);
    expect(sold[0]!.value).toBe(25);
    expect(s.getSnapshot().earned).toBe(25);
    expect(s.isSuspicious).toBe(false);
  });

  it('cancels scrapping when the player moves', () => {
    const s = session();
    placePlayer(s, 3, 2);
    hold(s, 1, input({ interact: true }));
    expect(s.getSnapshot().prompt?.progress).toBeGreaterThan(0);
    s.tick(1 / 60, input({ interact: true, moveX: 1 }));
    expect(s.interaction).toBeNull();
  });

  it('unlocks locked doors with the key-adjusted duration', () => {
    const s = session({ ownedUpgrades: ['efficient-key-ring'] });
    const unlocked = record(s, 'door:unlocked');
    placePlayer(s, 8, 1);
    hold(s, 0.1, input());
    expect(s.currentTarget?.kind).toBe('door');
    expect(s.currentTarget?.duration).toBe(2);
    hold(s, 2.2, input({ interact: true }));
    expect(unlocked).toEqual([{ doorId: 'door-9-1', by: 'player' }]);
    expect(s.grid.isSolid(9, 1)).toBe(false);
  });

  it('issues a warning and confiscates scrap when caught carrying', () => {
    const s = session({ warnings: 1 });
    const caught = record(s, 'player:caught');
    s.bag = { ...s.bag, contents: { ...s.bag.contents, copper: 1 } };
    s.boss.mode = 'chase';
    s.boss.detection = 1;
    s.boss.pos = { ...s.player.pos };
    s.tick(1 / 60, input());
    expect(caught).toEqual([{ warnings: 2, fired: false, confiscated: 1 }]);
    expect(s.getSnapshot().bag.contents.copper).toBe(0);
    expect(s.player.grace).toBeGreaterThan(0);
  });

  it('waves off an empty-handed worker', () => {
    const s = session();
    const excused = record(s, 'player:excused');
    s.boss.mode = 'chase';
    s.boss.pos = { ...s.player.pos };
    s.tick(1 / 60, input());
    expect(excused).toHaveLength(1);
    expect(s.warnings).toBe(0);
  });

  it('fires the player on the third warning', () => {
    const s = session({ warnings: 2 });
    const ended = record(s, 'shift:ended');
    s.bag = { ...s.bag, contents: { ...s.bag.contents, brass: 0.5 } };
    s.boss.mode = 'chase';
    s.boss.pos = { ...s.player.pos };
    s.tick(1 / 60, input());
    expect(s.status).toBe('ended');
    expect(ended[0]).toMatchObject({ fired: true, endedBy: 'fired', warnings: 3, timesCaught: 1 });
  });

  it('heals a heart when the sleepy coworker is found', () => {
    const s = session({ warnings: 2 });
    placePlayer(s, 2, 3);
    hold(s, 0.1, input());
    expect(s.currentTarget?.kind).toBe('coworker');
    hold(s, 2, input({ interact: true }));
    expect(s.warnings).toBe(1);
    expect(s.coworker.found).toBe(true);
  });

  it("hides Dalton's carried scrap while the ability is active", () => {
    const s = session();
    s.bag = { ...s.bag, contents: { ...s.bag.contents, copper: 0.5 } };
    s.tick(1 / 60, input());
    expect(s.isSuspicious).toBe(true);
    s.tick(1 / 60, input({ ability: true }));
    expect(s.isSuspicious).toBe(false);
    hold(s, 7, input());
    expect(s.isSuspicious).toBe(true);
  });

  it('lets Tomothy scrap without looking suspicious', () => {
    const s = session({ characterId: 'tomothy' });
    placePlayer(s, 3, 2);
    hold(s, 0.5, input({ interact: true }));
    expect(s.interaction?.target.kind).toBe('fixture');
    expect(s.isSuspicious).toBe(false);
  });

  it('ends when the clock runs out and loses unsold scrap', () => {
    const s = session({ durationSeconds: 1 });
    s.bag = { ...s.bag, contents: { ...s.bag.contents, steel: 0.4 } };
    hold(s, 2, input());
    expect(s.status).toBe('ended');
    expect(s.getSummary()).toMatchObject({ endedBy: 'time', unitsLost: 0.4, fired: false });
  });

  it('simulates a full shift on the school map without errors', () => {
    const s = new ShiftSession({
      level: SCHOOL_LEVEL,
      characterId: 'dunkin',
      ownedUpgrades: [],
      day: 3,
      warnings: 0,
      seed: 7,
    });
    const modes = new Set<string>();
    s.events.on('boss:mode', ({ mode }) => modes.add(mode));
    let t = 0;
    while (s.status === 'running') {
      s.tick(1 / 30, input({ moveX: Math.sin(t / 3), moveY: Math.cos(t / 5), interact: true }));
      t += 1 / 30;
    }
    expect(s.getSummary()?.endedBy).toBe('time');
    expect(s.boss.pos.x).toBeGreaterThan(0);
  });
});

describe('ShiftSession stealth: crouching, cover, light, sight', () => {
  // Boss starts at 1 facing east, a desk (k) and a locker (O) sit between it and the player.
  const STEALTH = ['##########', '#1...k.P.#', '#2.......#', '#V..O...Z#', '##########'];
  const fullRoom = (light?: number) => [
    {
      id: 'all',
      name: 'All',
      kind: 'hallway' as const,
      rect: { col: 0, row: 0, w: 10, h: 5 },
      light,
    },
  ];

  function stealthSession(light?: number) {
    const s = new ShiftSession({
      level: testLevel(STEALTH, '12', fullRoom(light)),
      characterId: 'dunkin',
      ownedUpgrades: [],
      day: 1,
      warnings: 0,
      seed: 1,
      durationSeconds: 60,
    });
    s.boss.facing = 0;
    s.bag = { ...s.bag, contents: { ...s.bag.contents, copper: 0.5 } }; // suspicious
    return s;
  }

  it('crouching moves at half speed and blocks sprinting', () => {
    const walk = stealthSession();
    const crouch = stealthSession();
    placePlayer(walk, 2, 2);
    placePlayer(crouch, 2, 2);
    hold(walk, 0.5, input({ moveX: 1 }));
    hold(crouch, 0.5, input({ moveX: 1, crouch: true, sprint: true }));
    const walked = walk.player.pos.x - 2.5 * TILE_SIZE;
    const crept = crouch.player.pos.x - 2.5 * TILE_SIZE;
    expect(crept).toBeCloseTo(walked / 2, 0);
    expect(crouch.player.sprinting).toBe(false);
    expect(crouch.getSnapshot().crouching).toBe(true);
  });

  it('a crouching worker behind a desk is not spotted; standing they are', () => {
    const standing = stealthSession();
    placePlayer(standing, 6, 1);
    hold(standing, 0.2, input());
    expect(standing.boss.detection).toBeGreaterThan(0);

    const crouched = stealthSession();
    placePlayer(crouched, 6, 1);
    hold(crouched, 0.2, input({ crouch: true }));
    expect(crouched.boss.detection).toBe(0);
  });

  it('spots you more slowly in the dark', () => {
    const lit = stealthSession(1);
    const dark = stealthSession(0.15);
    placePlayer(lit, 4, 2);
    placePlayer(dark, 4, 2);
    hold(lit, 0.2, input());
    hold(dark, 0.2, input());
    expect(dark.getSnapshot().light).toBeCloseTo(0.15);
    expect(dark.boss.detection).toBeGreaterThan(0);
    expect(dark.boss.detection).toBeLessThan(lit.boss.detection * 0.6);
  });

  it('tall props block sight; low props are cover', () => {
    const s = stealthSession();
    placePlayer(s, 2, 2);
    expect(s.grid.isOpaque(4, 3)).toBe(true); // locker
    expect(s.grid.isLowCover(5, 1)).toBe(true); // desk
    expect(s.isVisibleToPlayer({ x: 6.5 * TILE_SIZE, y: 3.5 * TILE_SIZE })).toBe(false);
    expect(s.isVisibleToPlayer({ x: 6.5 * TILE_SIZE, y: 1.5 * TILE_SIZE })).toBe(true);
  });
});
