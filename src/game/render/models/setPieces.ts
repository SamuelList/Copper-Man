import * as THREE from 'three';
import type { MaterialKit } from '../materials';
import { PALETTE } from '../palette';
import { metals } from './fixtures';
import { box, canvasTexture, cyl, ico, part, plane, rbox, sphere, torus } from './parts';

const vanLabel = () =>
  canvasTexture('van-label', 512, 128, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 76px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('COPPER CO.', 256, 60);
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.fillText('SCRAP · PLUMBING · HVAC', 256, 110);
  });

/** The work van, facing +X (toward the school). `length` × `width` in tiles. */
export function buildVan(kit: MaterialKit, length: number, width: number): THREE.Group {
  const g = new THREE.Group();
  const paint = kit.get(PALETTE.van, { roughness: 0.35, metalness: 0.3 });
  const paintDark = kit.get(PALETTE.vanDark, { roughness: 0.4, metalness: 0.3 });
  const glass = kit.get(0x223a4d, { roughness: 0.05, metalness: 0.6 });
  const trim = kit.get(0x1f2326, { roughness: 0.7 });
  const { chrome, copper, copperDark, rubber } = metals(kit);
  const L = length;
  const W = width * 0.86;

  // Cargo box + cab + hood.
  part(rbox(L * 0.66, 1.08, W, 0.14), paint, -L * 0.12, 0.8, 0, g);
  part(rbox(L * 0.2, 0.98, W * 0.98, 0.14), paint, L * 0.27, 0.75, 0, g);
  part(rbox(L * 0.14, 0.52, W * 0.96, 0.12), paint, L * 0.42, 0.52, 0, g);
  // Lower two-tone stripe and bumpers.
  part(rbox(L * 0.98, 0.18, W * 1.01, 0.05), paintDark, 0, 0.36, 0, g);
  part(rbox(0.12, 0.16, W * 1.02, 0.05), trim, L * 0.49, 0.32, 0, g);
  part(rbox(0.12, 0.16, W * 1.02, 0.05), trim, -L * 0.49, 0.32, 0, g);
  // Windscreen leaning back, side windows, grille, lights.
  const screen = part(rbox(0.05, 0.42, W * 0.84, 0.02), glass, L * 0.37, 1.0, 0, g);
  screen.rotation.z = 0.42;
  for (const side of [-1, 1]) {
    part(box(L * 0.13, 0.32, 0.01), glass, L * 0.27, 1.0, side * (W * 0.49 + 0.002), g);
    part(rbox(0.05, 0.08, 0.1, 0.02), trim, L * 0.33, 0.95, side * (W * 0.5 + 0.05), g);
    // Sliding door seam and handle.
    part(box(0.015, 0.8, 0.005), trim, L * 0.02, 0.8, side * (W * 0.5 + 0.002), g);
    part(rbox(0.12, 0.03, 0.02, 0.01), chrome, -L * 0.02, 0.8, side * (W * 0.5 + 0.008), g);
  }
  part(box(0.02, 0.18, W * 0.5), trim, L * 0.49 + 0.01, 0.55, 0, g);
  for (const z of [-W * 0.36, W * 0.36]) {
    part(
      rbox(0.04, 0.1, 0.18, 0.02),
      kit.get(0xfffde7, { emissive: 0xfff59d }),
      L * 0.495,
      0.58,
      z,
      g,
    );
    part(
      rbox(0.04, 0.16, 0.1, 0.02),
      kit.get(0xd32f2f, { emissive: 0x8e0000 }),
      -L * 0.455,
      0.78,
      z,
      g,
    );
  }
  // Rear doors.
  part(box(0.01, 0.9, 0.015), trim, -L * 0.455, 0.82, 0, g);
  // Wheels with hubcaps.
  for (const x of [-L * 0.3, L * 0.3]) {
    for (const z of [-W * 0.5, W * 0.5]) {
      part(cyl(0.27, 0.27, 0.2, 16), rubber, x, 0.27, z, g).rotation.x = Math.PI / 2;
      part(cyl(0.14, 0.14, 0.21, 12), chrome, x, 0.27, z, g).rotation.x = Math.PI / 2;
    }
  }
  // Roof rack with a load of copper pipe strapped on.
  const rack = kit.get(0x37474f, { roughness: 0.5, metalness: 0.6 });
  for (const z of [-W * 0.4, W * 0.4]) part(box(L * 0.62, 0.04, 0.04), rack, -L * 0.12, 1.4, z, g);
  for (let i = 0; i < 4; i++)
    part(box(0.04, 0.04, W * 0.84), rack, -L * 0.4 + i * L * 0.18, 1.38, 0, g);
  for (let i = 0; i < 5; i++) {
    const p = part(
      cyl(0.04, 0.04, L * 0.66, 8),
      i % 2 ? copper : copperDark,
      -L * 0.12,
      1.46,
      (i - 2) * 0.09,
      g,
    );
    p.rotation.z = Math.PI / 2;
  }
  // Logo on both flanks.
  const label = kit.get(0xffffff, { map: vanLabel(), opacity: 0.999, roughness: 0.4 });
  for (const side of [-1, 1]) {
    const decal = part(plane(1.7, 0.42), label, -L * 0.12, 0.88, side * (W * 0.5 + 0.004), g);
    decal.rotation.y = side > 0 ? 0 : Math.PI;
    decal.castShadow = false;
  }
  return g;
}

