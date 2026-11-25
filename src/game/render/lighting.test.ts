import { lightAt } from '@core/level/asciiLevel';
import { SCHOOL_LEVEL } from '@core/level/levels/school';
import type { RoomDef } from '@core/level/types';
import { testLevel } from '@core/test/helpers';
import {
  doorSpill,
  glowSources,
  lampLayout,
  poolFalloff,
  roomFill,
  shownLevel,
  tileFill,
} from './lighting';

// A lit hallway and a dark closet (with a boiler and a desk lamp), joined by an open doorway
// and a locked door.
const MAP = ['###########', '#V....#..B#', '#VP...D...#', '#Z..12L..l#', '###########'];
const ROOMS: RoomDef[] = [
  { id: 'hall', name: 'Hall', kind: 'hallway', rect: { col: 1, row: 1, w: 5, h: 3 } },
  { id: 'closet', name: 'Closet', kind: 'closet', rect: { col: 7, row: 1, w: 3, h: 3 } },
];
const level = testLevel(MAP, '12', ROOMS);
const brightness = (c: readonly number[]) => (c[0]! + c[1]! + c[2]!) / 3;

describe('lighting layout', () => {
  it('draws core light levels brighter as they rise, and never pitch black', () => {
    expect(shownLevel(0)).toBeGreaterThan(0.1);
    expect(shownLevel(0.5)).toBeGreaterThan(shownLevel(0.25));
    expect(shownLevel(1)).toBeGreaterThan(shownLevel(0.5));
  });

  it('hangs lamps inside every lit room, brighter where the room is', () => {
    const lamps = lampLayout(level);
    for (const room of ROOMS) {
      const { col, row, w, h } = room.rect;
      const mine = lamps.filter((l) => l.roomId === room.id);
      expect(mine.length).toBeGreaterThan(0);
      for (const l of mine) {
        expect(l.x).toBeGreaterThan(col);
        expect(l.x).toBeLessThan(col + w);
        expect(l.y).toBeGreaterThan(row);
        expect(l.y).toBeLessThan(row + h);
      }
    }
    const hall = lamps.find((l) => l.roomId === 'hall')!;
    const closet = lamps.find((l) => l.roomId === 'closet')!;
    expect(brightness(hall.color)).toBeGreaterThan(brightness(closet.color));
    expect(hall.fitting).toBe('panel');
    expect(closet.fitting).toBe('bulb');
  });

  it("keeps a room's average at the level core gives it", () => {
    // Fill plus every pool, averaged over the floor of each of the school's rooms.
    const lamps = lampLayout(SCHOOL_LEVEL);
    for (const room of SCHOOL_LEVEL.rooms) {
      const mine = lamps.filter((l) => l.roomId === room.id);
      if (mine.length === 0) continue;
      const { col, row, w, h } = room.rect;
      const fill = brightness(roomFill(SCHOOL_LEVEL, room));
      let sum = 0;
      let peak = 0;
      let n = 0;
      for (let y = row + 0.25; y < row + h; y += 0.5) {
        for (let x = col + 0.25; x < col + w; x += 0.5) {
          let here = fill;
          for (const l of mine) {
            here += brightness(l.color) * poolFalloff(Math.hypot(x - l.x, y - l.y), l.radius);
          }
          sum += here;
          peak = Math.max(peak, here);
          n++;
        }
      }
      const shown = shownLevel(lightAt(SCHOOL_LEVEL, col, row));
      expect(sum / n / shown, room.id).toBeCloseTo(1, 2);
      // Nothing burns out: no spot is far brighter than its room, bar a lamp's pool in a dim one.
      expect(peak, room.id).toBeLessThan(Math.max(1.4 * shown, 0.95) + 0.01);
      // And lamps do make pools: the brightest spot stands clear of the average.
      expect(peak / shown, room.id).toBeGreaterThan(1.1);
    }
  });

  it('has no ceiling lamps outdoors or in the boiler room', () => {
    const lamps = lampLayout(SCHOOL_LEVEL);
    const unlit = SCHOOL_LEVEL.rooms.filter((r) => r.kind === 'exterior' || r.kind === 'boiler');
    expect(unlit.length).toBeGreaterThan(0);
    for (const room of unlit) expect(lamps.some((l) => l.roomId === room.id)).toBe(false);
  });

  it('lets boilers and desk lamps glow', () => {
    const glow = glowSources(level);
    expect(glow).toHaveLength(2);
    expect(glow.map((g) => [g.x, g.y])).toEqual([
      [9.5, 1.5],
      [9.5, 3.5],
    ]);
    // Firelight is orange.
    expect(glow[0]!.color[0]).toBeGreaterThan(glow[0]!.color[2] * 3);
  });

  it('spills light through an open doorway into the darker room, and not through a locked door', () => {
    const open = (col: number, row: number) => !(col === 6 && row === 3);
    const spill = doorSpill(level, open);
    expect(spill).toHaveLength(1);
    const s = spill[0]!;
    // Standing at the hallway's edge of the doorway, shining east into the closet.
    expect(s.y).toBeCloseTo(2.5);
    expect(s.x).toBeGreaterThan(6);
    expect(s.x).toBeLessThan(6.5);
    expect(Math.cos(s.cone!.facing)).toBeCloseTo(1);
    // Unlock the other door and it spills too.
    expect(doorSpill(level, () => true)).toHaveLength(2);
    // Two rooms equally bright have nothing to spill.
    const same = testLevel(MAP, '12', [ROOMS[0]!, { ...ROOMS[1]!, kind: 'hallway' }]);
    expect(doorSpill(same, () => true)).toHaveLength(0);
  });

  it('fills a doorway between rooms with the average of its sides', () => {
    const hall = brightness(roomFill(level, ROOMS[0]!));
    const closet = brightness(roomFill(level, ROOMS[1]!));
    expect(brightness(tileFill(level, 6, 2))).toBeCloseTo((hall + closet) / 2);
    expect(brightness(tileFill(level, 3, 2))).toBeCloseTo(hall);
  });
});
