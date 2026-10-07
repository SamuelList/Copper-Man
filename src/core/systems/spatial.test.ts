import { TILE_SIZE } from '../content/balance';
import { center, testGrid } from '../test/helpers';
import { moveWithCollision } from './movement';
import { findPath } from './pathfinding';
import { footprintBox } from '../level/footprint';
import { distanceToBox } from '../level/grid';
import { detectionRate, effectiveRange } from './detection';
import {
  canSee,
  castRay,
  hasLineOfSight,
  inCone,
  visibilityOutline,
  visionPolygon,
} from './vision';

const MAP = ['#########', '#1..#...#', '#...#...#', '#......P#', '#2..#...#', '#########'];

describe('vision', () => {
  const grid = testGrid(MAP);

  it('is blocked by walls', () => {
    expect(hasLineOfSight(grid, center(1, 1), center(3, 1))).toBe(true);
    expect(hasLineOfSight(grid, center(2, 1), center(6, 1))).toBe(false);
    expect(hasLineOfSight(grid, center(2, 3), center(6, 3))).toBe(true);
  });

  it('respects cone angle and range', () => {
    const cone = { pos: center(1, 3), facing: 0, fov: Math.PI / 2, range: TILE_SIZE * 4 };
    expect(inCone(cone, center(3, 3))).toBe(true);
    expect(inCone(cone, center(1, 1))).toBe(false); // behind/side
    expect(inCone(cone, center(7, 3))).toBe(false); // too far
    expect(canSee(grid, { ...cone, range: TILE_SIZE * 10 }, center(7, 3))).toBe(true);
  });

  it('casts rays to the first wall', () => {
    const d = castRay(grid, center(1, 1), 0, 1000);
    expect(d).toBeCloseTo(TILE_SIZE * 2.5); // wall at col 4 starts 2.5 tiles from col 1 centre
  });

  it('builds an exact outline whose shadow edges land on wall corners', () => {
    const origin = center(2, 3);
    const outline = visibilityOutline(grid, grid.sightCorners, origin, TILE_SIZE * 20);
    // The doorway corners of the dividing wall (col 4, rows 2 and 4) must appear exactly.
    const hasPoint = (x: number, y: number) =>
      outline.some((p) => Math.abs(p.x - x) < 0.5 && Math.abs(p.y - y) < 0.5);
    expect(hasPoint(4 * TILE_SIZE, 3 * TILE_SIZE)).toBe(true);
    expect(hasPoint(4 * TILE_SIZE, 4 * TILE_SIZE)).toBe(true);
    // Nothing leaks through walls: every outline point is visible from the origin.
    for (const p of outline) {
      const inward = { x: p.x + (origin.x - p.x) * 0.01, y: p.y + (origin.y - p.y) * 0.01 };
      expect(hasLineOfSight(grid, origin, inward)).toBe(true);
    }
  });

  it('clips a cone outline to its field of view', () => {
    const cone = { pos: center(2, 3), facing: 0, fov: 1, range: 100 };
    const poly = visionPolygon(grid, grid.sightCorners, cone);
    expect(poly[0]).toEqual(cone.pos);
    for (const p of poly.slice(1)) {
      // Tiny tolerance: edge rays sit exactly on the cone boundary.
      expect(inCone({ ...cone, fov: cone.fov + 1e-6, range: cone.range + 1e-6 }, p)).toBe(true);
    }
  });
});

describe('furniture and sight', () => {
  // A desk (k) in the top row; lockers (O) backed onto the south wall, half a tile deep.
  const grid = testGrid(['#########', '#1....k.#', '#2......#', '#...O..P#', '#########']);
  const at = (col: number, row: number) => ({ x: col * TILE_SIZE, y: row * TILE_SIZE });
  const cone = (pos: { x: number; y: number }) => ({
    pos,
    facing: 0,
    fov: Math.PI / 2,
    range: TILE_SIZE * 10,
  });

  it('sees straight over a desk', () => {
    expect(canSee(grid, cone(center(1, 1)), center(7, 1))).toBe(true);
  });

  it('is blocked by the real shape of tall furniture', () => {
    expect(canSee(grid, cone(at(1.5, 3.8)), at(7.5, 3.8))).toBe(false); // through the lockers
    expect(canSee(grid, cone(at(1.5, 3.2)), at(7.5, 3.2))).toBe(true); // past their open half
  });
});

describe('detection zones and light', () => {
  const range = TILE_SIZE * 6;
  const base = { range, fillRate: 1, light: 1 };

  it('spots fastest in the near zone', () => {
    const near = detectionRate({ ...base, distance: TILE_SIZE });
    const far = detectionRate({ ...base, distance: range * 0.9 });
    expect(near).toBeGreaterThan(far * 2);
  });

  it('is slower and shorter-ranged in the dark', () => {
    const lit = detectionRate({ ...base, distance: TILE_SIZE * 4 });
    const dark = detectionRate({ ...base, distance: TILE_SIZE * 4, light: 0.2 });
    expect(dark).toBeLessThan(lit * 0.6);
    expect(effectiveRange(range, 0)).toBeLessThan(range);
    expect(effectiveRange(range, 1)).toBe(range);
  });
});

