import { parseAsciiLevel } from '../asciiLevel';
import type { RoomDef } from '../types';

/**
 * Lincoln Elementary — the vertical-slice map, laid out from the design board:
 * - Parking lot with the van (start + where scrap is sold).
 * - Hallways: higher-value fixtures, patrolled by the boss.
 * - Classrooms: basic items (desks, lamps, radiators), safer from the boss.
 * - Boiler room: single locked entrance, copper piles — high risk, high reward.
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
  '========#..........#.........#F..#.......#....#.........C..#',
  '========#..k..k....#..k..k...#...#.......#....#............#',
  '========#...S......#.........#...#.......#....#............#',
  '========#..k..k....#..k..k...D...D.......#....#...........A#',
  '========#..........#....S....#...#.......#....#............#',
  '========#..k..k....#..k..k...#...#.......#....#............#',
  '========#.......S..#.........#...#.......#....#...C........#',
  '========#..........#.........#...#.......#..Z.#............#',
  '========#........l.#.l.......#...#.......#....#..........Z.#',
  '========#..........#.........#...#.T.....#....#............#',
  '========######D#########D#####...###D#######L#######L#######',
  '========#...........F........................F...........A.#',
  '==VVV=P=D......................2........S..................#',
  '==VVV===D..1............................................4..#',
  '========#........H........H..............H.................#',
  '========######D#########D#####...#####D#########L######D####',
  '========#..........#.........#...#...........#.....#.......#',
  '========#..........#.........#...#...........#.....#.......#',
  '========#..........#.........#...#..F...k.l..#.....#.......#',
  '========#..k..k....#..k..k...#...#...........#.....#..k....#',
  '========#..........#.........#...#...........#A....#.......#',
  '========#..k.Sk....#..k..k...#...#.....6.....#.....#..k....#',
  '========#..........#.........D...D...........#.....#...S...#',
  '========#..k..k....#..k..k...#...#...........#....M#..k....#',
  '========#..........#.........#...#.........H.#.....#.......#',
  '========#..k..k....#..kS.k...#..H#...........#.....#..k....#',
  '========#..........#.........#...#...........#.....#.......#',
  '========#........l.#.......l.#.5.#.Z.........#..Z..#.....l.#',
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