const staffOnlySign = () =>
  canvasTexture('staff-only', 128, 64, (ctx) => {
    ctx.fillStyle = '#c62828';
    ctx.fillRect(0, 0, 128, 64);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 4;
    ctx.strokeRect(4, 4, 120, 56);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('STAFF', 64, 22);
    ctx.fillText('ONLY', 64, 44);
  });

/**
 * A locked door in its frame, spanning local X across the doorway. The frame is static; the
 * leaf swings open about its hinge at -X when the door is unlocked.
 */
export function buildLockedDoor(kit: MaterialKit): { root: THREE.Group; leaf: THREE.Group } {
  const root = new THREE.Group();
  const frame = kit.get(0x5d4037, { roughness: 0.7 });
  for (const x of [-0.47, 0.47]) part(rbox(0.07, 1.58, 0.2, 0.015), frame, x, 0.79, 0, root);
  part(rbox(1.0, 0.08, 0.2, 0.015), frame, 0, 1.56, 0, root);

  const leaf = new THREE.Group();
  leaf.position.x = -0.44; // hinge
  root.add(leaf);
  const wood = kit.get(PALETTE.door, { roughness: 0.6 });
  const panel = kit.get(0x7a5c52, { roughness: 0.6 });
  const { brass, chrome, steel } = metals(kit);
  part(rbox(0.88, 1.5, 0.07, 0.015), wood, 0.44, 0.76, 0, leaf);
  for (const z of [-0.04, 0.04]) {
    part(rbox(0.3, 0.42, 0.015, 0.01), panel, 0.26, 0.42, z, leaf);
    part(rbox(0.3, 0.42, 0.015, 0.01), panel, 0.62, 0.42, z, leaf);
    part(
      box(0.5, 0.3, 0.012),
      kit.get(0x9ec9e8, { roughness: 0.05, metalness: 0.4 }),
      0.44,
      1.12,
      z,
      leaf,
    );
    part(rbox(0.8, 0.1, 0.012, 0.004), steel, 0.44, 0.08, z * 1.05, leaf);
  }
  // Sign, handle, hasp and padlock (south face).
  const sign = part(
    plane(0.28, 0.14),
    kit.get(0xffffff, { map: staffOnlySign() }),
    0.44,
    0.84,
    0.043,
    leaf,
  );
  sign.castShadow = false;
  part(rbox(0.04, 0.16, 0.05, 0.015), chrome, 0.8, 0.74, 0.06, leaf);
  part(rbox(0.16, 0.03, 0.02, 0.008), steel, 0.86, 0.6, 0.05, leaf);
  part(rbox(0.12, 0.14, 0.06, 0.02), brass, 0.86, 0.52, 0.07, leaf);
  part(torus(0.045, 0.012, 6, 12), chrome, 0.86, 0.6, 0.07, leaf);
  return { root, leaf };
}

