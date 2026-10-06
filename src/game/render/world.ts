import { tileAt } from '@core/level/asciiLevel';
import type { ShiftSession } from '@core/session/ShiftSession';
import * as THREE from 'three';
import { PROPS } from '@core/content/props';
import { mountSide } from '@core/level/footprint';
import type { Footprint } from '@core/model/types';
import { mountRotation, toWorld } from './coords';
import { createFloorTexture, createLightMap } from './floorTexture';
import { shadeWithWorld, type MaterialKit } from './materials';
import {
  buildCoworker,
  buildLockedDoor,
  buildTree,
  buildVan,
  FIXTURE_MODELS,
  PROP_MODELS,
} from './models';
import { PALETTE } from './palette';

export const WALL_HEIGHT = 1.6;
const WALL_CUT_HEIGHT = 0.22;

/**
 * Instanced walls that duck down when they'd hide the player (classic iso "cutaway"), so the
 * camera can stay fixed without the worker vanishing behind the building.
 */
export class WallCutaway {
  readonly mesh: THREE.InstancedMesh;
  private readonly cols: Int16Array;
  private readonly rows: Int16Array;
  private readonly heights: Float32Array;
  private readonly matrix = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();

  constructor(tiles: { col: number; row: number }[], kit: MaterialKit) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    const side = kit.get(PALETTE.wallSide, { roughness: 0.95 });
    const top = kit.get(PALETTE.wallTop, { roughness: 0.9 });
    // BoxGeometry groups: +x, -x, +y (top), -y, +z, -z
    this.mesh = new THREE.InstancedMesh(
      geometry,
      [side, side, top, side, side, side],
      tiles.length,
    );
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.cols = Int16Array.from(tiles.map((t) => t.col));
    this.rows = Int16Array.from(tiles.map((t) => t.row));
    this.heights = new Float32Array(tiles.length).fill(WALL_HEIGHT);
    for (let i = 0; i < tiles.length; i++) this.write(i);
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  private write(i: number) {
    this.pos.set(this.cols[i]! + 0.5, 0, this.rows[i]! + 0.5);
    this.scale.set(1, this.heights[i]!, 1);
    this.matrix.compose(this.pos, this.quat, this.scale);
    this.mesh.setMatrixAt(i, this.matrix);
  }

