import { PROPS } from '@core/content/props';
import { roomAt, tileAt } from '@core/level/asciiLevel';
import { mountSide } from '@core/level/footprint';
import type { LevelDef, RoomDef } from '@core/level/types';
import type { Footprint } from '@core/model/types';
import type { ShiftSession } from '@core/session/ShiftSession';
import * as THREE from 'three';
import { bake, batchStatic } from './batching';
import { mountRotation, toWorld } from './coords';
import { createFloorTexture, createLightMap } from './floorTexture';
import { shadeWithWorld, type MaterialKit } from './materials';
import {
  buildBush,
  buildCoworker,
  buildLampPost,
  buildLockedDoor,
  buildTree,
  buildVan,
  chalkboardSlice,
  DECOR,
  fireMaterial,
  FIXTURE_MODELS,
  PROP_MODELS,
} from './models';
import { PALETTE } from './palette';

export const WALL_HEIGHT = 1.6;
const WALL_CUT_HEIGHT = 0.22;
/** Painted lower band on every wall (school wainscot). */
const DADO_HEIGHT = 0.55;
/** Half-width of the see-through strip around the player (tiles). */
const CUT_HALF_WIDTH = 0.4;
/**
 * How far in front of the player a wall can still cover their feet: a wall's "shadow" toward the
 * camera at the true isometric angle (tan 35.26° = 1/√2), plus a little slack.
 */
const CUT_REACH = WALL_HEIGHT * Math.SQRT2 + 0.3;
/** Half-size of the area around the view that gets real-time shadows (tiles). */
const SHADOW_EXTENT = 14;
const SHADOW_MAP = 2048;
/** Direction the sun shines from (relative to what it lights). */
const SUN_OFFSET = new THREE.Vector3(-18, 34, -22);

/**
 * Instanced walls that lower themselves when they would hide the player, with a painted
 * wainscot band and any decor hung on them sinking along.
 */
export class WallCutaway {
  readonly mesh: THREE.InstancedMesh;
  readonly dado: THREE.InstancedMesh;
  private readonly cols: Int16Array;
  private readonly rows: Int16Array;
  private readonly heights: Float32Array;
  private readonly byTile = new Map<string, number>();
  private readonly decor = new Map<number, THREE.Object3D[]>();
  private readonly matrix = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();

  constructor(tiles: { col: number; row: number }[], kit: MaterialKit) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    const side = kit.get(PALETTE.wallSide, { roughness: 0.92 });
    const top = kit.get(PALETTE.wallTop, { roughness: 0.9 });
    // BoxGeometry groups: +x, -x, +y (top), -y, +z, -z
    this.mesh = new THREE.InstancedMesh(
      geometry,
      [side, side, top, side, side, side],
      tiles.length,
    );
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    const dadoGeometry = new THREE.BoxGeometry(1.012, 1, 1.012);
    dadoGeometry.translate(0, 0.5, 0);
    this.dado = new THREE.InstancedMesh(
      dadoGeometry,
      kit.get(PALETTE.wallDado, { roughness: 0.6 }),
      tiles.length,
    );
    this.dado.receiveShadow = true;
    this.cols = Int16Array.from(tiles.map((t) => t.col));
    this.rows = Int16Array.from(tiles.map((t) => t.row));
    this.heights = new Float32Array(tiles.length).fill(WALL_HEIGHT);
    tiles.forEach((t, i) => this.byTile.set(`${t.col},${t.row}`, i));
    for (let i = 0; i < tiles.length; i++) this.write(i);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dado.instanceMatrix.needsUpdate = true;
  }

  /** Hang something on a wall tile so it sinks with the wall. */
  attach(col: number, row: number, obj: THREE.Object3D) {
    const i = this.byTile.get(`${col},${row}`);
    if (i === undefined) return;
    const list = this.decor.get(i) ?? [];
    list.push(obj);
    this.decor.set(i, list);
  }

  private write(i: number) {
    const h = this.heights[i]!;
    this.pos.set(this.cols[i]! + 0.5, 0, this.rows[i]! + 0.5);
    this.scale.set(1, h, 1);
    this.matrix.compose(this.pos, this.quat, this.scale);
    this.mesh.setMatrixAt(i, this.matrix);
    this.scale.set(1, DADO_HEIGHT * (h / WALL_HEIGHT), 1);
    this.matrix.compose(this.pos, this.quat, this.scale);
    this.dado.setMatrixAt(i, this.matrix);
    const hung = this.decor.get(i);
    if (hung) for (const o of hung) o.scale.y = h / WALL_HEIGHT;
  }

  /**
   * Lower only the walls that would hide the player: the ones in front of them (below them on
   * screen) whose silhouette actually covers them. Walls beside or behind stay up.
   *
   * The camera is orthographic, so the hidden region is a straight strip running from the player
   * toward the camera, about as wide as the player and as long as a wall's shadow on the floor.
   * `toCamera` is the ground-plane direction toward the camera; `across` is screen-right.
   */
  update(px: number, pz: number, toCamera: THREE.Vector2, across: THREE.Vector2, dt: number) {
    const k = Math.min(1, dt * 10);
    // A unit tile reaches this far either side of its center along a diagonal axis.
    const halfTile = 0.5 * (Math.abs(across.x) + Math.abs(across.y));
    let changed = false;
    for (let i = 0; i < this.heights.length; i++) {
      const dx = this.cols[i]! + 0.5 - px;
      const dz = this.rows[i]! + 0.5 - pz;
      const depth = dx * toCamera.x + dz * toCamera.y;
      const lateral = Math.abs(dx * across.x + dz * across.y);
      const cut = depth > 0 && depth - halfTile < CUT_REACH && lateral < halfTile + CUT_HALF_WIDTH;
      const target = cut ? WALL_CUT_HEIGHT : WALL_HEIGHT;
      const h = this.heights[i]!;
      if (Math.abs(h - target) < 0.001) continue;
      this.heights[i] = Math.abs(h - target) < 0.01 ? target : h + (target - h) * k;
      this.write(i);
      changed = true;
    }
    if (changed) {
      this.mesh.instanceMatrix.needsUpdate = true;
      this.dado.instanceMatrix.needsUpdate = true;
    }
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
  floorTexture: THREE.Texture;
  lightMap: THREE.Texture;
  /** Per-frame ambience: shadows follow the view and the boiler fire flickers. */
  update(focusX: number, focusZ: number, time: number): void;
  /** Real-time shadow map size; 0 turns real-time shadows off. */
  setShadows(size: number): void;
}

