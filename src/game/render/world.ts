import { PROPS } from '@core/content/props';
import { roomAt, tileAt } from '@core/level/asciiLevel';
import { mountSide } from '@core/level/footprint';
import type { LevelDef, RoomDef } from '@core/level/types';
import type { Footprint } from '@core/model/types';
import type { ShiftSession } from '@core/session/ShiftSession';
import * as THREE from 'three';
import { bake, batchStatic } from './batching';
import { mountRotation, toWorld } from './coords';
import { createFloorMaterial, wallDetailTexture } from './floorTexture';
import { buildInterior } from './interior';
import type { IsoCamera } from './isoCamera';
import { LightBaker } from './lightBaker';
import type { TileVisibility } from './occlusion';
import { GLOW, type MaterialKit } from './materials';
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
import { buildOutdoors, HORIZON } from './outdoors';
import { PALETTE } from './palette';
import { fitShadowBox, shadowMapSize, type ShadowBox } from './shadowFit';

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
/**
 * Half-size of the area around the view that gets real-time shadows (tiles), where nothing
 * better is known about what's on screen (first person).
 */
const SHADOW_EXTENT = 14;
const SHADOW_MAP = 2048;
const SHADOW_SQUARE: ShadowBox = {
  left: -SHADOW_EXTENT,
  right: SHADOW_EXTENT,
  bottom: -SHADOW_EXTENT,
  top: SHADOW_EXTENT,
};
/** Room left around what the view shows, for the soft edge of a shadow and the texel snap. */
const SHADOW_MARGIN = 0.75;
/** Direction the sun shines from (relative to what it lights). */
const SUN_OFFSET = new THREE.Vector3(-18, 34, -22);
/**
 * Even light, as a multiple of the environment's intensity, that makes a frame drawn without
 * the environment as bright as one drawn with it (measured in both views, in lit and dark
 * rooms and outdoors).
 */
