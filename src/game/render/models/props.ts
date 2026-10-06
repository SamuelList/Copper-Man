import * as THREE from 'three';
import type { MaterialKit } from '../materials';
import { PALETTE } from '../palette';
import { gauge, metals, type ModelBuilder } from './common';
import { box, cyl, ico, part, pick, rbox, sphere, torus } from './parts';

/**
 * Furniture. Same conventions as fixtures: built to the content `footprint`, back on local -Z
 * for wall-mounted pieces. Tall props reach about wall height; low props stay under 0.8.
 */

/** Material the boiler fire uses; the world flickers its glow. */
export const fireMaterial = (kit: MaterialKit) =>
  kit.get(0xff7a33, { emissive: PALETTE.boilerGlow, roughness: 1 });

export const PROP_MODELS: Record<string, ModelBuilder> = {
  // 0.96 x 0.5 on the wall: a pair of school lockers.
  lockers: (kit, v) => {
    const g = new THREE.Group();
    const color = pick([0x4f6f8f, 0x4f6f8f, 0x5b7fa3, 0x6a5f8f] as const, v);
    const body = kit.get(color, { roughness: 0.45, metalness: 0.45 });
    const door = kit.get(new THREE.Color(color).multiplyScalar(1.12).getHex(), {
      roughness: 0.4,
      metalness: 0.45,
    });
    const dark = kit.get(0x26313d, { roughness: 0.6 });
    const { chrome, brass } = metals(kit);
    part(rbox(0.96, 1.42, 0.46, 0.02), body, 0, 0.79, -0.27, g);
    part(rbox(0.98, 0.05, 0.5, 0.015), dark, 0, 1.52, -0.25, g);
    part(box(0.94, 0.08, 0.44), dark, 0, 0.04, -0.27, g);
    for (const x of [-0.235, 0.235]) {
      part(rbox(0.44, 1.32, 0.025, 0.01), door, x, 0.8, -0.03, g);
      for (let i = 0; i < 4; i++)
        part(box(0.26, 0.014, 0.01), dark, x, 1.28 + i * 0.045, -0.014, g);
      part(rbox(0.035, 0.14, 0.03, 0.01), chrome, x + (x < 0 ? 0.16 : -0.16), 0.82, -0.008, g);
      part(rbox(0.09, 0.04, 0.01, 0.005), brass, x, 1.18, -0.014, g);
    }
    return g;
  },

  // 0.98 x 0.98, centred: a riveted boiler with a fire glowing behind its door.
  boiler: (kit) => {
    const g = new THREE.Group();
    const shell = kit.get(0x8d3b2a, { roughness: 0.5, metalness: 0.45 });
    const band = kit.get(0x4e1f16, { roughness: 0.55, metalness: 0.5 });
    const iron = kit.get(0x2b2b2e, { roughness: 0.6, metalness: 0.6 });
    const { steel, chrome } = metals(kit);
    part(rbox(0.98, 0.1, 0.98, 0.02), kit.get(0x6f6f6f, { roughness: 1 }), 0, 0.05, 0, g);
    part(rbox(0.88, 1.18, 0.88, 0.08), shell, 0, 0.69, 0, g);
    for (const y of [0.28, 0.72, 1.16]) part(rbox(0.91, 0.04, 0.91, 0.02), band, 0, y, 0, g);
    // Rivets along the bands on the two faces the camera sees.
    for (const y of [0.28, 1.16]) {
      for (let i = -3; i <= 3; i++) {
        part(sphere(0.016, 6, 4), band, i * 0.12, y, 0.456, g);
        part(sphere(0.016, 6, 4), band, -0.456, y, i * 0.12, g);
      }
    }
    // Domed top and flue.
    const dome = part(sphere(0.42, 16, 8), shell, 0, 1.28, 0, g);
    dome.scale.set(1, 0.32, 1);
    part(cyl(0.11, 0.11, 0.5, 12), steel, 0.18, 1.55, -0.18, g);
    part(cyl(0.13, 0.13, 0.04, 12), steel, 0.18, 1.8, -0.18, g);
    // Firebox door on the south face, with the fire glowing through.
    part(rbox(0.38, 0.32, 0.04, 0.02), iron, 0, 0.46, 0.45, g);
    part(box(0.28, 0.06, 0.012), fireMaterial(kit), 0, 0.41, 0.473, g);
    part(box(0.28, 0.025, 0.012), fireMaterial(kit), 0, 0.5, 0.473, g);
    part(rbox(0.06, 0.03, 0.03, 0.01), chrome, 0.15, 0.55, 0.475, g);
    // Gauges and a valve on the west face.
    gauge(kit, g, -0.15, 0.95, 0.45, 0.07);
    gauge(kit, g, 0.15, 0.95, 0.45, 0.055);
    const valve = part(torus(0.07, 0.014, 6, 16), kit.get(0xe53935), -0.47, 0.9, 0.15, g);
    valve.rotation.y = Math.PI / 2;
    part(cyl(0.04, 0.04, 0.5, 10), steel, -0.43, 0.9, -0.15, g).rotation.x = Math.PI / 2;
    return g;
  },

  // 0.94 x 0.5 on the wall: steel shelving stacked with supplies.
  shelf: (kit, v) => {
    const g = new THREE.Group();
    const frame = kit.get(0x8f9aa3, { roughness: 0.4, metalness: 0.6 });
    for (const x of [-0.45, 0.45]) {
      for (const z of [-0.47, -0.05]) part(box(0.035, 1.55, 0.035), frame, x, 0.775, z, g);
    }
    const levels = [0.08, 0.55, 1.02, 1.49];
    for (const y of levels) part(rbox(0.94, 0.03, 0.46, 0.008), frame, 0, y, -0.26, g);
    const cardboard = kit.get(0xc49a6c, { roughness: 0.95 });
    const tape = kit.get(0xa77b4f, { roughness: 0.8 });
    // Each shelf gets a different mix of boxes, paint cans, rolls and spray bottles.
    levels.slice(0, 3).forEach((y, i) => {
      const kind = pick(['boxes', 'cans', 'rolls', 'bottles'] as const, v, i);
      if (kind === 'boxes') {
        for (const [x, w, h] of [
          [-0.25, 0.32, 0.3],
          [0.15, 0.36, 0.24],
        ] as const) {
          part(rbox(w, h, 0.36, 0.015), cardboard, x, y + 0.015 + h / 2, -0.26, g);
          part(box(w + 0.002, 0.04, 0.362), tape, x, y + 0.015 + h - 0.06, -0.26, g);
        }
      } else if (kind === 'cans') {
        for (let k = 0; k < 4; k++) {
          const x = -0.33 + k * 0.22;
          part(cyl(0.08, 0.08, 0.16, 14), metals(kit).steel, x, y + 0.095, -0.24, g);
          part(
            cyl(0.081, 0.081, 0.08, 14),
            kit.get(pick([0x1e88e5, 0xe53935, 0x43a047, 0xfdd835] as const, v, k)),
            x,
            y + 0.09,
            -0.24,
            g,
          );
        }
      } else if (kind === 'rolls') {
        const white = kit.get(0xf5f5f5, { roughness: 0.9, flat: false });
        for (let k = 0; k < 6; k++) {
          part(
            cyl(0.065, 0.065, 0.12, 12),
            white,
            -0.34 + (k % 4) * 0.2 + (k > 3 ? 0.1 : 0),
            y + 0.075 + (k > 3 ? 0.12 : 0),
            -0.24,
            g,
          );
        }
      } else {
        for (let k = 0; k < 5; k++) {
          const x = -0.34 + k * 0.17;
          const c = kit.get(pick([0x29b6f6, 0x66bb6a, 0xffffff] as const, v, k), {
            roughness: 0.3,
          });
          part(cyl(0.045, 0.05, 0.2, 10), c, x, y + 0.115, -0.24, g);
          part(rbox(0.04, 0.05, 0.06, 0.01), kit.get(0x37474f), x, y + 0.24, -0.23, g);
        }
      }
    });
    return g;
  },

  // 0.98 x 0.98, centred: a round lounge table with two chairs tucked in, and coffee.
  table: (kit, v) => {
    const g = new THREE.Group();
    const top = kit.get(0x9c7b5b, { roughness: 0.55 });
    const { steelDark, chrome } = metals(kit);
    part(cyl(0.46, 0.46, 0.04, 24), top, 0, 0.5, 0, g);
    part(cyl(0.47, 0.47, 0.015, 24), kit.get(0x6d5238), 0, 0.477, 0, g);
    part(cyl(0.04, 0.05, 0.46, 10), steelDark, 0, 0.24, 0, g);
    for (const a of [0, Math.PI / 2]) {
      part(rbox(0.56, 0.035, 0.07, 0.015), steelDark, 0, 0.02, 0, g).rotation.y = a + Math.PI / 4;
    }
    // Chairs.
    const seat = kit.get(pick([0xef6c00, 0x00897b, 0x8e24aa] as const, v), { roughness: 0.5 });
    for (const side of [-1, 1]) {
      const cx = side * 0.3;
      part(rbox(0.26, 0.03, 0.28, 0.015), seat, cx, 0.3, side * 0.12, g);
      part(rbox(0.03, 0.2, 0.26, 0.012), seat, cx + side * 0.13, 0.43, side * 0.12, g);
      for (const dz of [-0.1, 0.1]) {
        part(cyl(0.012, 0.012, 0.3, 6), chrome, cx + side * 0.1, 0.15, side * 0.12 + dz, g);
        part(cyl(0.012, 0.012, 0.3, 6), chrome, cx - side * 0.1, 0.15, side * 0.12 + dz, g);
      }
    }
    // Mug, papers, and a box of donuts.
    const mug = kit.get(0xfafafa, { roughness: 0.3, flat: false });
    part(cyl(0.045, 0.04, 0.09, 12), mug, 0.18, 0.565, 0.16, g);
    part(cyl(0.04, 0.04, 0.005, 12), kit.get(0x4e342e), 0.18, 0.607, 0.16, g);
    part(torus(0.028, 0.008, 6, 10), mug, 0.225, 0.565, 0.16, g);
    const paper = part(box(0.21, 0.004, 0.28), kit.get(0xf5f5f0), -0.15, 0.523, 0.12, g);
    paper.rotation.y = 0.3 + v;
    part(rbox(0.3, 0.06, 0.24, 0.01), kit.get(0xf48fb1, { roughness: 0.7 }), -0.02, 0.55, -0.2, g);
    for (let i = 0; i < 3; i++) {
      const donut = part(
        torus(0.04, 0.02, 6, 12),
        kit.get(i === 1 ? 0x6d4c41 : 0xf8bbd0, { flat: false }),
        -0.1 + i * 0.08,
        0.59,
        -0.2,
        g,
      );
      donut.rotation.x = Math.PI / 2;
    }
    return g;
  },

  // 0.98 x 0.56 on the wall: a slatted wooden hallway bench.
  bench: (kit, v) => {
    const g = new THREE.Group();
    const wood = kit.get(0x8d6240, { roughness: 0.7 });
    const woodLight = kit.get(0xa4774f, { roughness: 0.7 });
    const { steelDark } = metals(kit);
    for (let i = 0; i < 3; i++) {
      part(rbox(0.96, 0.035, 0.13, 0.012), i % 2 ? wood : woodLight, 0, 0.42, -0.34 + i * 0.15, g);
    }
    for (const [y, z] of [
      [0.6, -0.45],
      [0.76, -0.47],
    ] as const) {
      const slat = part(rbox(0.96, 0.1, 0.03, 0.012), woodLight, 0, y, z, g);
      slat.rotation.x = -0.12;
    }
    for (const x of [-0.42, 0.42]) {
      part(rbox(0.05, 0.4, 0.42, 0.015), steelDark, x, 0.2, -0.24, g);
      part(rbox(0.05, 0.42, 0.04, 0.015), steelDark, x, 0.62, -0.46, g);
      part(rbox(0.06, 0.03, 0.42, 0.012), steelDark, x, 0.56, -0.24, g);
    }
    // Sometimes a forgotten backpack.
    if (v > 0.5) {
      const pack = kit.get(pick([0xe53935, 0x1e88e5, 0x7cb342] as const, v), { roughness: 0.8 });
      part(rbox(0.26, 0.3, 0.14, 0.05), pack, 0.2, 0.6, -0.28, g);
      part(rbox(0.18, 0.12, 0.05, 0.03), pack, 0.2, 0.55, -0.19, g);
    }
    return g;
  },

  // 0.7 x 0.7, centred: a terracotta planter with a leafy shrub (sometimes in flower).
  planter: (kit, v) => {
    const g = new THREE.Group();
    const pot = kit.get(0xb5653a, { roughness: 0.85 });
    part(rbox(0.66, 0.32, 0.66, 0.05), pot, 0, 0.16, 0, g);
    part(rbox(0.7, 0.06, 0.7, 0.025), kit.get(0x9a5230, { roughness: 0.85 }), 0, 0.33, 0, g);
    part(box(0.58, 0.02, 0.58), kit.get(0x3e2a1e, { roughness: 1 }), 0, 0.35, 0, g);
    const greens = [0x4f7a3a, 0x5d8c44, 0x3f6b35];
    const leaves: [number, number, number, number][] = [
      [0, 0.62, 0, 0.27],
      [-0.12, 0.55, 0.1, 0.2],
      [0.13, 0.52, -0.08, 0.19],
      [0.06, 0.78, 0.04, 0.17],
    ];
    leaves.forEach(([x, y, z, r], i) => {
      part(ico(r, 1), kit.get(greens[i % greens.length]!, { roughness: 0.9 }), x, y, z, g);
    });
    if (v > 0.4) {
      const bloom = kit.get(pick([0xef5350, 0xffca28, 0xf06292, 0xffffff] as const, v), {
        roughness: 0.6,
      });
      for (let i = 0; i < 6; i++) {
        const a = i * 1.1 + v * 3;
        part(
          sphere(0.04, 6, 5),
          bloom,
          Math.cos(a) * 0.2,
          0.62 + (i % 3) * 0.08,
          Math.sin(a) * 0.2,
          g,
        );
      }
    }
    return g;
  },

  // 0.08 x 0.95 on the wall: a stall divider sticking out between two toilets.
  stall: (kit) => {
    const g = new THREE.Group();
    const panel = kit.get(0x7e9aa6, { roughness: 0.4, metalness: 0.2 });
    const { chrome } = metals(kit);
    part(rbox(0.06, 1.3, 0.9, 0.02), panel, 0, 0.83, -0.04, g);
    part(box(0.04, 0.04, 0.95), chrome, 0, 1.5, -0.03, g);
    for (const z of [-0.3, 0.32]) part(cyl(0.02, 0.025, 0.18, 8), chrome, 0, 0.09, z, g);
    return g;
  },

  // 0.45 x 0.45, centred: a bin (sometimes the blue recycling one).
  'trash-can': (kit, v) => {
    const g = new THREE.Group();
    const color = v > 0.6 ? 0x1e88e5 : 0x546e7a;
    part(cyl(0.2, 0.17, 0.5, 14), kit.get(color, { roughness: 0.55, flat: false }), 0, 0.25, 0, g);
    part(torus(0.2, 0.018, 6, 18), kit.get(color, { roughness: 0.5 }), 0, 0.5, 0, g).rotation.x =
      Math.PI / 2;
    part(cyl(0.19, 0.19, 0.02, 14), kit.get(0x212121, { roughness: 0.8 }), 0, 0.49, 0, g);
    return g;
  },

  // 0.96 x 0.42 on the wall: a tall bookshelf, stuffed.
  bookshelf: (kit, v) => {
    const g = new THREE.Group();
    const wood = kit.get(0x8d6240, { roughness: 0.7 });
    part(box(0.96, 1.55, 0.03), kit.get(0x6d4c35, { roughness: 0.8 }), 0, 0.78, -0.485, g);
    for (const x of [-0.465, 0.465]) part(rbox(0.03, 1.55, 0.42, 0.01), wood, x, 0.78, -0.29, g);
    const shelves = [0.05, 0.42, 0.79, 1.16, 1.53];
    for (const y of shelves) part(rbox(0.96, 0.03, 0.42, 0.01), wood, 0, y, -0.29, g);
    const colors = [0xc0392b, 0x2e86c1, 0x27ae60, 0x8e44ad, 0xf39c12, 0x16a085, 0x5d4037, 0xeceff1];
    shelves.slice(0, 4).forEach((y, s) => {
      let x = -0.43;
      let k = 0;
      while (x < 0.4) {
        const w = 0.05 + ((k * 37 + s * 11 + Math.round(v * 13)) % 4) * 0.015;
        const h = 0.24 + ((k * 23 + s * 7) % 5) * 0.02;
        const book = part(
          box(w, h, 0.3),
          kit.get(pick(colors, v, k + s * 9), { roughness: 0.8 }),
          x + w / 2,
          y + 0.015 + h / 2,
          -0.31,
          g,
        );
        if ((k + s) % 7 === 6) book.rotation.z = 0.25;
        x += w + 0.008;
        k++;
      }
    });
    return g;
  },

  // 0.98 x 0.62 on the wall: a stainless kitchen counter with pans on top.
  counter: (kit, v) => {
    const g = new THREE.Group();
    const { steel, steelDark } = metals(kit);
    part(
      rbox(0.98, 0.82, 0.58, 0.02),
      kit.get(0xcfd8dc, { roughness: 0.35, metalness: 0.5 }),
      0,
      0.41,
      -0.2,
      g,
    );
    part(rbox(0.98, 0.04, 0.62, 0.01), steel, 0, 0.84, -0.19, g);
    for (const x of [-0.24, 0.24]) {
      part(box(0.44, 0.004, 0.004), steelDark, x, 0.6, 0.09, g);
      part(box(0.004, 0.62, 0.004), steelDark, x + 0.22, 0.4, 0.09, g);
    }
    if (v > 0.3) {
      part(cyl(0.12, 0.11, 0.12, 14), steel, -0.22, 0.92, -0.2, g);
      part(box(0.3, 0.02, 0.2), kit.get(0xa1887f, { roughness: 0.8 }), 0.2, 0.87, -0.15, g);
    }
    return g;
  },
};
