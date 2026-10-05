import { TILE_SIZE } from '../content/balance';
import { center, testGrid } from '../test/helpers';
import { moveWithCollision } from './movement';
import { findPath } from './pathfinding';
import { canSee, castRay, hasLineOfSight, inCone, visionPolygon } from './vision';

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
    const poly = visionPolygon(grid, { pos: center(2, 3), facing: 0, fov: 1, range: 100 }, 8);
    expect(poly).toHaveLength(10);
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
  const r = TILE_SIZE * 0.3;

  it('slides along walls instead of passing through', () => {
    const start = center(3, 1);
    const end = moveWithCollision(grid, start, r, 200, 0);
    expect(end.x + r).toBeLessThanOrEqual(4 * TILE_SIZE);
    expect(end.y).toBe(start.y);
  });

  it('moves freely in open space', () => {
    const start = center(2, 3);
    const end = moveWithCollision(grid, start, r, 10, -5);
    expect(end.x).toBeCloseTo(start.x + 10);
    expect(end.y).toBeCloseTo(start.y - 5);
  });
});