const ENVIRONMENT_LIGHT = 4.5;

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
  /** Per wall, the walls to its +x, -x, +z and -z (-1 for none). */
  private readonly neighbours: Int32Array;
  /** Per wall, which of those sides are covered by a neighbour at least as tall (bit flags). */
  private readonly joined: THREE.InstancedBufferAttribute;
  private readonly byTile = new Map<string, number>();
  private readonly decor = new Map<number, THREE.Object3D[]>();
  private readonly matrix = new THREE.Matrix4();
  private readonly pos = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly scale = new THREE.Vector3();

  constructor(tiles: { col: number; row: number }[], kit: MaterialKit) {
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    geometry.translate(0, 0.5, 0);
    const side = kit.wall(PALETTE.wallSide, 0.9, true);
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
      kit.wall(PALETTE.wallDado, 0.55, true),
      tiles.length,
    );
    this.dado.receiveShadow = true;
    this.cols = Int16Array.from(tiles.map((t) => t.col));
    this.rows = Int16Array.from(tiles.map((t) => t.row));
    this.heights = new Float32Array(tiles.length).fill(WALL_HEIGHT);
    tiles.forEach((t, i) => this.byTile.set(`${t.col},${t.row}`, i));
    const at = (col: number, row: number) => this.byTile.get(`${col},${row}`) ?? -1;
    this.neighbours = Int32Array.from(
      tiles.flatMap((t) => [
        at(t.col + 1, t.row),
        at(t.col - 1, t.row),
        at(t.col, t.row + 1),
        at(t.col, t.row - 1),
      ]),
    );
    this.joined = new THREE.InstancedBufferAttribute(new Float32Array(tiles.length), 1);
    geometry.setAttribute('aJoined', this.joined);
    dadoGeometry.setAttribute('aJoined', this.joined);
    for (let i = 0; i < tiles.length; i++) this.write(i);
    this.join();
    this.mesh.instanceMatrix.needsUpdate = true;
    this.dado.instanceMatrix.needsUpdate = true;
  }

  /**
   * Work out which sides of each wall are hidden against a neighbour. A wall that has sunk
   * leaves the taller one beside it with a face showing, so this follows the heights.
   */
  private join() {
    const flags = this.joined.array;
    for (let i = 0; i < flags.length; i++) {
      const h = this.heights[i]! - 0.001;
      let covered = 0;
      for (let side = 0; side < 4; side++) {
        const n = this.neighbours[i * 4 + side]!;
        if (n >= 0 && this.heights[n]! >= h) covered |= 1 << side;
      }
      flags[i] = covered;
    }
    this.joined.needsUpdate = true;
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
   * Pass `cutaway` false (first person: you're inside, nothing needs moving) to raise them all.
   */
  update(
    px: number,
    pz: number,
    toCamera: THREE.Vector2,
    across: THREE.Vector2,
    dt: number,
    cutaway = true,
  ) {
    const k = Math.min(1, dt * 10);
    // A unit tile reaches this far either side of its center along a diagonal axis.
    const halfTile = 0.5 * (Math.abs(across.x) + Math.abs(across.y));
    let changed = false;
    for (let i = 0; i < this.heights.length; i++) {
      const dx = this.cols[i]! + 0.5 - px;
      const dz = this.rows[i]! + 0.5 - pz;
      const depth = dx * toCamera.x + dz * toCamera.y;
      const lateral = Math.abs(dx * across.x + dz * across.y);
      const cut =
        cutaway && depth > 0 && depth - halfTile < CUT_REACH && lateral < halfTile + CUT_HALF_WIDTH;
      const target = cut ? WALL_CUT_HEIGHT : WALL_HEIGHT;
      const h = this.heights[i]!;
      if (Math.abs(h - target) < 0.001) continue;
      this.heights[i] = Math.abs(h - target) < 0.01 ? target : h + (target - h) * k;
      this.write(i);
      changed = true;
    }
    if (changed) {
      this.join();
      this.mesh.instanceMatrix.needsUpdate = true;
      this.dado.instanceMatrix.needsUpdate = true;
    }
  }
}

/** Something to hide when none of the tiles in its rectangle can be seen. */
interface Cullable {
  object: THREE.Object3D;
  col0: number;
  row0: number;
  col1: number;
  row1: number;
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
  /** The baked light map (re-bake it when a door opens). */
  lights: LightBaker;
  /** The floor and what lies under it: hidden while its own reflection is drawn. */
  underfoot: THREE.Object3D[];
  /** Show a reflection in the floor (see FloorMirror); null turns it off. */
  reflect(texture: THREE.Texture | null, matrix: THREE.Matrix4, strength: number): void;
  /** Per-frame ambience: shadows follow the view, the boiler fire flickers, clouds drift. */
  update(focusX: number, focusZ: number, time: number): void;
  /**
   * Dress the world for a view. First person adds what you'd see from inside (ceilings, lamps,
   * sky, the land beyond the verge) and drops the fog of war, since what's on screen is simply
   * what's in sight; top-down is the open-roofed diorama.
   */
  setFirstPerson(on: boolean): void;
  /**
   * First person: draw only the scenery the eye could see (rooms it can see into, the outdoors
   * if any of it is in view). Pass null to draw everything again.
   */
  cull(seen: TileVisibility | null): void;
  /**
   * How sharp real-time shadows are, as the size of a square map over the standard area; 0
   * turns them off.
   */
  setShadows(size: number): void;
  /**
   * Shadows are only worked out for the patch of the world a view shows, from the ground to
   * the top of the walls (the crown of a tree outside simply goes without): pass the top-down
   * camera, which knows its own, or null for the standard area around the focus.
   */
  showShadows(view: Pick<IsoCamera, 'footprint'> | null): void;
  /** Free what the world owns beyond the scene's own meshes and materials. */
  dispose(): void;
}

/** Stable 0..1 per tile, so the same desk always gets the same book. */
const variantAt = (col: number, row: number) => {
  const h = Math.sin(col * 127.1 + row * 311.7) * 43758.5453;
  return h - Math.floor(h);
};

/** Build the static diorama for a level: floor, walls, furniture, fixtures, van, lights. */
export function buildWorld(
  scene: THREE.Scene,
  session: ShiftSession,
  kit: MaterialKit,
  renderer: THREE.WebGLRenderer,
): World {
  const { level } = session;
  const cols = level.cols;
  const rows = level.rows;
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());

  // Light first: every material below samples it.
  const lights = new LightBaker(renderer, session);
  kit.shading.uLightMap.value = lights.texture;
  kit.shading.uLightScale.value = lights.scale;
  const wallDetail = wallDetailTexture(anisotropy);
  kit.shading.uWallDetail.value = wallDetail;

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

  // Floor plan. Phones get smaller floor layers: they're short on texture memory.
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const floorSurface = createFloorMaterial(
    level,
    kit.shading,
    coarsePointer ? 256 : 512,
    anisotropy,
  );
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(cols, rows), floorSurface.material);
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
  // One batch per room (long hallways and the grounds in 12-tile stretches), so first person
  // can skip whole rooms it can't see into.
  const batches = batchStatic(statics, kit, (x, z) => {
    const room = roomAt(level, Math.floor(x), Math.floor(z));
    if (!room || room.kind === 'exterior') return `${Math.floor(x / 12)},${Math.floor(z / 12)}`;
    const { col, row } = room.rect;
    return `${room.id}:${Math.floor((x - col) / 12)},${Math.floor((z - row) / 12)}`;
  });
  scene.add(batches);
  /** Scenery that can be skipped when its tiles are out of sight. */
  const cullable: Cullable[] = [];
  for (const mesh of batches.children as THREE.Mesh[]) {
    const { min, max } = mesh.geometry.boundingBox!;
    cullable.push({
      object: mesh,
      col0: min.x - 0.5,
      row0: min.z - 0.5,
      col1: max.x + 0.5,
      row1: max.z + 0.5,
    });
  }

  // Locked doors span the gap between their two wall neighbours (they swing, so no batching).
  // Every door the level locks gets one, whether or not it still is: an engine that takes over
  // a shift in progress finds some already opened, and they stand open rather than vanish.
  const lockable = new Set(level.doors.filter((d) => d.locked).map((d) => d.id));
  const doors: DoorView[] = session.doors
    .filter((d) => lockable.has(d.id))
    .map((d) => {
      const { root, leaf } = buildLockedDoor(kit, d.security);
      root.position.set(d.tile.col + 0.5, 0, d.tile.row + 0.5);
      const wallsLeftRight =
        tileAt(level, d.tile.col - 1, d.tile.row) === 'wall' &&
        tileAt(level, d.tile.col + 1, d.tile.row) === 'wall';
      root.rotation.y = wallsLeftRight ? 0 : Math.PI / 2;
      scene.add(root);
      const { col, row } = d.tile;
      cullable.push({ object: root, col0: col - 1, row0: row - 1, col1: col + 1, row1: row + 1 });
      return { id: d.id, root, leaf, open: d.locked ? 0 : 1 };
    });

  for (const hung of hangDecor(level, walls, kit, scene)) {
    // Seen from the tile it faces.
    const { object, col, row } = hung;
    cullable.push({ object, col0: col, row0: row, col1: col, row1: row });
  }
  const exteriors = level.rooms.filter((r) => r.kind === 'exterior').map((r) => r.rect);

  // Only seen from inside (see setFirstPerson).
  const interior = buildInterior(level, kit, lights.lamps, WALL_HEIGHT, anisotropy);
  const outdoors = buildOutdoors(level, kit, SUN_OFFSET);
  interior.visible = false;
  outdoors.group.visible = false;
  scene.add(interior, outdoors.group);
  // Distance haze, for first person only; at zero density it costs nothing to keep around.
  const haze = new THREE.FogExp2(HORIZON.getHex(), 0);
  scene.fog = haze;

  // Lighting: soft sky fill + a warm key light whose shadows follow the view.
  scene.add(new THREE.HemisphereLight(0xe3ecff, 0x40362c, 0.95));
  // The studio environment lights the scene as well as reflecting in it. A device that goes
  // without it (see QualityGovernor) gets the same light from here, minus the reflections.
  const standIn = new THREE.AmbientLight(0xffffff, 0);
  scene.add(standIn);
  const sun = new THREE.DirectionalLight(0xfff0dc, 2.2);
  sun.castShadow = true;
  Object.assign(sun.shadow.camera, { near: 1, far: 100 });
  /** How sharp the shadows are: the size of a square map over the standard area. */
  let shadowSize = SHADOW_MAP;
  /** The part of the sun's view that gets shadows: only what the camera can show. */
  const fitShadows = (box: ShadowBox) => {
    Object.assign(sun.shadow.camera, box);
    sun.shadow.camera.updateProjectionMatrix();
    const { x, y } = shadowMapSize(box, shadowSize, SHADOW_EXTENT);
    if (x === sun.shadow.mapSize.x && y === sun.shadow.mapSize.y) return;
    // A map of the wrong size gives its memory back straight away.
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
    sun.shadow.mapSize.set(x, y);
  };
  fitShadows(SHADOW_SQUARE);
  // The soft filter reads a few texels to every side; this much bias keeps a lit floor clear
  // of its own shadow across that spread.
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.025;
  sun.shadow.radius = 2.6;
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
    lights,
    underfoot: [slab, verge, floor, outdoors.ground],
    reflect: (texture, matrix, strength) => floorSurface.reflect(texture, matrix, strength),
    update(focusX, focusZ, time) {
      // Snap the shadow area to its texel grid so shadows don't shimmer as the view moves.
      const texel = (SHADOW_EXTENT * 2) / shadowSize;
      const x = Math.round(focusX / texel) * texel;
      const z = Math.round(focusZ / texel) * texel;
      sun.target.position.set(x, 0, z);
      sun.position.set(x + SUN_OFFSET.x, SUN_OFFSET.y, z + SUN_OFFSET.z);
      const flicker =
        0.75 +
        Math.sin(time * 9.1) * 0.12 +
        Math.sin(time * 23.7) * 0.08 +
        Math.sin(time * 3.3) * 0.1;
      fire.emissiveIntensity = GLOW * (0.7 + flicker * 0.6);
      if (glow) glow.intensity = 3.2 + flicker * 2;
      standIn.intensity = scene.environment ? 0 : ENVIRONMENT_LIGHT * scene.environmentIntensity;
      outdoors.update(time);
    },
    setFirstPerson(on) {
      interior.visible = on;
      outdoors.group.visible = on;
      haze.density = on ? 0.011 : 0;
      kit.shading.uFogOn.value = on ? 0 : 1;
      kit.shading.uRoofed.value = on ? 1 : 0;
      // Indoors the lamps should do the lighting, not an even glow from all around.
      scene.environmentIntensity = on ? 0.3 : 0.5;
    },
    cull(seen) {
      // Sky, far ground and distant trees: only if some of the outdoors is in view.
      const outside =
        !seen || exteriors.some((r) => seen.anyIn(r.col, r.row, r.col + r.w - 1, r.row + r.h - 1));
      outdoors.group.visible = interior.visible && outside;
      for (const c of cullable) {
        // Anything reaching past the edge of the map is out on the verge.
        const onVerge = c.col0 < 0 || c.row0 < 0 || c.col1 >= cols || c.row1 >= rows;
        c.object.visible =
          !seen || seen.anyIn(c.col0, c.row0, c.col1, c.row1) || (onVerge && outside);
      }
    },
    setShadows(size) {
      sun.castShadow = size > 0;
      if (size > 0) {
        shadowSize = size;
        const { left, right, bottom, top } = sun.shadow.camera;
        fitShadows({ left, right, bottom, top });
      } else {
        // No longer wanted: the map gives its memory back straight away.
        sun.shadow.map?.dispose();
        sun.shadow.map = null;
      }
    },
    showShadows(view) {
      fitShadows(
        view
          ? fitShadowBox(view.footprint([0, WALL_HEIGHT]), SUN_OFFSET, SHADOW_MARGIN)
          : SHADOW_SQUARE,
      );
    },
    dispose() {
      // The light owns its shadow map, which nothing else frees.
      sun.dispose();
      lights.dispose();
      floorSurface.dispose();
      wallDetail.dispose();
      outdoors.dispose();
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
function hangDecor(
  level: LevelDef,
  walls: WallCutaway,
  kit: MaterialKit,
  scene: THREE.Scene,
): { object: THREE.Object3D; col: number; row: number }[] {
  /** Everything hung, with the tile each piece faces. */
  const hung: { object: THREE.Object3D; col: number; row: number }[] = [];
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
    hung.push(
      face === 'south'
        ? { object: baked, col, row: row + 1 }
        : { object: baked, col: col - 1, row },
    );
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
  return hung;
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