/** Stable 0..1 per tile, so the same desk always gets the same book. */
const variantAt = (col: number, row: number) => {
  const h = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

/** Build the static diorama for a level: floor, walls, furniture, fixtures, van, lights. */
export function buildWorld(scene: THREE.Scene, session: ShiftSession, kit: MaterialKit): World {
  const { level } = session;
  const cols = level.cols;
  const rows = level.rows;

  // Tabletop slab + grass verge.
  const margin = 3;
  const slab = new THREE.Mesh(
    new THREE.BoxGeometry(cols + margin * 2, 0.6, rows + margin * 2),
    new THREE.MeshStandardMaterial({ color: PALETTE.slab, roughness: 1 }),
  );
  // Top at -0.03: a little under the grass so the two never z-fight.
  slab.position.set(cols / 2, -0.33, rows / 2);
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
    new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.8 }),
    kit.shading,
  );
  const lightMap = createLightMap(level);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(cols, rows), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(cols / 2, 0, rows / 2);
  floor.receiveShadow = true;
  scene.add(floor);

  // Walls.
  const wallTiles: { col: number; row: number }[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (tileAt(level, col, row) === 'wall') wallTiles.push({ col, row });
    }
  }
  const walls = new WallCutaway(wallTiles, kit);
  scene.add(walls.mesh, walls.dado);

  // Everything that never moves is built, then merged into a few big meshes (batching.ts).
  const statics: THREE.Object3D[] = [];
  const place = (obj: THREE.Object3D, fp: Footprint, col: number, row: number) => {
    obj.position.set(col + 0.5, 0, row + 0.5);
    // Orientation comes from the same core rule that places the hitbox, so they always match.
    if (fp.anchor === 'wall') {
      const side = mountSide(level, col, row);
      if (side) obj.rotation.y = mountRotation(side);
      // No wall to hang on: core centres the hitbox on the tile, so centre the model too.
      else obj.position.z += 0.5 - fp.d / 2;
    }
    statics.push(obj);
  };
  for (const f of session.fixtures) {
    const build = FIXTURE_MODELS[f.def.id];
    if (build)
      place(build(kit, variantAt(f.tile.col, f.tile.row)), f.def.footprint, f.tile.col, f.tile.row);
  }
  for (const p of level.props) {
    const build = PROP_MODELS[p.defId];
    if (build) {
      const obj = build(kit, variantAt(p.tile.col, p.tile.row));
      place(obj, PROPS.get(p.defId).footprint, p.tile.col, p.tile.row);
    }
  }

  // Van across its tiles, facing the school.
  if (level.vanTiles.length) {
    const vc = level.vanTiles.map((t) => t.col);
    const vr = level.vanTiles.map((t) => t.row);
    const len = Math.max(...vc) - Math.min(...vc) + 1;
    const wid = Math.max(...vr) - Math.min(...vr) + 1;
    const van = buildVan(kit, len, wid);
    van.position.set(Math.min(...vc) + len / 2, 0, Math.min(...vr) + wid / 2);
    statics.push(van);
  }

  const coworker = buildCoworker(kit);
  coworker.position.set(toWorld(session.coworker.pos.x), 0, toWorld(session.coworker.pos.y));
  coworker.rotation.y = 0.4;
  statics.push(coworker);

  dressGrounds(level, kit, statics);
  scene.add(batchStatic(statics, kit, 12));

  // Locked doors span the gap between their two wall neighbours (they swing, so no batching).
  const doors: DoorView[] = session.doors
    .filter((d) => d.locked)
    .map((d) => {
      const { root, leaf } = buildLockedDoor(kit, d.security);
      root.position.set(d.tile.col + 0.5, 0, d.tile.row + 0.5);
      const wallsLeftRight =
        tileAt(level, d.tile.col - 1, d.tile.row) === 'wall' &&
        tileAt(level, d.tile.col + 1, d.tile.row) === 'wall';
      root.rotation.y = wallsLeftRight ? 0 : Math.PI / 2;
      scene.add(root);
      return { id: d.id, root, leaf, open: 0 };
    });

  hangDecor(level, walls, kit, scene);

  // Lighting: soft sky fill + a warm key light whose shadows follow the view.
  scene.add(new THREE.HemisphereLight(0xe3ecff, 0x40362c, 0.95));
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
  Object.assign(sun.shadow.camera, {
    left: -SHADOW_EXTENT,
    right: SHADOW_EXTENT,
    top: SHADOW_EXTENT,
    bottom: -SHADOW_EXTENT,
    near: 1,
    far: 100,
  });
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 2;
  scene.add(sun, sun.target);

  // Boiler fire glow.
  const boilers = level.props.filter((p) => p.defId === 'boiler');
  let glow: THREE.PointLight | null = null;
  if (boilers.length) {
    const cx = boilers.reduce((s, b) => s + b.tile.col + 0.5, 0) / boilers.length;
    const cz = boilers.reduce((s, b) => s + b.tile.row + 0.5, 0) / boilers.length;
    glow = new THREE.PointLight(PALETTE.boilerGlow, 4, 7, 1.6);
    glow.position.set(cx, 1.0, cz + 0.8);
    scene.add(glow);
  }
  const fire = fireMaterial(kit);

  return {
    walls,
    doors,
    floorTexture,
    lightMap,
    update(focusX, focusZ, time) {
      // Snap the shadow area to its texel grid so shadows don't shimmer as the view moves.
      const texel = (SHADOW_EXTENT * 2) / sun.shadow.mapSize.x;
      const x = Math.round(focusX / texel) * texel;
      const z = Math.round(focusZ / texel) * texel;
      sun.target.position.set(x, 0, z);
      sun.position.set(x + SUN_OFFSET.x, SUN_OFFSET.y, z + SUN_OFFSET.z);
      const flicker =
        0.75 +
        Math.sin(time * 9.1) * 0.12 +
        Math.sin(time * 23.7) * 0.08 +
        Math.sin(time * 3.3) * 0.1;
      fire.emissiveIntensity = 0.7 + flicker * 0.6;
      if (glow) glow.intensity = 3.2 + flicker * 2;
    },
    setShadows(size) {
      sun.castShadow = size > 0;
      if (size > 0 && size !== sun.shadow.mapSize.x) {
        sun.shadow.mapSize.set(size, size);
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
    },
  };
}