describe('pathfinding', () => {
  const grid = testGrid(MAP);
  const passable = (c: number, r: number) => !grid.isSolid(c, r);

  it('finds a path around walls', () => {
    const path = findPath(grid.cols, grid.rows, passable, { col: 1, row: 1 }, { col: 6, row: 1 });
    expect(path).not.toBeNull();
    expect(path!.at(-1)).toEqual({ col: 6, row: 1 });
    expect(path!.every((t) => passable(t.col, t.row))).toBe(true);
    expect(path!.some((t) => t.row === 3)).toBe(true); // must go through the gap
  });

  it('returns null for unreachable goals and [] for start === goal', () => {
    expect(
      findPath(grid.cols, grid.rows, passable, { col: 1, row: 1 }, { col: 4, row: 1 }),
    ).toBeNull();
    expect(
      findPath(grid.cols, grid.rows, passable, { col: 1, row: 1 }, { col: 1, row: 1 }),
    ).toEqual([]);
  });
});

describe('movement', () => {
  const grid = testGrid(MAP);
  const r = TILE_SIZE * 0.22;

  it('stops at walls instead of passing through', () => {
    const start = center(3, 1);
    const end = moveWithCollision(grid, start, r, 200, 0);
    expect(end.x + r).toBeLessThanOrEqual(4 * TILE_SIZE + 0.5);
    expect(end.y).toBeCloseTo(start.y);
  });

  it('moves freely in open space', () => {
    const start = center(2, 3);
    const end = moveWithCollision(grid, start, r, 10, -5);
    expect(end.x).toBeCloseTo(start.x + 10);
    expect(end.y).toBeCloseTo(start.y - 5);
  });

  it('runs down a hallway at full speed when pushing diagonally into the wall', () => {
    const hall = testGrid(['############', '#1........P#', '#2.........#', '############']);
    const start = { x: 2.5 * TILE_SIZE, y: 1.3 * TILE_SIZE };
    // Up-right (45° into the north wall): should carry along the wall at the full step length.
    let p = start;
    for (let i = 0; i < 20; i++)
      p = moveWithCollision(hall, p, r, 3 * Math.SQRT1_2, -3 * Math.SQRT1_2);
    expect(p.x - start.x).toBeGreaterThan(20 * 3 * 0.95);
    expect(p.y - r).toBeGreaterThanOrEqual(TILE_SIZE - 0.5); // never inside the wall
  });

  it('rounds corners instead of snagging on them', () => {
    // Graze the bottom corner of the dividing wall (col 4, rows 1-2) while heading east
    // through the gap: the round body is nudged past instead of stopping dead.
    let p = { x: 3.5 * TILE_SIZE, y: 3.15 * TILE_SIZE };
    for (let i = 0; i < 30; i++) p = moveWithCollision(grid, p, r, 2, 0.2);
    expect(p.x).toBeGreaterThan(5 * TILE_SIZE);
  });

  it('does not tunnel through thin objects on a huge step', () => {
    // The air line at (3,2) has no wall to back onto, so it sits centred on its tile.
    const level = testGrid(['#######', '#P....#', '#..A..#', '#1...2#', '#######']);
    const start = { x: 3.5 * TILE_SIZE, y: 1.4 * TILE_SIZE };
    const end = moveWithCollision(level, start, r, 0, TILE_SIZE * 3, false);
    const box = level.solidBoxesAt(3, 2)[0]!;
    expect(end.y + r).toBeLessThanOrEqual(box.minY + 0.5);
  });
});

describe('footprints', () => {
  const ts = TILE_SIZE;
  const fp = { w: 0.5, d: 0.25, anchor: 'wall' as const };

  it('places wall-anchored objects flush against the wall they back onto', () => {
    expect(footprintBox(fp, 2, 2, 'north', ts)).toEqual({
      minX: 2.25 * ts,
      maxX: 2.75 * ts,
      minY: 2 * ts,
      maxY: 2.25 * ts,
    });
    expect(footprintBox(fp, 2, 2, 'south', ts).maxY).toBe(3 * ts);
    expect(footprintBox(fp, 2, 2, 'west', ts)).toEqual({
      minX: 2 * ts,
      maxX: 2.25 * ts,
      minY: 2.25 * ts,
      maxY: 2.75 * ts,
    });
    expect(footprintBox(fp, 2, 2, 'east', ts).maxX).toBe(3 * ts);
  });

  it('centres free-standing objects, and wall objects with no wall', () => {
    const box = footprintBox({ w: 0.5, d: 0.5, anchor: 'center' }, 1, 1, 'north', ts);
    expect(box).toEqual({ minX: 1.25 * ts, maxX: 1.75 * ts, minY: 1.25 * ts, maxY: 1.75 * ts });
    expect(footprintBox(fp, 1, 1, null, ts).minY).toBeCloseTo(1.375 * ts);
  });

  it('measures interaction reach from the edge of a box', () => {
    const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    expect(distanceToBox(box, 5, 5)).toBe(0);
    expect(distanceToBox(box, 13, 14)).toBe(5);
  });
});
