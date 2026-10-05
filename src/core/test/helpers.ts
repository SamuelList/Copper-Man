import { TILE_SIZE } from '../content/balance';
import { parseAsciiLevel } from '../level/asciiLevel';
import type { RoomDef } from '../level/types';
import type { PlayerInput } from '../session/types';
import { LevelGrid } from '../session/levelGrid';

/** Build a test level from ASCII; one room covers the whole map unless rooms are given. */
export function testLevel(map: string[], bossRoute = '12', rooms?: RoomDef[]) {
  return parseAsciiLevel({
    id: 'test',
    name: 'Test',
    map,
    bossRoute,
    rooms: rooms ?? [
      {
        id: 'all',
        name: 'Everywhere',
        kind: 'hallway',
        rect: { col: 0, row: 0, w: map[0]!.length, h: map.length },
      },
    ],
  });
}

export const testGrid = (map: string[], bossRoute = '12') =>
  new LevelGrid(testLevel(map, bossRoute), TILE_SIZE);

export const input = (overrides: Partial<PlayerInput> = {}): PlayerInput => ({
  moveX: 0,
  moveY: 0,
  sprint: false,
  interact: false,
  ability: false,
  ...overrides,
});

export const center = (col: number, row: number) => ({
  x: (col + 0.5) * TILE_SIZE,
  y: (row + 0.5) * TILE_SIZE,
});