/** Trees, shrubs and lamp posts on the verge around the school. */
function dressGrounds(level: LevelDef, kit: MaterialKit, out: THREE.Object3D[]) {
  const { cols, rows } = level;
  const trees: [number, number, number][] = [
    [-1.4, 3, 1.1],
    [-1.6, 11, 0.9],
    [-1.3, 22, 1.2],
    [-1.5, 30, 1],
    [cols + 1.4, 4, 1],
    [cols + 1.6, 13, 1.15],
    [cols + 1.3, 22, 1],
    [cols + 1.5, 29, 0.95],
    [12, rows + 1.5, 1],
    [24, rows + 1.6, 1.15],
    [38, rows + 1.4, 1.1],
    [50, rows + 1.6, 0.9],
    [16, -1.5, 1],
    [34, -1.6, 1.1],
    [52, -1.4, 0.95],
  ];
  trees.forEach(([x, z, s], i) => {
    const tree = buildTree(kit, s, (i * 0.37) % 1);
    tree.position.set(x, 0, z);
    out.push(tree);
  });
  for (let i = 0; i < 18; i++) {
    const side = i % 3;
    const t = (i * 0.618) % 1;
    const bush = buildBush(kit, 0.7 + ((i * 7) % 5) * 0.12);
    if (side === 0) bush.position.set(-2.2 + t * 0.6, 0, 1 + t * (rows - 2));
    else if (side === 1) bush.position.set(9 + t * (cols - 10), 0, rows + 0.7 + t * 0.5);
    else bush.position.set(cols + 0.7 + t * 0.5, 0, 1 + t * (rows - 2));
    out.push(bush);
  }
  // Lamp posts along the parking lot.
  const parking = level.rooms.find((r) => r.kind === 'exterior');
  if (parking) {
    for (const row of [parking.rect.row + 3, parking.rect.row + 12, parking.rect.row + 24]) {
      const post = buildLampPost(kit);
      post.position.set(parking.rect.col + 0.4, 0, row);
      out.push(post);
    }
  }
}

