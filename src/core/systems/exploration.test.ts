import { TILE_SIZE } from '../content/balance';
import { testGrid } from '../test/helpers';
import { decodeExplored, encodeExplored, ExploredMap, tilesInView } from './exploration';
import { visibilityOutline } from './vision';

describe('exploration', () => {
  it('round-trips the explored bitset through its save string', () => {
    const bits = new Uint8Array([0, 0, 1, 1, 1, 0, 1, 0, 0, 0]);
    const encoded = encodeExplored(bits);
    expect(encoded).toBe('2.3.1.1.3');
    expect(decodeExplored(encoded, bits.length)).toEqual(bits);
  });

  it('ignores corrupt saves and saves for a different map', () => {
    expect(decodeExplored('2.x.1', 4)).toBeNull();
    expect(decodeExplored('2.3', 99)).toBeNull();
    expect(decodeExplored(undefined, 4)).toBeNull();
    expect(new ExploredMap(3, 3, 'garbage').fraction).toBe(0);
  });

  it('reveals the room you can see and its walls, not the room behind the wall', () => {
    const grid = testGrid(['#########', '#P..#...#', '#...#...#', '#########'], '');
    const outline = visibilityOutline(
      grid,
      grid.sightCorners,
      { x: 1.5 * TILE_SIZE, y: 1.5 * TILE_SIZE },
      TILE_SIZE * 16,
    );
    const map = new ExploredMap(grid.cols, grid.rows);
    for (const t of tilesInView(outline, grid)) map.mark(t.col, t.row);
    expect(map.has(3, 2)).toBe(true); // far corner of this room
    expect(map.has(4, 1)).toBe(true); // the dividing wall
    expect(map.has(5, 1)).toBe(false); // the next room
    expect(map.has(6, 2)).toBe(false);
  });
});
