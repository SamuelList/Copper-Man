import * as THREE from 'three';
import { IsoCamera } from './isoCamera';
import { createWorldShading, MaterialKit } from './materials';
import { WALL_HEIGHT, WallCutaway } from './world';

const iso = new IsoCamera();

/** Height of each wall after the cutaway settles around a player standing at (px, pz). */
function settle(tiles: { col: number; row: number }[], px: number, pz: number) {
  const walls = new WallCutaway(tiles, new MaterialKit(createWorldShading(20, 20)));
  for (let i = 0; i < 60; i++) walls.update(px, pz, iso.toCamera, iso.screenRight, 1 / 30);
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  return tiles.map((_, i) => {
    walls.mesh.getMatrixAt(i, m);
    m.decompose(pos, new THREE.Quaternion(), scale);
    return scale.y;
  });
}

describe('WallCutaway', () => {
  // Player in the middle of tile (10, 10). The camera looks north-east from the south-west, so
  // walls to the south and west are in front of (below) the player on screen.
  const px = 10.5;
  const pz = 10.5;

  it('drops walls in front of the player that would hide them', () => {
    const [south, west, southWest] = settle(
      [
        { col: 10, row: 11 },
        { col: 9, row: 10 },
        { col: 9, row: 11 },
      ],
      px,
      pz,
    );
    expect(south).toBeLessThan(WALL_HEIGHT / 2);
    expect(west).toBeLessThan(WALL_HEIGHT / 2);
    expect(southWest).toBeLessThan(WALL_HEIGHT / 2);
  });

  it('keeps walls behind and beside the player standing', () => {
    const heights = settle(
      [
        { col: 10, row: 9 }, // north: behind
        { col: 11, row: 10 }, // east: behind
        { col: 11, row: 9 }, // north-east: behind
        { col: 8, row: 9 }, // the corridor's far wall, off to the lower left
        { col: 12, row: 11 }, // off to the lower right
      ],
      px,
      pz,
    );
    for (const h of heights) expect(h).toBeCloseTo(WALL_HEIGHT);
  });
});