/** A broadleaf tree: tapered trunk under a cluster of rounded leaf clumps. */
export function buildTree(kit: MaterialKit, scale = 1, variant = 0): THREE.Group {
  const g = new THREE.Group();
  const bark = kit.get(0x6d4c41, { roughness: 0.95 });
  part(cyl(0.07, 0.12, 0.8, 7), bark, 0, 0.4, 0, g);
  const branch = part(cyl(0.035, 0.05, 0.35, 6), bark, 0.1, 0.75, 0, g);
  branch.rotation.z = -0.7;
  const greens = [0x3f6b35, 0x4f7f3c, 0x5a8f45];
  const clumps: [number, number, number, number][] = [
    [0, 1.15, 0, 0.5],
    [0.28, 1.0, 0.15, 0.36],
    [-0.25, 1.02, -0.12, 0.38],
    [0.05, 1.45, -0.05, 0.34],
    [-0.1, 1.05, 0.28, 0.3],
  ];
  clumps.forEach(([x, y, z, r], i) => {
    part(
      ico(r, 1),
      kit.get(greens[(i + Math.round(variant * 3)) % greens.length]!, { roughness: 0.9 }),
      x,
      y,
      z,
      g,
    );
  });
  g.scale.setScalar(scale);
  g.rotation.y = variant * Math.PI * 2;
  return g;
}

/** A low shrub for the verge. */
export function buildBush(kit: MaterialKit, scale = 1): THREE.Group {
  const g = new THREE.Group();
  const greens = [0x46703a, 0x55823f];
  for (const [x, y, z, r] of [
    [0, 0.22, 0, 0.3],
    [0.25, 0.16, 0.1, 0.22],
    [-0.22, 0.15, -0.08, 0.22],
  ] as const) {
    part(ico(r, 1), kit.get(greens[x > 0 ? 1 : 0]!, { roughness: 0.95 }), x, y, z, g);
  }
  g.scale.setScalar(scale);
  return g;
}

/** A parking-lot lamp post with a glowing head. */
export function buildLampPost(kit: MaterialKit): THREE.Group {
  const g = new THREE.Group();
  const pole = kit.get(0x37474f, { roughness: 0.5, metalness: 0.6 });
  part(cyl(0.12, 0.15, 0.12, 10), kit.get(0x8d8d8d, { roughness: 1 }), 0, 0.06, 0, g);
  part(cyl(0.04, 0.05, 2.4, 8), pole, 0, 1.25, 0, g);
  const arm = part(cyl(0.025, 0.025, 0.5, 6), pole, 0.22, 2.42, 0, g);
  arm.rotation.z = Math.PI / 2;
  part(rbox(0.32, 0.08, 0.18, 0.03), pole, 0.45, 2.4, 0, g);
  part(box(0.26, 0.02, 0.12), kit.get(0xfffde7, { emissive: 0xfff3c4 }), 0.45, 2.355, 0, g);
  return g;
}

/** Sleepy coworker curled up on a blanket with a pillow and a knocked-over coffee. */
export function buildCoworker(kit: MaterialKit): THREE.Group {
  const root = new THREE.Group();
  part(rbox(0.92, 0.04, 0.62, 0.02), kit.get(0x7e57c2, { roughness: 1 }), 0, 0.02, 0, root);
  part(rbox(0.24, 0.08, 0.34, 0.04), kit.get(0xf5f5f5, { roughness: 1 }), -0.33, 0.07, 0, root);
  // Body under a blanket, head on the pillow, boots poking out.
  const body = part(
    rbox(0.56, 0.18, 0.34, 0.08),
    kit.get(0x9575cd, { roughness: 1 }),
    0.05,
    0.13,
    0,
    root,
  );
  body.rotation.y = 0.05;
  part(sphere(0.12, 12, 10), kit.get(PALETTE.skin, { flat: false }), -0.3, 0.19, 0.02, root);
  part(cyl(0.125, 0.13, 0.06, 12), kit.get(0x26a69a), -0.34, 0.24, 0.02, root).rotation.z = 0.9;
  for (const z of [-0.07, 0.07]) {
    part(rbox(0.1, 0.09, 0.08, 0.02), kit.get(0x3e2723), 0.36, 0.06, z, root);
  }
  const cup = part(
    cyl(0.035, 0.03, 0.08, 10),
    kit.get(0xffffff, { flat: false }),
    0.2,
    0.07,
    0.3,
    root,
  );
  cup.rotation.x = Math.PI / 2;
  part(cyl(0.09, 0.09, 0.004, 12), kit.get(0x5d4037, { roughness: 0.1 }), 0.24, 0.042, 0.38, root);
  return root;
}
