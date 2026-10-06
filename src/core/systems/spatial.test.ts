import { TILE_SIZE } from '../content/balance';
import { center, testGrid } from '../test/helpers';
import { moveWithCollision } from './movement';
import { findPath } from './pathfinding';
import { detectionRate, effectiveRange } from './detection';
import {
  canSee,
  castRay,
  hasLineOfSight,
  inCone,
  lineOfSight,
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

describe('cover and crouching', () => {
  // A desk (k) sits between the observer (left) and the target spot right behind it.
  const grid = testGrid(['#########', '#1....k.#', '#2.....P#', '#########']);
  const observer = center(1, 1);
  const behindDesk = center(7, 1);
  const farFromDesk = center(4, 1);

  it('hides a crouching target close behind low cover', () => {
    expect(lineOfSight(grid, observer, behindDesk, false)).toBe(true);
    expect(lineOfSight(grid, observer, behindDesk, true)).toBe(false);
  });

  it('does not hide a crouching target far from the cover', () => {
    expect(lineOfSight(grid, observer, farFromDesk, true)).toBe(true);
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
