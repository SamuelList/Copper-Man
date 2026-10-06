import { testLevel } from '../test/helpers';
import { lightAt, parseAsciiLevel, roomAt, tileAt, validateLevel } from './asciiLevel';
import { FIXTURES } from '../content/fixtures';
import { PROPS } from '../content/props';
import { SCHOOL_LEVEL } from './levels/school';

describe('ASCII level parser', () => {
  it('parses tiles, fixtures, doors, spawns and patrol markers', () => {
    const level = testLevel(['#######', '#P.F.1#', '#V.L.2#', '#S.Z.k#', '#######']);
    expect(level.cols).toBe(7);
    expect(level.playerSpawn).toEqual({ col: 1, row: 1 });
    expect(level.fixtures.map((f) => f.defId)).toEqual(['drinking-fountain', 'desk']);
    expect(level.doors).toEqual([{ id: 'door-3-2', tile: { col: 3, row: 2 }, locked: true }]);
    expect(level.vanTiles).toEqual([{ col: 1, row: 2 }]);
    expect(level.bossRoute).toEqual([
      { col: 5, row: 1 },
      { col: 5, row: 2 },
    ]);
    expect(tileAt(level, 0, 0)).toBe('wall');
    expect(tileAt(level, -1, 0)).toBe('wall');
    expect(tileAt(level, 3, 1)).toBe('fixture');
  });

  it('parses furniture props and room light levels', () => {
    const level = testLevel(['#####', '#POt#', '#1.2#', '#####'], '12', [
      { id: 'dim', name: 'Dim', kind: 'closet', rect: { col: 0, row: 0, w: 5, h: 2 } },
      { id: 'lit', name: 'Lit', kind: 'hallway', rect: { col: 0, row: 2, w: 5, h: 2 }, light: 0.9 },
    ]);
    expect(level.props.map((p) => p.defId)).toEqual(['lockers', 'table']);
    expect(tileAt(level, 2, 1)).toBe('prop');
    expect(lightAt(level, 1, 1)).toBe(0.4); // closet default
    expect(lightAt(level, 1, 2)).toBe(0.9); // explicit override
  });

  it('rejects ragged rows, unknown glyphs and missing markers', () => {
    const base = { id: 'x', name: 'x', rooms: [], bossRoute: '' };
    expect(() => parseAsciiLevel({ ...base, map: ['###', '##'] })).toThrow(/length/);
    expect(() => parseAsciiLevel({ ...base, map: ['P?'] })).toThrow(/unknown glyph/);
    expect(() => parseAsciiLevel({ ...base, map: ['P.'], bossRoute: '1' })).toThrow(
      /missing marker/,
    );
    expect(() => parseAsciiLevel({ ...base, map: ['..'] })).toThrow(/player spawn/);
  });

  it('reports unreachable content', () => {
    const level = testLevel(['#########', '#P.V#.F1#', '#Z..#..2#', '#########']);
    const errors = validateLevel(level);
    expect(errors.some((e) => e.includes('drinking-fountain'))).toBe(true);
    expect(errors.some((e) => e.includes('Boss waypoint'))).toBe(false);
  });
});

