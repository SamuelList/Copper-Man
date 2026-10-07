import { BALANCE, TILE_SIZE } from '@core/content/balance';
import type { ShiftSession } from '@core/session/ShiftSession';
import * as THREE from 'three';
import type { MaterialKit } from './materials';
import { buildWetFloorSign } from './models';

/**
 * Freshly mopped floor: glossy puddles on the wet tiles you can see (shrinking as they dry) and
 * a yellow sign by the newest one.
 */
export class WetFloors {
  readonly group = new THREE.Group();
  private readonly puddles: THREE.Mesh[] = [];
  private readonly sign: THREE.Group;

  constructor(kit: MaterialKit) {
    const geometry = new THREE.CircleGeometry(0.46, 20);
    geometry.rotateX(-Math.PI / 2);
    const material = kit.get(0x9fd3f2, {
      opacity: 0.4,
      roughness: 0.04,
      metalness: 0.3,
      flat: false,
    });
    for (let i = 0; i < BALANCE.custodian.maxWetTiles; i++) {
      const puddle = new THREE.Mesh(geometry, material);
      puddle.visible = false;
      puddle.receiveShadow = true;
      puddle.renderOrder = 2;
      this.puddles.push(puddle);
      this.group.add(puddle);
    }
    this.sign = buildWetFloorSign(kit);
    this.sign.visible = false;
    this.group.add(this.sign);
  }

  update(session: ShiftSession) {
    const cols = session.level.cols;
    let i = 0;
    let newest: { col: number; row: number } | null = null;
    for (const [k, left] of session.wet) {
      const puddle = this.puddles[i++];
      if (!puddle) break;
      const col = k % cols;
      const row = Math.floor(k / cols);
      // Only what you can see right now: a remembered room doesn't show fresh mopping.
      const center = { x: (col + 0.5) * TILE_SIZE, y: (row + 0.5) * TILE_SIZE };
      puddle.visible = session.isVisibleToPlayer(center);
      puddle.position.set(col + 0.5, 0.012, row + 0.5);
      // Shrinks over the last few seconds as it dries.
      puddle.scale.setScalar(Math.min(1, 0.3 + left / 6));
      if (puddle.visible) newest = { col, row };
    }
    for (; i < this.puddles.length; i++) this.puddles[i]!.visible = false;
    this.sign.visible = newest !== null;
    if (newest) this.sign.position.set(newest.col + 0.25, 0, newest.row + 0.25);
  }
}