  /**
   * Lower walls standing between the camera and the player. `toCamera` is the ground-plane
   * direction toward the camera; `across` is screen-right on the ground.
   */
  update(px: number, pz: number, toCamera: THREE.Vector2, across: THREE.Vector2, dt: number) {
    const k = Math.min(1, dt * 10);
    let changed = false;
    for (let i = 0; i < this.heights.length; i++) {
      const dx = this.cols[i]! + 0.5 - px;
      const dz = this.rows[i]! + 0.5 - pz;
      const depth = dx * toCamera.x + dz * toCamera.y;
      const lateral = Math.abs(dx * across.x + dz * across.y);
      const cut = depth > 0.2 && depth < 4.2 && lateral < 2.6 + depth * 0.25;
      const target = cut ? WALL_CUT_HEIGHT : WALL_HEIGHT;
      const h = this.heights[i]!;
      if (Math.abs(h - target) < 0.001) continue;
      this.heights[i] = Math.abs(h - target) < 0.01 ? target : h + (target - h) * k;
      this.write(i);
      changed = true;
    }
    if (changed) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

export interface DoorView {
  id: string;
  root: THREE.Group;
  leaf: THREE.Group;
  /** 0 closed .. 1 swung open. */
  open: number;
}

export interface World {
  walls: WallCutaway;
  doors: DoorView[];
  fixtures: Map<string, THREE.Object3D>;
  coworker: THREE.Group;
  floorTexture: THREE.Texture;
  lightMap: THREE.Texture;
  sun: THREE.DirectionalLight;
}

/** Build the static diorama for a level: floor, walls, furniture, fixtures, van, lights. */
export function buildWorld(scene: THREE.Scene, session: ShiftSession, kit: MaterialKit): World {
  const { level } = session;
  const cols = level.cols;
  const rows = level.rows;

  // Tabletop slab + grass verge.
  const margin = 2;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(cols + margin * 2, 0.6, rows + margin * 2),
    new THREE.MeshStandardMaterial({ color: PALETTE.slab, roughness: 1 }),
  );
  slab.position.set(cols / 2, -0.31, rows / 2);
  slab.receiveShadow = true;
  scene.add(slab);
  const verge = new THREE.Mesh(
    new THREE.BoxGeometry(cols + margin * 2 - 0.2, 0.02, rows + margin * 2 - 0.2),
    kit.get(PALETTE.grass, { roughness: 1 }),
  );
  verge.position.set(cols / 2, -0.02, rows / 2);
  verge.receiveShadow = true;
  scene.add(verge);

  // Floor plan.
  const floorTexture = createFloorTexture(level);
  const floorMat = shadeWithWorld(
    new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.9 }),
    kit.shading,
  );
  const lightMap = createLightMap(level);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(cols, rows), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cols / 2, 0, rows / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // Walls + baseboards.
  const wallTiles: { col: number; row: number }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (tileAt(level, col, row) === 'wall') wallTiles.push({ col, row });
    }
  }
  const walls = new WallCutaway(wallTiles, kit);
  scene.add(walls.mesh);
  const baseboards = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1.03, 0.14, 1.03),
    kit.get(PALETTE.baseboard),
    wallTiles.length,
  );
  const m = new THREE.Matrix4();
  wallTiles.forEach((t, i) =>
    baseboards.setMatrixAt(i, m.makeTranslation(t.col + 0.5, 0.07, t.row + 0.5)),
  );
  baseboards.receiveShadow = true;
  scene.add(baseboards);

  // Fixtures and props.
  // Orientation comes from the same core rule that places the hitbox, so they always match.
  const place = (obj: THREE.Object3D, fp: Footprint, col: number, row: number) => {
    obj.position.set(col + 0.5, 0, row + 0.5);
    if (fp.anchor === 'wall') obj.rotation.y = mountRotation(mountSide(level, col, row));
    scene.add(obj);
  };
  const fixtures = new Map<string, THREE.Object3D>();
  for (const f of session.fixtures) {
    const build = FIXTURE_MODELS[f.def.id];
    if (!build) continue;
    const obj = build(kit);
    place(obj, f.def.footprint, f.tile.col, f.tile.row);
    fixtures.set(f.id, obj);
  }
  for (const p of level.props) {
    const build = PROP_MODELS[p.defId];
    if (build) place(build(kit), PROPS.get(p.defId).footprint, p.tile.col, p.tile.row);
  }

  // Van across its tiles, facing the school.
  if (level.vanTiles.length) {
    const vc = level.vanTiles.map((t) => t.col);
    const vr = level.vanTiles.map((t) => t.row);
    const len = Math.max(...vc) - Math.min(...vc) + 1;
    const wid = Math.max(...vr) - Math.min(...vr) + 1;
    const van = buildVan(kit, len, wid);
    van.position.set(Math.min(...vc) + len / 2, 0, Math.min(...vr) + wid / 2);
    scene.add(van);
  }

  // Locked doors span the gap between their two wall neighbours.
  const doors: DoorView[] = session.doors
    .filter((d) => d.locked)
    .map((d) => {
      const { root, leaf } = buildLockedDoor(kit);
      root.position.set(d.tile.col + 0.5, 0, d.tile.row + 0.5);
      const wallsLeftRight =
        tileAt(level, d.tile.col - 1, d.tile.row) === 'wall' &&
        tileAt(level, d.tile.col + 1, d.tile.row) === 'wall';
      root.rotation.y = wallsLeftRight ? 0 : Math.PI / 2;
      scene.add(root);
      return { id: d.id, root, leaf, open: 0 };
    });

  const coworker = buildCoworker(kit);
  coworker.position.set(toWorld(session.coworker.pos.x), 0, toWorld(session.coworker.pos.y));
  coworker.rotation.y = 0.4;
  scene.add(coworker);

  // A few trees on the verge for the diorama feel.
  for (const [x, z, s] of [
    [-1, 2, 1.1],
    [-1.2, 8, 0.9],
    [-0.9, 24, 1.2],
    [-1.1, 30, 1],
    [cols + 1, 4, 1],
    [cols + 1.1, 18, 1.15],
    [cols + 0.9, 28, 0.95],
    [12, rows + 1, 1],
    [30, rows + 1.1, 1.1],
    [47, rows + 0.9, 0.9],
    [20, -1, 1],
    [40, -1.1, 1.1],
  ] as const) {
    const tree = buildTree(kit, s);
    tree.position.set(x, 0, z);
    scene.add(tree);
  }

  // Lighting: soft sky fill + a warm key light with shadows over the whole map.
  scene.add(new THREE.HemisphereLight(0xe3ecff, 0x40362c, 1.25));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.1);
  sun.position.set(cols / 2 - 18, 34, rows / 2 - 22);
  sun.target.position.set(cols / 2, 0, rows / 2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const ext = Math.max(cols, rows) * 0.62;
  Object.assign(sun.shadow.camera, {
    left: -ext,
    right: ext,
    top: ext,
    bottom: -ext,
    near: 1,
    far: 120,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  sun.shadow.radius = 2.5;
  scene.add(sun, sun.target);

  // Boiler glow.
  const boilers = level.props.filter((p) => p.defId === 'boiler');
  if (boilers.length) {
    const cx = boilers.reduce((s, b) => s + b.tile.col + 0.5, 0) / boilers.length;
    const cz = boilers.reduce((s, b) => s + b.tile.row + 0.5, 0) / boilers.length;
    const glow = new THREE.PointLight(PALETTE.boilerGlow, 4, 6, 1.6);
    glow.position.set(cx, 1.2, cz);
    scene.add(glow);
  }

  return { walls, doors, fixtures, coworker, floorTexture, lightMap, sun };
}
