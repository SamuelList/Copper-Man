import { parseAsciiLevel } from '../asciiLevel';
import type { RoomDef } from '../types';

/**
 * Lincoln Elementary — the vertical-slice map, laid out from the design board:
 * - Parking lot with the van (start + where scrap is sold).
 * - Hallways: higher-value fixtures, patrolled by the boss.
 * - Classrooms: basic items (desks, lamps, radiators), safer from the boss.
 * - Boiler room: single locked entrance, copper piles — high risk, high reward. Dark, with
 *   boilers to hide behind.
 * - Lockers, shelves and boilers block sight; desks, tables, benches and planters are cover.
 * See asciiLevel.ts for the legend.
 */
const rooms: RoomDef[] = [
  { id: 'parking', name: 'Parking Lot', kind: 'exterior', rect: { col: 0, row: 0, w: 8, h: 33 } },
  {
    id: 'main-hall',
    name: 'Main Hallway',
    kind: 'hallway',
    rect: { col: 8, row: 14, w: 51, h: 4 },
  },
  {
    id: 'center-hall',
    name: 'Center Hallway',
    kind: 'hallway',
    rect: { col: 30, row: 1, w: 3, h: 31 },
  },
  {
    id: 'class-101',
    name: 'Classroom 101',
    kind: 'classroom',
    rect: { col: 9, row: 1, w: 10, h: 12 },
  },
  {
    id: 'class-102',
    name: 'Classroom 102',
    kind: 'classroom',
    rect: { col: 20, row: 1, w: 9, h: 12 },
  },
  { id: 'restrooms', name: 'Restrooms', kind: 'restroom', rect: { col: 34, row: 1, w: 7, h: 12 } },
  { id: 'janitor', name: 'Janitor Closet', kind: 'closet', rect: { col: 42, row: 1, w: 4, h: 12 } },
  { id: 'boiler', name: 'Boiler Room', kind: 'boiler', rect: { col: 47, row: 1, w: 12, h: 12 } },
  {
    id: 'class-103',
    name: 'Classroom 103',
    kind: 'classroom',
    rect: { col: 9, row: 19, w: 10, h: 13 },
  },
  {
    id: 'class-104',
    name: 'Classroom 104',
    kind: 'classroom',
    rect: { col: 20, row: 19, w: 9, h: 13 },
  },
  {
    id: 'lounge',
    name: "Teachers' Lounge",
    kind: 'lounge',
    rect: { col: 34, row: 19, w: 11, h: 13 },
  },
  { id: 'supply', name: 'Supply Closet', kind: 'closet', rect: { col: 46, row: 19, w: 5, h: 13 } },
  {
    id: 'class-105',
    name: 'Classroom 105',
    kind: 'classroom',
    rect: { col: 52, row: 19, w: 7, h: 13 },
  },
];

// prettier-ignore
const map = [
  '========####################################################',
  '========#..R....R..#..R...R..#...#.T.T.T.#.M.M#..A...A.....#',
  '========#..........#.........#.3.#.......#....#............#',
  '=======p#..........#.........#F..#.......#....#.........C..#',
  '========#..k..k....#..k..k...#...#.......#....#............#',
  '========#...S......#.........#...#.......#h...#....BB......#',
  '=======p#..k..k....#..k..k...D...D.......#h...#....BB.....A#',
  '========#..........#....S....#...#.......#....#............#',
  '========#..k..k....#..k..k...#..O#.......#....#........BB..#',
  '========#.......S..#.........#..O#.......#....#...C....BB..#',
  '=======p#..........#.........#..O#.......#..Z.#............#',
  '========#........l.#.l.......#..O#.......#....#..........Z.#',
  '========#..........#.........#...#.T.....#....#............#',
  '========######D#########D#####...###D#######L#######L#######',
  '========#.OOO...b...F......OO.........OOO....F..OOO......A.#',
  '==VVV=P=D......................2........S..................#',
  '==VVV===D..1............................................4..#',
  '========#........H...OOO..H.......OOO....H..OO.....OOO.....#',
  '========######D#########D#####...#####D#########L######D####',
  '========#..........#.........#...#...........#.....#.......#',
  '========#..........#.........#O..#...........#...hh#.......#',
  '=======p#..........#.........#O..#..F...k.l..#.....#.......#',
  '========#..k..k....#..k..k...#O..#...........#.....#..k....#',
  '========#..........#.........#O..#.......tt..#A....#.......#',
  '========#..k.Sk....#..k..k...#...#.....6.....#.....#..k....#',
  '=======p#..........#.........D...D...........#.....#...S...#',
  '========#..k..k....#..k..k...#...#...........#....M#..k....#',
  '========#..........#.........#...#..tt.....H.#.....#.......#',
  '========#..k..k....#..kS.k...#..H#..tt.......#h....#..k....#',
  '=======p#..........#.........#...#...........#h....#.......#',
  '========#........l.#.......l.#.5.#.Z....bbbb.#..Z..#.....l.#',
  '========#..R....R..#..R...R..#...#...........#.....#..R..R.#',
  '========####################################################',
];

export const SCHOOL_LEVEL = parseAsciiLevel({
  id: 'school',
  name: 'Lincoln Elementary',
  map,
  rooms,
  bossRoute: '123242652',
});
