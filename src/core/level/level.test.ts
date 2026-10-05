import { testLevel } from '../test/helpers';
import { parseAsciiLevel, roomAt, tileAt, validateLevel } from './asciiLevel';
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

  it('keeps every fixture type in play', () => {
    const used = new Set(SCHOOL_LEVEL.fixtures.map((f) => f.defId));
    expect(used.size).toBeGreaterThanOrEqual(9);
  });
});