describe('school level', () => {
  it('passes validation', () => {
    expect(validateLevel(SCHOOL_LEVEL)).toEqual([]);
  });

  it('has the areas from the design board', () => {
    const kinds = new Set(SCHOOL_LEVEL.rooms.map((r) => r.kind));
    for (const k of [
      'exterior',
      'hallway',
      'classroom',
      'boiler',
      'closet',
      'restroom',
      'lounge',
    ]) {
      expect(kinds.has(k as never)).toBe(true);
    }
    const boiler = SCHOOL_LEVEL.rooms.find((r) => r.kind === 'boiler')!;
    const boilerDoors = SCHOOL_LEVEL.doors.filter(
      (d) =>
        d.tile.col >= boiler.rect.col - 1 &&
        d.tile.col <= boiler.rect.col + boiler.rect.w &&
        d.tile.row >= boiler.rect.row - 1 &&
        d.tile.row <= boiler.rect.row + boiler.rect.h,
    );
    expect(boilerDoors).toHaveLength(1); // only one way in/out
    expect(boilerDoors[0]!.locked).toBe(true);
    const inBoiler = SCHOOL_LEVEL.fixtures.filter(
      (f) => roomAt(SCHOOL_LEVEL, f.tile.col, f.tile.row)?.id === 'boiler',
    );
    expect(inBoiler.some((f) => f.defId === 'copper-pile')).toBe(true);
  });

  it('is darkest in the boiler room and furnished for cover', () => {
    const boiler = SCHOOL_LEVEL.rooms.find((r) => r.kind === 'boiler')!;
    const hall = SCHOOL_LEVEL.rooms.find((r) => r.kind === 'hallway')!;
    expect(lightAt(SCHOOL_LEVEL, boiler.rect.col + 1, boiler.rect.row + 1)).toBeLessThan(
      lightAt(SCHOOL_LEVEL, hall.rect.col + 1, hall.rect.row + 1),
    );
    const kinds = new Set(SCHOOL_LEVEL.props.map((p) => p.defId));
    expect(kinds.has('lockers')).toBe(true);
    expect(kinds.has('boiler')).toBe(true);
  });

  it('keeps every fixture type and prop in play', () => {
    const used = new Set(SCHOOL_LEVEL.fixtures.map((f) => f.defId));
    expect([...used].sort()).toEqual(FIXTURES.all.map((f) => f.id).sort());
    const props = new Set(SCHOOL_LEVEL.props.map((p) => p.defId));
    expect([...props].sort()).toEqual(PROPS.all.map((p) => p.id).sort());
  });

  it('is about twice the size of the first school', () => {
    expect(SCHOOL_LEVEL.cols * SCHOOL_LEVEL.rows).toBeGreaterThanOrEqual(1980 * 2);
    expect(SCHOOL_LEVEL.teacherSpawns.length).toBeGreaterThanOrEqual(5);
    expect(SCHOOL_LEVEL.studentSpawns.length).toBeGreaterThanOrEqual(15);
  });

  it('puts the hardest prizes far from the van, behind security doors', () => {
    const van = SCHOOL_LEVEL.vanTiles[0]!;
    const roomOf = (f: { tile: { col: number; row: number } }) =>
      roomAt(SCHOOL_LEVEL, f.tile.col, f.tile.row)!.id;
    const chillers = SCHOOL_LEVEL.fixtures.filter((f) => f.defId === 'chiller');
    const desks = SCHOOL_LEVEL.fixtures.filter((f) => f.defId === 'desk');
    const avgDistance = (list: { tile: { col: number } }[]) =>
      list.reduce((sum, f) => sum + (f.tile.col - van.col), 0) / list.length;
    expect(avgDistance(chillers)).toBeGreaterThan(avgDistance(desks) * 2);
    for (const id of new Set(chillers.map(roomOf))) {
      const room = SCHOOL_LEVEL.rooms.find((r) => r.id === id)!;
      const doors = SCHOOL_LEVEL.doors.filter(
        (d) =>
          d.tile.col >= room.rect.col - 1 &&
          d.tile.col <= room.rect.col + room.rect.w &&
          d.tile.row >= room.rect.row - 1 &&
          d.tile.row <= room.rect.row + room.rect.h,
      );
      expect(doors.every((d) => d.security)).toBe(true);
    }
  });

  it('kits out the restrooms', () => {
    const inRestrooms = SCHOOL_LEVEL.fixtures
      .filter((f) => roomAt(SCHOOL_LEVEL, f.tile.col, f.tile.row)?.kind === 'restroom')
      .map((f) => f.defId);
    for (const id of ['toilet', 'urinal', 'sink', 'hand-dryer']) expect(inRestrooms).toContain(id);
    expect(SCHOOL_LEVEL.props.some((p) => p.defId === 'stall')).toBe(true);
  });
});
