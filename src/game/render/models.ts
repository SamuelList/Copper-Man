import * as THREE from 'three';
import type { MaterialKit } from './materials';
import { PALETTE } from './palette';

/**
 * Procedural low-poly models, built from primitives. Units are tiles (1 = one map tile).
 *
 * Conventions:
 * - Characters face local +X (rotate by -facing to point along a map heading).
 * - Wall-mounted fixtures/props put their back on local -Z (see `mountRotation`).
 *
 * To swap in real art later, register a different builder for an id in `FIXTURE_MODELS` /
 * `PROP_MODELS` (e.g. one that clones a loaded glTF scene).
 */

type Builder = (kit: MaterialKit) => THREE.Object3D;

const geoCache = new Map<string, THREE.BufferGeometry>();
function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
}

const box = (w: number, h: number, d: number) =>
  geo(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
const cyl = (rt: number, rb: number, h: number, seg = 10) =>
  geo(`cyl:${rt}:${rb}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));
const sphere = (r: number, w = 10, h = 8) =>
  geo(`sph:${r}:${w}:${h}`, () => new THREE.SphereGeometry(r, w, h));
const capsule = (r: number, len: number) =>
  geo(`cap:${r}:${len}`, () => new THREE.CapsuleGeometry(r, len, 3, 10));
const torus = (r: number, tube: number) =>
  geo(`tor:${r}:${tube}`, () => new THREE.TorusGeometry(r, tube, 6, 16));

function part(
  g: THREE.BufferGeometry,
  m: THREE.Material,
  x = 0,
  y = 0,
  z = 0,
  parent?: THREE.Object3D,
): THREE.Mesh {
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent?.add(mesh);
  return mesh;
}

export function disposeModelCache() {
  geoCache.forEach((g) => g.dispose());
  geoCache.clear();
}

// ---------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------

export interface CharacterModel {
  root: THREE.Group;
  /** Scaled for crouching; bobbed while walking. */
  body: THREE.Group;
  /** Optional carried-scrap sack. */
  sack?: THREE.Object3D;
}

/** Maintenance worker in a coloured work shirt and cap. */
export function buildWorker(kit: MaterialKit, color: number, unique = false): CharacterModel {
  const m = (c: number, o?: { roughness?: number }) => (unique ? kit.unique(c, o) : kit.get(c, o));
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const pants = m(PALETTE.pants);
  part(box(0.14, 0.34, 0.12), pants, 0, 0.17, -0.08, body);
  part(box(0.14, 0.34, 0.12), pants, 0, 0.17, 0.08, body);
  part(capsule(0.17, 0.22), m(color), 0, 0.53, 0, body);
  // Hi-vis vest stripe and tool belt.
  part(box(0.36, 0.05, 0.36), m(0xfff176), 0, 0.6, 0, body);
  part(box(0.36, 0.05, 0.36), m(0x3e2723), 0, 0.37, 0, body);
  part(sphere(0.15), m(PALETTE.skin), 0.02, 0.86, 0, body);
  const capMat = m(new THREE.Color(color).multiplyScalar(0.7).getHex());
  part(cyl(0.155, 0.16, 0.08), capMat, 0.01, 0.97, 0, body);
  part(box(0.12, 0.025, 0.2), capMat, 0.15, 0.94, 0, body);
  const sack = part(sphere(0.15, 8, 6), m(0x8d6e63), -0.24, 0.55, 0, body);
  sack.scale.set(0.9, 1.1, 1);
  part(cyl(0.03, 0.03, 0.12, 6), m(0xd9822b, { roughness: 0.4 }), -0.24, 0.72, 0.04, body);
  return { root, body, sack };
}

/** Mr. Gravy: grey suit, red tie, comb-over. */
export function buildBoss(kit: MaterialKit): CharacterModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const suit = kit.get(PALETTE.bossSuit);
  part(box(0.17, 0.4, 0.14), suit, 0, 0.2, -0.1, body);
  part(box(0.17, 0.4, 0.14), suit, 0, 0.2, 0.1, body);
  const torso = part(capsule(0.22, 0.26), suit, 0, 0.64, 0, body);
  torso.scale.set(0.95, 1, 1.1);
  part(box(0.05, 0.22, 0.18), kit.get(PALETTE.shirt), 0.19, 0.7, 0, body);
  part(box(0.04, 0.2, 0.06), kit.get(PALETTE.bossTie), 0.215, 0.66, 0, body);
  part(sphere(0.17), kit.get(0xe8b48a), 0.02, 1.02, 0, body);
  part(box(0.24, 0.03, 0.2), kit.get(0x5d4037), 0, 1.15, 0.02, body);
  part(box(0.05, 0.03, 0.12), kit.get(0x5d4037), 0.17, 0.98, 0, body);
  return { root, body };
}

export function buildStudent(kit: MaterialKit, shirt: number): CharacterModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const jeans = kit.get(0x3d5a80);
  part(box(0.11, 0.26, 0.1), jeans, 0, 0.13, -0.06, body);
  part(box(0.11, 0.26, 0.1), jeans, 0, 0.13, 0.06, body);
  part(capsule(0.13, 0.16), kit.get(shirt), 0, 0.42, 0, body);
  part(box(0.12, 0.22, 0.24), kit.get(0x5c6bc0), -0.15, 0.45, 0, body);
  part(sphere(0.12), kit.get(PALETTE.skin), 0.01, 0.66, 0, body);
  part(sphere(0.125, 8, 6), kit.get(0x4e342e), -0.02, 0.7, 0, body).scale.set(1, 0.6, 1);
  return { root, body };
}

/** The sleepy coworker, curled up on a blanket. */
export function buildCoworker(kit: MaterialKit): THREE.Group {
  const root = new THREE.Group();
  part(box(0.9, 0.04, 0.6), kit.get(0x7e57c2), 0, 0.02, 0, root);
  const sleeper = part(capsule(0.16, 0.42), kit.get(0x26a69a), 0.05, 0.18, 0, root);
  sleeper.rotation.z = Math.PI / 2;
  part(sphere(0.14), kit.get(PALETTE.skin), -0.38, 0.17, 0, root);
  part(box(0.5, 0.06, 0.4), kit.get(0x9575cd), 0.12, 0.3, 0, root);
  return root;
}

// ---------------------------------------------------------------------------------------------
// Fixtures (scrappable)
// ---------------------------------------------------------------------------------------------

export const FIXTURE_MODELS: Record<string, Builder> = {
  'copper-pile': (kit) => {
    const g = new THREE.Group();
    const copper = kit.get(0xd9822b, { roughness: 0.35, metalness: 0.6 });
    const dark = kit.get(0xa85d1b, { roughness: 0.4, metalness: 0.6 });
    for (let i = 0; i < 7; i++) {
      const p = part(
        cyl(0.05, 0.05, 0.75, 8),
        i % 2 ? copper : dark,
        0,
        0.06 + Math.floor(i / 3) * 0.09,
        0,
        g,
      );
      p.rotation.z = Math.PI / 2;
      p.rotation.y = (i * 0.9) % Math.PI;
      p.position.x = ((i % 3) - 1) * 0.12;
      p.position.z = ((i * 37) % 5) * 0.05 - 0.1;
    }
    const coil = part(torus(0.17, 0.045), copper, 0.15, 0.3, 0.12, g);
    coil.rotation.x = Math.PI / 2.4;
    return g;
  },
  'drinking-fountain': (kit) => {
    const g = new THREE.Group();
    part(
      box(0.55, 0.78, 0.36),
      kit.get(PALETTE.steel, { roughness: 0.4, metalness: 0.5 }),
      0,
      0.39,
      -0.22,
      g,
    );
    part(
      box(0.5, 0.06, 0.3),
      kit.get(0xcfd8dc, { roughness: 0.3, metalness: 0.4 }),
      0,
      0.8,
      -0.2,
      g,
    );
    part(
      cyl(0.03, 0.03, 0.1, 6),
      kit.get(PALETTE.brass, { roughness: 0.3, metalness: 0.8 }),
      0,
      0.87,
      -0.15,
      g,
    );
    return g;
  },
  'wall-heater': (kit) => {
    const g = new THREE.Group();
    part(box(0.85, 0.55, 0.22), kit.get(0xe8643a), 0, 0.4, -0.33, g);
    const fin = kit.get(0x9b3a1c);
    for (let i = -3; i <= 3; i++) part(box(0.04, 0.4, 0.04), fin, i * 0.1, 0.4, -0.21, g);
    return g;
  },
  'air-line': (kit) => {
    const g = new THREE.Group();
    const pipe = kit.get(0x6fb9ad, { roughness: 0.4, metalness: 0.5 });
    part(cyl(0.05, 0.05, 1.3, 8), pipe, -0.18, 0.65, -0.38, g);
    part(cyl(0.05, 0.05, 1.3, 8), pipe, 0.18, 0.65, -0.38, g);
    const cross = part(cyl(0.045, 0.045, 0.42, 8), pipe, 0, 0.75, -0.38, g);
    cross.rotation.z = Math.PI / 2;
    const wheel = part(torus(0.11, 0.025), kit.get(0xe53935), 0, 0.75, -0.3, g);
    wheel.rotation.y = 0;
    return g;
  },
  radiator: (kit) => {
    const g = new THREE.Group();
    const mat = kit.get(0xc9b9ae, { roughness: 0.6, metalness: 0.3 });
    for (let i = -4; i <= 4; i++) part(box(0.07, 0.55, 0.2), mat, i * 0.095, 0.3, -0.33, g);
    part(box(0.9, 0.05, 0.22), mat, 0, 0.05, -0.33, g);
    return g;
  },
  toilet: (kit) => {
    const g = new THREE.Group();
    const porcelain = kit.get(0xf5f5f5, { roughness: 0.25 });
    part(box(0.5, 0.42, 0.18), porcelain, 0, 0.5, -0.36, g);
    const bowl = part(cyl(0.2, 0.15, 0.36, 12), porcelain, 0, 0.18, -0.08, g);
    bowl.scale.set(1, 1, 1.3);
    part(cyl(0.21, 0.21, 0.03, 12), kit.get(0xeceff1), 0, 0.37, -0.08, g).scale.set(1, 1, 1.3);
    return g;
  },
  'mop-sink': (kit) => {
    const g = new THREE.Group();
    part(
      box(0.7, 0.3, 0.6),
      kit.get(PALETTE.steel, { roughness: 0.4, metalness: 0.5 }),
      0,
      0.15,
      -0.15,
      g,
    );
    part(box(0.56, 0.02, 0.46), kit.get(0x37474f), 0, 0.305, -0.15, g);
    const handle = part(cyl(0.02, 0.02, 1.1, 6), kit.get(0xa1887f), 0.22, 0.6, -0.3, g);
    handle.rotation.z = 0.25;
    part(box(0.18, 0.1, 0.12), kit.get(0xb0bec5), 0.33, 0.1, -0.3, g);
    return g;
  },
  lamp: (kit) => {
    const g = new THREE.Group();
    part(box(0.6, 0.05, 0.45), kit.get(PALETTE.wood), 0, 0.5, 0, g);
    for (const [x, z] of [
      [-0.26, -0.18],
      [0.26, -0.18],
      [-0.26, 0.18],
      [0.26, 0.18],
    ] as const)
      part(box(0.04, 0.5, 0.04), kit.get(PALETTE.steelDark), x, 0.25, z, g);
    part(cyl(0.08, 0.1, 0.04, 10), kit.get(0x37474f), 0.1, 0.545, 0, g);
    part(cyl(0.015, 0.015, 0.25, 6), kit.get(0x37474f), 0.1, 0.68, 0, g);
    part(cyl(0.05, 0.12, 0.12, 10), kit.get(0xfff176, { emissive: 0x6b5a10 }), 0.1, 0.82, 0, g);
    return g;
  },
  desk: (kit) => {
    const g = new THREE.Group();
    part(box(0.7, 0.05, 0.5), kit.get(PALETTE.wood), 0, 0.46, -0.08, g);
    const leg = kit.get(PALETTE.steelDark, { metalness: 0.4, roughness: 0.5 });
    for (const [x, z] of [
      [-0.3, -0.28],
      [0.3, -0.28],
      [-0.3, 0.12],
      [0.3, 0.12],
    ] as const)
      part(box(0.04, 0.44, 0.04), leg, x, 0.22, z, g);
    part(box(0.36, 0.04, 0.3), kit.get(0x5c6bc0), 0, 0.26, 0.3, g);
    part(box(0.36, 0.3, 0.04), kit.get(0x5c6bc0), 0, 0.42, 0.44, g);
    return g;
  },
};

// ---------------------------------------------------------------------------------------------
// Props (furniture)
// ---------------------------------------------------------------------------------------------

export const PROP_MODELS: Record<string, Builder> = {
  lockers: (kit) => {
    const g = new THREE.Group();
    part(
      box(0.96, 1.5, 0.5),
      kit.get(0x5c7a99, { roughness: 0.5, metalness: 0.3 }),
      0,
      0.75,
      -0.24,
      g,
    );
    const seam = kit.get(0x3e5266);
    part(box(0.02, 1.45, 0.02), seam, 0, 0.75, 0.01, g);
    for (const x of [-0.24, 0.24]) {
      for (let i = 0; i < 3; i++) part(box(0.18, 0.02, 0.02), seam, x, 1.2 + i * 0.06, 0.01, g);
    }
    return g;
  },
  boiler: (kit) => {
    const g = new THREE.Group();
    part(
      box(0.98, 1.4, 0.98),
      kit.get(0x8d3b2a, { roughness: 0.55, metalness: 0.4 }),
      0,
      0.7,
      0,
      g,
    );
    part(box(1.0, 0.08, 1.0), kit.get(0x5d2a20), 0, 1.38, 0, g);
    const pipe = part(
      cyl(0.07, 0.07, 0.6, 8),
      kit.get(PALETTE.steel, { metalness: 0.6, roughness: 0.4 }),
      0.2,
      1.7,
      0.2,
      g,
    );
    pipe.castShadow = true;
    return g;
  },
  shelf: (kit) => {
    const g = new THREE.Group();
    const frame = kit.get(0x8a7a5c);
    part(box(0.94, 1.5, 0.08), frame, 0, 0.75, -0.42, g);
    for (let i = 0; i < 4; i++) part(box(0.94, 0.04, 0.45), frame, 0, 0.1 + i * 0.45, -0.22, g);
    const boxes = [0xc8a165, 0xb0855a, 0x7d9fbf];
    for (let i = 0; i < 3; i++)
      part(box(0.3, 0.26, 0.3), kit.get(boxes[i]!), -0.25 + i * 0.27, 0.27 + i * 0.45, -0.22, g);
    return g;
  },
  table: (kit) => {
    const g = new THREE.Group();
    part(box(0.98, 0.06, 0.98), kit.get(0x9c7b5b), 0, 0.5, 0, g);
    part(cyl(0.06, 0.08, 0.48, 8), kit.get(PALETTE.steelDark), 0, 0.24, 0, g);
    part(cyl(0.12, 0.12, 0.02, 10), kit.get(0xeceff1), 0.2, 0.54, 0.15, g);
    return g;
  },
  bench: (kit) => {
    const g = new THREE.Group();
    part(box(0.98, 0.08, 0.42), kit.get(PALETTE.woodDark), 0, 0.42, -0.15, g);
    part(box(0.98, 0.3, 0.06), kit.get(PALETTE.woodDark), 0, 0.62, -0.36, g);
    for (const x of [-0.4, 0.4])
      part(box(0.06, 0.4, 0.38), kit.get(PALETTE.steelDark), x, 0.2, -0.15, g);
    return g;
  },
  planter: (kit) => {
    const g = new THREE.Group();
    part(box(0.7, 0.35, 0.7), kit.get(0x8d6e63), 0, 0.175, 0, g);
    const bush = part(
      geo('bush', () => new THREE.IcosahedronGeometry(0.42, 0)),
      kit.get(0x4f7a3a),
      0,
      0.6,
      0,
      g,
    );
    bush.scale.set(1, 0.85, 1);
    return g;
  },
};

// ---------------------------------------------------------------------------------------------
// Set pieces
// ---------------------------------------------------------------------------------------------

/** The van, facing +X (toward the school). `length` × `width` in tiles. */
export function buildVan(kit: MaterialKit, length: number, width: number): THREE.Group {
  const g = new THREE.Group();
  const body = kit.get(PALETTE.van, { roughness: 0.45, metalness: 0.2 });
  part(box(length * 0.78, 1.1, width * 0.86), body, -length * 0.08, 0.75, 0, g);
  part(box(length * 0.2, 0.75, width * 0.86), body, length * 0.37, 0.58, 0, g);
  part(
    box(0.06, 0.4, width * 0.72),
    kit.get(PALETTE.glass, { roughness: 0.1, metalness: 0.3 }),
    length * 0.3,
    1.02,
    0,
    g,
  );
  const tire = kit.get(PALETTE.tire);
  for (const x of [-length * 0.32, length * 0.3]) {
    for (const z of [-width * 0.43, width * 0.43]) {
      const t = part(cyl(0.26, 0.26, 0.16, 12), tire, x, 0.26, z, g);
      t.rotation.x = Math.PI / 2;
    }
  }
  const rack = kit.get(0x5d6d5e);
  for (let i = 0; i < 4; i++)
    part(box(0.05, 0.05, width * 0.8), rack, -length * 0.38 + i * 0.4, 1.34, 0, g);
  const label = vanLabel();
  for (const side of [-1, 1]) {
    const plane = new THREE.Mesh(
      geo('van-label', () => new THREE.PlaneGeometry(1.7, 0.42)),
      new THREE.MeshBasicMaterial({ map: label, transparent: true }),
    );
    plane.position.set(-length * 0.08, 0.85, side * (width * 0.43 + 0.006));
    plane.rotation.y = side > 0 ? 0 : Math.PI;
    g.add(plane);
  }
  return g;
}

let vanLabelTexture: THREE.CanvasTexture | null = null;
function vanLabel() {
  if (vanLabelTexture) return vanLabelTexture;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 76px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('COPPER CO.', 256, 66);
  vanLabelTexture = new THREE.CanvasTexture(c);
  vanLabelTexture.colorSpace = THREE.SRGBColorSpace;
  return vanLabelTexture;
}

/** A locked door slab with a brass padlock; spans local X, hinge at -X. */
export function buildLockedDoor(kit: MaterialKit): { root: THREE.Group; leaf: THREE.Group } {
  const root = new THREE.Group();
  const leaf = new THREE.Group();
  leaf.position.x = -0.5; // hinge
  root.add(leaf);
  part(box(1, 1.45, 0.1), kit.get(PALETTE.door), 0.5, 0.725, 0, leaf);
  part(
    box(0.12, 0.14, 0.08),
    kit.get(PALETTE.brass, { roughness: 0.3, metalness: 0.8 }),
    0.82,
    0.72,
    0.07,
    leaf,
  );
  part(
    torus(0.05, 0.015),
    kit.get(PALETTE.brass, { roughness: 0.3, metalness: 0.8 }),
    0.82,
    0.8,
    0.07,
    leaf,
  );
  return { root, leaf };
}

export function buildTree(kit: MaterialKit, scale = 1): THREE.Group {
  const g = new THREE.Group();
  part(cyl(0.08, 0.1, 0.6, 6), kit.get(0x6d4c41), 0, 0.3, 0, g);
  const crown = part(
    geo('tree-crown', () => new THREE.IcosahedronGeometry(0.55, 0)),
    kit.get(0x3f6b35),
    0,
    1.0,
    0,
    g,
  );
  crown.scale.set(1, 1.15, 1);
  g.scale.setScalar(scale);
  return g;
}
