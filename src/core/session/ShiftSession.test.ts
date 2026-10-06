import { BALANCE, TILE_SIZE } from '../content/balance';
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

/** Stand in front of the fountain at (3,1), inside its tile, as a player walking up would. */
const standAtFountain = (s: ShiftSession) => {
  s.player.pos = { x: 3.5 * TILE_SIZE, y: 1.8 * TILE_SIZE };
};

describe('ShiftSession', () => {
  it('runs a full scrap → sell loop', () => {
    const s = session();
    const collected = record(s, 'scrap:collected');
    const sold = record(s, 'scrap:sold');

    standAtFountain(s);
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

  it('turns to face the object being worked on', () => {
    const s = session();
    standAtFountain(s);
    s.player.facing = Math.PI / 2; // facing south, away from the fountain
    hold(s, 0.2, input({ interact: true }));
    expect(s.interaction?.target.kind).toBe('fixture');
    const f = s.fixtures[0]!;
    expect(s.player.facing).toBeCloseTo(
      Math.atan2(f.pos.y - s.player.pos.y, f.pos.x - s.player.pos.x),
    );
  });

  it('cancels scrapping when the player moves', () => {
    const s = session();
    standAtFountain(s);
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
    standAtFountain(s);
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

describe('ShiftSession progression + gadgets', () => {
  it('earns XP for scrapping and selling, plus end-of-shift bonuses', () => {
    const s = session({ durationSeconds: 30 });
    const gained = record(s, 'xp:gained');
    standAtFountain(s);
    hold(s, 6, input({ interact: true }));
    placePlayer(s, 2, 2);
    hold(s, 0.1, input());
    hold(s, 2, input({ interact: true }));
    expect(gained.map((g) => g.reason)).toEqual(['Exploring', 'Scrapping', 'Sales']);
    s.clockOut();
    const summary = s.getSummary()!;
    expect(summary.xp.map((l) => l.label)).toEqual([
      'Exploring',
      'Scrapping',
      'Sales',
      'Finished the shift',
      'Never caught',
    ]);
    expect(summary.xpTotal).toBe(
      BALANCE.xp.newRoom +
        BALANCE.xp.perScrap +
        Math.round(25 * BALANCE.xp.perDollar) +
        BALANCE.xp.shiftComplete +
        BALANCE.xp.cleanShift,
    );
  });

  it('gets no completion bonus for being fired', () => {
    const s = session({ warnings: 2 });
    s.bag = { ...s.bag, contents: { ...s.bag.contents, brass: 0.5 } };
    s.boss.mode = 'chase';
    s.boss.pos = { ...s.player.pos };
    s.tick(1 / 60, input());
    expect(s.getSummary()?.xp.map((l) => l.label)).not.toContain('Finished the shift');
  });

  it('sells for more with a scrapyard card', () => {
    const s = session({ ownedUpgrades: ['scrapyard-card'] });
    const sold = record(s, 'scrap:sold');
    s.bag = { ...s.bag, contents: { ...s.bag.contents, brass: 1 } };
    placePlayer(s, 2, 2);
    hold(s, 0.1, input());
    hold(s, 2, input({ interact: true }));
    expect(sold[0]!.value).toBe(Math.round(25 * 1.1));
  });

  it('an energy drink refills stamina and makes sprinting free for a while', () => {
    const s = session({ inventory: { 'energy-drink': 2 } });
    const used = record(s, 'gadget:used');
    s.player.stamina = 0;
    s.tick(1 / 60, input({ use: 'energy-drink' }));
    expect(used).toHaveLength(1);
    expect(s.inventory['energy-drink']).toBe(1);
    expect(s.player.stamina).toBe(s.stats.staminaSeconds);
    hold(s, 3, input({ moveY: 1, sprint: true }));
    expect(s.player.stamina).toBe(s.stats.staminaSeconds);
    expect(s.getSnapshot().boost).toBeGreaterThan(0);
  });

  it("can't use a gadget you don't have", () => {
    const s = session();
    const used = record(s, 'gadget:used');
    s.tick(1 / 60, input({ use: 'energy-drink' }));
    expect(used).toHaveLength(0);
  });

  it('a whoopee cushion lures the boss to where it lands', () => {
    const s = session({ inventory: { 'whoopee-cushion': 1 } });
    const noise = record(s, 'noise:made');
    placePlayer(s, 10, 3);
    s.player.facing = 0; // east, toward the boss's side of the map
    s.tick(1 / 60, input({ use: 'whoopee-cushion' }));
    expect(noise).toHaveLength(1);
    // Lands short of the east wall, inside the map.
    expect(noise[0]!.pos.x).toBeGreaterThan(s.player.pos.x + TILE_SIZE * 2);
    expect(noise[0]!.pos.x).toBeLessThan(17 * TILE_SIZE);
    expect(s.boss.mode).toBe('investigate');
    expect(s.boss.lastKnown).toEqual(noise[0]!.pos);
  });

  it('bolt cutters open a locked door instantly, but only at a door', () => {
    const s = session({ inventory: { 'bolt-cutters': 1 } });
    const failed = record(s, 'gadget:failed');
    const unlocked = record(s, 'door:unlocked');
    s.tick(1 / 60, input({ use: 'bolt-cutters' }));
    expect(failed).toHaveLength(1);
    expect(s.inventory['bolt-cutters']).toBe(1);
    placePlayer(s, 8, 1);
    hold(s, 0.1, input());
    s.tick(1 / 60, input({ use: 'bolt-cutters' }));
    expect(unlocked).toEqual([{ doorId: 'door-9-1', by: 'player' }]);
    expect(s.inventory['bolt-cutters']).toBe(0);
    expect(s.getSummary()).toBeNull();
  });

  it('Smooth Talker talks out of the first catch each shift', () => {
    const s = session({ warnings: 2, skills: ['smooth-talker'] });
    const talked = record(s, 'player:talkedOut');
    const caught = record(s, 'player:caught');
    const catchNow = () => {
      s.bag = { ...s.bag, contents: { ...s.bag.contents, copper: 1 } };
      s.player.grace = 0;
      s.boss.mode = 'chase';
      s.boss.pos = { ...s.player.pos };
      s.tick(1 / 60, input());
    };
    catchNow();
    expect(talked).toEqual([{ confiscated: 1 }]);
    expect(s.warnings).toBe(2);
    expect(s.getSnapshot().bag.contents.copper).toBe(0);
    expect(s.status).toBe('running');
    catchNow();
    expect(caught).toHaveLength(1);
    expect(s.status).toBe('ended');
  });

  it('Union Rep adds a heart', () => {
    const s = session({ warnings: 2, skills: ['union-rep'] });
    s.bag = { ...s.bag, contents: { ...s.bag.contents, brass: 0.5 } };
    s.boss.mode = 'chase';
    s.boss.pos = { ...s.player.pos };
    s.tick(1 / 60, input());
    expect(s.status).toBe('running');
    expect(s.getSnapshot()).toMatchObject({ warnings: 3, maxWarnings: 4 });
  });

  it('Overtime lengthens the shift and leftover gadgets carry over', () => {
    const s = new ShiftSession({
      level: testLevel(MAP),
      characterId: 'dalton',
      ownedUpgrades: [],
      skills: ['overtime'],
      inventory: { 'energy-drink': 1 },
      day: 1,
      warnings: 0,
      seed: 1,
    });
    expect(s.duration).toBe(BALANCE.shift.durationSeconds + 60);
    s.clockOut();
    expect(s.getSummary()?.inventory).toEqual({ 'energy-drink': 1 });
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

  it('tall props block sight with their real shape; low props are cover', () => {
    const s = stealthSession();
    // The locker at (4,3) backs onto the south wall and is half a tile deep.
    expect(s.grid.isOpaque(4, 3)).toBe(false);
    expect(s.grid.opaqueBoxesAt(4, 3)).toHaveLength(1);
    expect(s.grid.isLowCover(5, 1)).toBe(true); // desk
    s.player.pos = { x: 2.5 * TILE_SIZE, y: 3.75 * TILE_SIZE };
    expect(s.isVisibleToPlayer({ x: 6.5 * TILE_SIZE, y: 3.75 * TILE_SIZE })).toBe(false); // through it
    s.player.pos = { x: 2.5 * TILE_SIZE, y: 3.25 * TILE_SIZE };
    expect(s.isVisibleToPlayer({ x: 6.5 * TILE_SIZE, y: 3.25 * TILE_SIZE })).toBe(true); // in front
  });

  it('lets you walk into the free half of a furniture tile but not through the furniture', () => {
    const s = stealthSession();
    // Walk west along row 3 toward the locker at (4,3), hugging its open (north) half.
    s.player.pos = { x: 6.5 * TILE_SIZE, y: 3.25 * TILE_SIZE };
    hold(s, 1, input({ moveX: -1 }));
    expect(s.player.pos.x).toBeLessThan(4 * TILE_SIZE); // passed in front of the locker
    // Straight into the locker's body instead: stopped at its face.
    s.player.pos = { x: 4.5 * TILE_SIZE, y: 2.5 * TILE_SIZE };
    hold(s, 1, input({ moveY: 1 }));
    const lockerTop = s.grid.opaqueBoxesAt(4, 3)[0]!.minY;
    expect(s.player.pos.y).toBeLessThanOrEqual(lockerTop - BALANCE.player.radius + 0.5);
  });
});

describe('ShiftSession movement feel', () => {
  // A hallway lined with fixtures and lockers on the north wall.
  const HALL = [
    '##############',
    '#1.F.O.H.R.O.#',
    '#P..........Z#',
    '#V...........#',
    '#2############',
  ];

  it('runs the length of a cluttered hallway on a single diagonal key without getting stuck', () => {
    const s = new ShiftSession({
      level: testLevel(HALL),
      characterId: 'dalton',
      ownedUpgrades: [],
      day: 1,
      warnings: 0,
      seed: 3,
      durationSeconds: 60,
    });
    s.player.pos = { x: 1.5 * TILE_SIZE, y: 2.2 * TILE_SIZE };
    // "W" on the isometric camera is north-east in map space: it pushes into the north wall.
    const w = input({ moveX: Math.SQRT1_2, moveY: -Math.SQRT1_2 });
    // Mid-run, sliding east under the lockers: facing follows where you actually go, not the key.
    hold(s, 1.35, w);
    expect(Math.abs(s.player.facing)).toBeLessThan(0.6);
    // It sidesteps each wedged fixture (a short detour) and is past all five within 3.5s.
    hold(s, 2.15, w);
    expect(s.player.pos.x).toBeGreaterThan(11.5 * TILE_SIZE);
  });
});

describe('ShiftSession: technical fixtures, exploration and the new NPCs', () => {
  // Electrical panel (G) and server rack (N) on the north wall, a security door (K), a teacher (E).
  const TECH = [
    '##############',
    '#V.G.N...K..1#',
    '#VP....E.#..2#',
    '#Z.......#...#',
    '##############',
  ];
  const tech = (overrides: Partial<ShiftConfig> = {}) =>
    new ShiftSession({
      level: testLevel(TECH),
      characterId: 'dalton',
      ownedUpgrades: [],
      day: 1,
      warnings: 0,
      seed: 3,
      durationSeconds: 120,
      ...overrides,
    });
  const standAt = (s: ShiftSession, x: number, y: number) => {
    s.player.pos = { x: x * TILE_SIZE, y: y * TILE_SIZE };
    s.tick(1 / 60, input());
  };

  it('technical fixtures need the right gear or enough experience', () => {
    const s = tech();
    standAt(s, 3.5, 1.8);
    expect(s.currentTarget).toMatchObject({ label: 'Electrical Panel', enabled: false });
    expect(s.currentTarget?.reason).toMatch(/Work Gloves/);
    const geared = tech({ ownedUpgrades: ['work-gloves'] });
    standAt(geared, 3.5, 1.8);
    expect(geared.currentTarget).toMatchObject({ label: 'Electrical Panel', enabled: true });

    const rookie = tech({ workerLevel: 3 });
    standAt(rookie, 5.5, 1.8);
    expect(rookie.currentTarget?.reason).toMatch(/level 4/);
    const veteran = tech({ workerLevel: 4 });
    standAt(veteran, 5.5, 1.8);
    expect(veteran.currentTarget).toMatchObject({ label: 'Server Rack', enabled: true });
  });

  it('security doors need the Master Key, but bolt cutters still work', () => {
    const s = tech({ inventory: { 'bolt-cutters': 1 } });
    standAt(s, 8.5, 1.5);
    expect(s.currentTarget).toMatchObject({ label: 'Security Door', enabled: false });
    expect(s.currentTarget?.reason).toMatch(/Master Key/);
    const unlocked = record(s, 'door:unlocked');
    s.tick(1 / 60, input({ use: 'bolt-cutters' }));
    expect(unlocked).toHaveLength(1);

    const keyed = tech({ ownedUpgrades: ['efficient-key-ring', 'master-key'] });
    standAt(keyed, 8.5, 1.5);
    expect(keyed.currentTarget).toMatchObject({ label: 'Security Door', enabled: true });
  });

  it('remembers what you have seen, and only pays for a room the first time', () => {
    const s = tech();
    const found = record(s, 'room:discovered');
    hold(s, 0.5, input());
    expect(found).toHaveLength(1);
    expect(s.explored.has(2, 2)).toBe(true);
    expect(s.explored.has(11, 3)).toBe(false); // behind the security door's wall
    s.clockOut();
    const summary = s.getSummary()!;
    expect(summary.roomsDiscovered).toEqual(['Everywhere']);
    expect(summary.exploredFraction).toBeGreaterThan(0);

    const next = tech({ explored: summary.explored });
    expect(next.explored.has(2, 2)).toBe(true);
    const again = record(next, 'room:discovered');
    hold(next, 0.5, input());
    expect(again).toHaveLength(0);
  });

  it('Mr. Gravy notices a stripped fixture on his rounds and goes to look', () => {
    const s = tech();
    const remarks = record(s, 'boss:remark');
    const panel = s.fixtures.find((f) => f.def.id === 'electrical-panel')!;
    panel.rechargeLeft = panel.rechargeTotal = 100;
    s.boss.pos = { x: 6.5 * TILE_SIZE, y: 2.5 * TILE_SIZE };
    s.boss.facing = Math.PI; // looking west, toward the panel
    s.boss.mode = 'inspect';
    s.boss.timer = 10;
    s.player.pos = { x: 1.5 * TILE_SIZE, y: 3.5 * TILE_SIZE };
    hold(s, 0.5, input());
    expect(remarks.some((r) => r.remark === 'evidence' && r.detail === 'Electrical Panel')).toBe(
      true,
    );
    expect(['investigate', 'search']).toContain(s.boss.mode);
    expect(panel.noticed).toBe(true);
  });

  it('he hears you sprint nearby', () => {
    const s = tech();
    s.teachers.length = 0; // keep it about the boss
    s.boss.pos = { x: 6.5 * TILE_SIZE, y: 3.5 * TILE_SIZE };
    s.boss.facing = 0; // looking away, east
    s.boss.mode = 'inspect';
    s.boss.timer = 10;
    s.player.pos = { x: 3.5 * TILE_SIZE, y: 3.5 * TILE_SIZE };
    hold(s, 0.3, input({ moveX: -1, sprint: true }));
    expect(s.boss.mode).toBe('investigate');
    expect(s.boss.focus).toBe('noise');
  });

  it('a teacher who sees you scrapping radios Mr. Gravy, who hurries over', () => {
    const s = tech({ ownedUpgrades: ['work-gloves'] });
    const reports = record(s, 'teacher:report');
    const t = s.teachers[0]!;
    t.facing = Math.PI; // toward the panel
    t.mode = 'teach';
    t.timer = 60;
    s.player.pos = { x: 3.5 * TILE_SIZE, y: 1.8 * TILE_SIZE };
    for (let i = 0; i < 300 && reports.length === 0; i++) s.tick(1 / 60, input({ interact: true }));
    expect(reports).toHaveLength(1);
    expect(reports[0]!.name).toBe(t.def.name);
    expect(t.mode).toBe('confront');
    expect(s.boss.mode).toBe('investigate');
    expect(s.boss.focus).toBe('report');
  });
});
