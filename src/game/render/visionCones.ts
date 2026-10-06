import type { BossMode } from '@core/ai/bossBrain';
import { BALANCE } from '@core/content/balance';
import type { Grid } from '@core/level/grid';
import type { Vec2 } from '@core/model/types';
import { visionPolygon, type ViewCone } from '@core/systems/vision';
import * as THREE from 'three';
import { toWorld } from './coords';
import { PALETTE } from './palette';

const MAX_POINTS = 400;
const FLOOR_Y = 0.025;

/** A dynamic fan mesh on the floor with per-vertex alpha (bright at the eyes, fading out). */
class FanMesh {
  readonly mesh: THREE.Mesh;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly geometry: THREE.BufferGeometry;

  constructor(renderOrder: number) {
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(MAX_POINTS * 3 * 3);
    this.colors = new Float32Array(MAX_POINTS * 3 * 4);
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 4));
    const material = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
  }

  set(points: Vec2[], color: THREE.Color, centerAlpha: number, edgeAlpha: number) {
    const [o, ...rim] = points;
    const tris = Math.min(rim.length - 1, MAX_POINTS - 1);
    if (!o || tris <= 0) {
      this.geometry.setDrawRange(0, 0);
      return;
    }
    const P = this.positions;
    const C = this.colors;
    let v = 0;
    const put = (p: Vec2, a: number) => {
      P[v * 3] = toWorld(p.x);
      P[v * 3 + 1] = FLOOR_Y;
      P[v * 3 + 2] = toWorld(p.y);
      C[v * 4] = color.r;
      C[v * 4 + 1] = color.g;
      C[v * 4 + 2] = color.b;
      C[v * 4 + 3] = a;
      v++;
    };
    for (let i = 0; i < tris; i++) {
      put(o, centerAlpha);
      put(rim[i]!, edgeAlpha);
      put(rim[i + 1]!, edgeAlpha);
    }
    this.geometry.setDrawRange(0, v);
    this.geometry.attributes.position!.needsUpdate = true;
    this.geometry.attributes.color!.needsUpdate = true;
  }

  dispose() {
    this.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

const BOSS_COLORS: Record<BossMode, number> = {
  patrol: PALETTE.coneBoss,
  inspect: PALETTE.coneBoss,
  guard: PALETTE.coneSuspicious,
  suspicious: PALETTE.coneSuspicious,
  investigate: PALETTE.coneSuspicious,
  search: PALETTE.coneSuspicious,
  chase: PALETTE.coneChase,
};

/**
 * Wall-clipped NPC vision on the floor: a soft far zone and a brighter near zone where you're
 * spotted fast. Exact outlines come from core's visibility math.
 */
export class VisionCone {
  readonly group = new THREE.Group();
  private readonly far = new FanMesh(2);
  private readonly near = new FanMesh(3);
  private readonly color = new THREE.Color();

  constructor() {
    this.group.add(this.far.mesh, this.near.mesh);
  }

  update(grid: Grid, corners: readonly Vec2[], cone: ViewCone, hex: number, intensity: number) {
    this.color.setHex(hex);
    const farPts = visionPolygon(grid, corners, cone);
    const nearPts = visionPolygon(
      grid,
      corners,
      cone,
      cone.range * BALANCE.npc.vision.nearFraction,
    );
    this.far.set(farPts, this.color, 0.3 * intensity, 0.06 * intensity);
    this.near.set(nearPts, this.color, 0.42 * intensity, 0.22 * intensity);
  }

  static bossColor(mode: BossMode) {
    return BOSS_COLORS[mode];
  }

  dispose() {
    this.far.dispose();
    this.near.dispose();
  }
}