const walkable = (level: LevelDef, col: number, row: number) => {
  const t = tileAt(level, col, row);
  return t === 'floor' || t === 'fixture' || t === 'prop';
};

const inBounds = (level: LevelDef, col: number, row: number) =>
  col >= 0 && row >= 0 && col < level.cols && row < level.rows;

/** Tall things against a wall that decor would clip into. */
const TALL_WALL_ITEMS = new Set([
  'lockers',
  'shelf',
  'air-line',
  'toilet',
  'mop-sink',
  'drinking-fountain',
]);

/**
 * Hang decor on the wall faces the camera can see (south and west faces): windows outside,
 * chalkboards and clocks in classrooms, notices and posters in halls, mirrors in restrooms.
 */
function hangDecor(level: LevelDef, walls: WallCutaway, kit: MaterialKit, scene: THREE.Scene) {
  const occupied = new Set<string>();
  for (const f of level.fixtures)
    if (TALL_WALL_ITEMS.has(f.defId)) occupied.add(`${f.tile.col},${f.tile.row}`);
  for (const p of level.props)
    if (TALL_WALL_ITEMS.has(p.defId)) occupied.add(`${p.tile.col},${p.tile.row}`);

  /** Hang on the south face (`face` 'south') or west face of wall tile (col, row). */
  const hang = (obj: THREE.Object3D, col: number, row: number, face: 'south' | 'west') => {
    // Flat against the wall, so its shadow would be invisible: skip the shadow pass.
    obj.traverse((o) => (o.castShadow = false));
    const baked = bake(obj, kit);
    if (face === 'south') baked.position.set(col + 0.5, 0, row + 1);
    else {
      baked.position.set(col, 0, row + 0.5);
      baked.rotation.y = -Math.PI / 2;
    }
    walls.attach(col, row, baked);
    scene.add(baked);
  };

  // Windows on the outside of the building.
  const outside = (col: number, row: number) =>
    !inBounds(level, col, row) || roomAt(level, col, row)?.kind === 'exterior';
  for (let row = 0; row < level.rows; row++) {
    for (let col = 0; col < level.cols; col++) {
      if (tileAt(level, col, row) !== 'wall' || (col + row) % 2) continue;
      const southOut = outside(col, row + 1) && !outside(col, row - 1);
      const westOut = outside(col - 1, row) && !outside(col + 1, row);
      const wallsBeside = (dc: number, dr: number) =>
        tileAt(level, col - dc, row - dr) === 'wall' &&
        tileAt(level, col + dc, row + dr) === 'wall';
      if (southOut && wallsBeside(1, 0)) hang(DECOR.window!(kit, 0), col, row, 'south');
      else if (westOut && wallsBeside(0, 1)) hang(DECOR.window!(kit, 0), col, row, 'west');
    }
  }

  for (const room of level.rooms) {
    if (room.kind === 'exterior' || room.kind === 'closet') continue;
    // Faces the camera sees from inside the room: the north wall's south face, the east wall's west face.
    const north = facesAlong(level, room, 'north').filter(
      ([c, r]) => !occupied.has(`${c},${r + 1}`),
    );
    const east = facesAlong(level, room, 'east').filter(([c, r]) => !occupied.has(`${c - 1},${r}`));
    const v = (c: number, r: number) => variantAt(c, r);

    switch (room.kind) {
      case 'classroom': {
        const mid = room.rect.col + Math.floor(room.rect.w / 2);
        const span = [mid - 1, mid, mid + 1];
        const board = span.every((c) => north.some(([nc]) => nc === c));
        if (board) {
          span.forEach((c, i) =>
            hang(chalkboardSlice(kit, i, span.length), c, room.rect.row - 1, 'south'),
          );
          hang(DECOR.clock!(kit, 0), mid, room.rect.row - 1, 'south');
        }
        east.forEach(([c, r], i) => i % 4 === 1 && hang(DECOR.poster!(kit, v(c, r)), c, r, 'west'));
        break;
      }
      case 'hallway': {
        const cycle = ['bulletin', 'poster', 'poster', 'clock'] as const;
        north.forEach(([c, r], i) => {
          if (i === 0) hang(DECOR.exit!(kit, 0), c, r, 'south');
          else if (i % 3 === 0)
            hang(DECOR[cycle[(i / 3) % cycle.length]!]!(kit, v(c, r)), c, r, 'south');
        });
        east.forEach(([c, r], i) => {
          if (i % 4 === 2) hang(DECOR[cycle[((i / 4) % 3) | 0]!]!(kit, v(c, r)), c, r, 'west');
        });
        break;
      }
      case 'restroom':
        north.forEach(([c, r]) => hang(DECOR.mirror!(kit, 0), c, r, 'south'));
        break;
      case 'lounge':
        north.forEach(([c, r], i) => {
          if (i % 3 === 1) hang(DECOR[i % 2 ? 'poster' : 'bulletin']!(kit, v(c, r)), c, r, 'south');
        });
        break;
      case 'boiler':
      case 'mechanical':
        north.forEach(([c, r], i) => i % 4 === 1 && hang(DECOR.warning!(kit, 0), c, r, 'south'));
        break;
      case 'office':
        north.forEach(([c, r], i) => {
          if (i === 3) hang(DECOR.portrait!(kit, 0), c, r, 'south');
          else if (i === 6) hang(DECOR.clock!(kit, 0), c, r, 'south');
        });
        break;
      case 'library':
        north.forEach(([c, r], i) => i % 3 === 1 && hang(DECOR.poster!(kit, 0), c, r, 'south'));
        east.forEach(([c, r], i) => i % 3 === 1 && hang(DECOR.clock!(kit, 0), c, r, 'west'));
        break;
      case 'lab':
        north.forEach(([c, r], i) => {
          if (i === 4) hang(DECOR.periodic!(kit, 0), c, r, 'south');
          else if (i % 5 === 1) hang(DECOR.poster!(kit, v(c, r)), c, r, 'south');
        });
        break;
      case 'gym':
        north.forEach(
          ([c, r], i) => i % 3 === 0 && hang(DECOR.banner!(kit, v(c, r)), c, r, 'south'),
        );
        east.forEach(([c, r], i) => i % 5 === 2 && hang(DECOR.clock!(kit, 0), c, r, 'west'));
        break;
      case 'cafeteria':
        north.forEach(([c, r], i) => {
          if (i === 7) hang(DECOR.menu!(kit, 0), c, r, 'south');
          else if (i % 4 === 1) hang(DECOR.poster!(kit, v(c, r)), c, r, 'south');
        });
        break;
    }
  }
}

/** Wall tiles along a room's north or east edge whose face looks into the room. */
function facesAlong(level: LevelDef, room: RoomDef, edge: 'north' | 'east'): [number, number][] {
  const { col, row, w, h } = room.rect;
  const out: [number, number][] = [];
  if (edge === 'north') {
    for (let c = col; c < col + w; c++) {
      if (tileAt(level, c, row - 1) === 'wall' && walkable(level, c, row)) out.push([c, row - 1]);
    }
  } else {
    for (let r = row; r < row + h; r++) {
      if (tileAt(level, col + w, r) === 'wall' && walkable(level, col + w - 1, r))
        out.push([col + w, r]);
    }
  }
  return out;
}
