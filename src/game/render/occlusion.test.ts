import { center, testGrid } from '@core/test/helpers';
import { TILE_SIZE } from '@core/content/balance';
import { TileVisibility } from './occlusion';

// Two rooms joined by a doorway, and a third sealed off.
const MAP = ['#############', '#V...#....#.#', '#VP..D....#.#', '#Z...#..12#.#', '#############'];

const RANGE = TILE_SIZE * 40;

describe('TileVisibility', () => {
  it('sees the room you are in, its walls, and through an open doorway', () => {
    const vis = new TileVisibility(testGrid(MAP));
    vis.update(center(2, 2), RANGE);
    expect(vis.has(3, 1)).toBe(true); // across the room
    expect(vis.has(2, 0)).toBe(true); // the wall beside you
    expect(vis.has(1, 2)).toBe(true); // the van
    expect(vis.has(0, 2)).toBe(false); // …and not the wall behind it
    expect(vis.has(5, 2)).toBe(true); // the doorway
    expect(vis.has(8, 2)).toBe(true); // straight through it
    expect(vis.has(10, 2)).toBe(true); // the far wall of the next room
  });

  it('does not see behind walls', () => {
    const vis = new TileVisibility(testGrid(MAP));
    vis.update(center(2, 2), RANGE);
    expect(vis.has(11, 2)).toBe(false); // the sealed room
    // From the far corner of the first room, most of the second is hidden by the wall between.
    vis.invalidate();
    vis.update(center(1, 3), RANGE);
    expect(vis.has(6, 3)).toBe(false);
    expect(vis.anyIn(11, 1, 11, 3)).toBe(false);
  });

  it('answers for whole areas, clamped to the map', () => {
    const vis = new TileVisibility(testGrid(MAP));
    vis.update(center(2, 2), RANGE);
    expect(vis.anyIn(6, 1, 9, 3)).toBe(true);
    expect(vis.anyIn(11, 1, 30, 30)).toBe(false);
    expect(vis.anyIn(-5, -5, 4, 0)).toBe(true); // the north wall, reaching off the map
  });

  it('only recomputes once the eye has moved', () => {
    const vis = new TileVisibility(testGrid(MAP));
    const eye = center(2, 2);
    expect(vis.update(eye, RANGE)).toBe(true);
    expect(vis.update({ x: eye.x + 0.2, y: eye.y }, RANGE)).toBe(false);
    expect(vis.update({ x: eye.x + 3, y: eye.y }, RANGE)).toBe(true);
    vis.invalidate();
    expect(vis.update({ x: eye.x + 3, y: eye.y }, RANGE)).toBe(true);
  });
});
