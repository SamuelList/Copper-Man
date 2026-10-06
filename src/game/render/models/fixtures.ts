import * as THREE from 'three';
import { PALETTE } from '../palette';
import { gauge, metals, type ModelBuilder } from './common';
import { box, cyl, ico, lathe, part, pick, rbox, sphere, torus } from './parts';
import { TECHNICAL_MODELS } from './technical';

/**
 * Scrappable fixtures. Units are tiles; the origin is the tile centre on the floor.
 *
 * Every model fills its content `footprint` (core/content/fixtures.ts), which is also its hitbox:
 * - `anchor: 'wall'`: back against the wall on local -Z (z = -0.5), front at z = -0.5 + d.
 * - `anchor: 'center'`: centred, spanning ±w/2 in X and ±d/2 in Z.
 *
 * `variant` (0..1, stable per tile) picks small details so rows of the same object differ.
 */

const BOOK_COLORS = [0xc0392b, 0x2e86c1, 0x27ae60, 0x8e44ad, 0xf39c12, 0x16a085] as const;

export const FIXTURE_MODELS: Record<string, ModelBuilder> = {
  ...TECHNICAL_MODELS,
  // 0.8 x 0.8, centred: a pallet of stripped copper pipe and wire.
  'copper-pile': (kit, v) => {
    const g = new THREE.Group();
    const { copper, copperDark, brass } = metals(kit);
    const pallet = kit.get(0xb08a5b, { roughness: 0.95 });
    const palletDark = kit.get(0x8a6a44, { roughness: 0.95 });
    for (const z of [-0.33, 0, 0.33])
      part(rbox(0.8, 0.07, 0.12, 0.015), palletDark, 0, 0.035, z, g);
    for (const x of [-0.3, -0.1, 0.1, 0.3]) {
      part(rbox(0.16, 0.035, 0.8, 0.01), pallet, x, 0.088, 0, g);
    }
    // Pipe bundle stacked 4-3-2.
    const rows = [4, 3, 2];
    rows.forEach((n, layer) => {
      for (let i = 0; i < n; i++) {
        const p = part(
          cyl(0.045, 0.045, 0.74, 10),
          (i + layer) % 2 ? copper : copperDark,
          0,
          0.15 + layer * 0.078,
          (i - (n - 1) / 2) * 0.092 - 0.12,
          g,
        );
        p.rotation.z = Math.PI / 2;
      }
    });
    // Strap around the bundle.
    part(rbox(0.04, 0.27, 0.41, 0.01), kit.get(0x37474f), 0.2, 0.22, -0.12, g);
    // A coil of wire and a few fittings.
    for (let i = 0; i < 3; i++) {
      const coil = part(
        torus(0.15, 0.03, 6, 18),
        i % 2 ? copper : copperDark,
        0.16,
        0.13 + i * 0.05,
        0.22,
        g,
      );
      coil.rotation.x = Math.PI / 2;
    }
    const elbow = part(torus(0.06, 0.028, 6, 10), brass, -0.22, 0.14, 0.24, g);
    elbow.rotation.set(Math.PI / 2, 0, v * Math.PI);
    part(cyl(0.035, 0.035, 0.1, 8), brass, -0.08, 0.13, 0.26, g).rotation.z = Math.PI / 2;
    return g;
  },

  // 0.55 x 0.46 on the wall: stainless drinking fountain with a chrome bubbler.
  'drinking-fountain': (kit) => {
    const g = new THREE.Group();
    const { chrome, steel, steelDark } = metals(kit);
    const body = kit.get(0xc9d1d7, { roughness: 0.28, metalness: 0.7 });
    part(rbox(0.55, 0.62, 0.04, 0.015), steel, 0, 0.72, -0.48, g);
    part(rbox(0.52, 0.2, 0.42, 0.06), body, 0, 0.86, -0.25, g);
    // Tapered underside.
    part(rbox(0.4, 0.14, 0.3, 0.05), body, 0, 0.72, -0.32, g);
    // Basin recess and drain.
    part(rbox(0.4, 0.03, 0.26, 0.04), steelDark, 0, 0.955, -0.22, g);
    part(cyl(0.03, 0.03, 0.01, 10), kit.get(0x263238), 0, 0.972, -0.2, g);
    // Bubbler + push button.
    part(cyl(0.025, 0.03, 0.07, 10), chrome, 0.1, 1.0, -0.3, g);
    part(sphere(0.026, 10, 8), chrome, 0.1, 1.04, -0.29, g);
    const button = part(cyl(0.035, 0.035, 0.03, 12), chrome, 0.16, 0.86, -0.03, g);
    button.rotation.x = Math.PI / 2;
    // Supply pipe to the floor.
    part(cyl(0.022, 0.022, 0.66, 8), chrome, -0.12, 0.33, -0.45, g);
    part(cyl(0.05, 0.05, 0.02, 10), chrome, -0.12, 0.01, -0.45, g);
    return g;
  },

  // 0.85 x 0.31 on the wall: enamel heater cabinet with a glowing element behind the grille.
  'wall-heater': (kit) => {
    const g = new THREE.Group();
    const enamel = kit.get(0xd6653c, { roughness: 0.45, metalness: 0.2 });
    const grille = kit.get(0x4a2418, { roughness: 0.6, metalness: 0.4 });
    const { chrome, steelDark } = metals(kit);
    part(rbox(0.85, 0.52, 0.27, 0.05), enamel, 0, 0.38, -0.355, g);
    part(box(0.68, 0.3, 0.01), kit.get(0x1c0f0a), -0.05, 0.36, -0.214, g);
    part(box(0.66, 0.025, 0.01), kit.get(0xff8a3d, { emissive: 0xff5a1a }), -0.05, 0.25, -0.212, g);
    for (let i = 0; i < 6; i++) {
      part(rbox(0.7, 0.022, 0.03, 0.008), grille, -0.05, 0.24 + i * 0.05, -0.205, g);
    }
    // Controls.
    part(cyl(0.035, 0.035, 0.03, 12), chrome, 0.35, 0.5, -0.21, g).rotation.x = Math.PI / 2;
    part(sphere(0.014, 8, 6), kit.get(0xff1744, { emissive: 0xd50000 }), 0.35, 0.4, -0.215, g);
    for (const x of [-0.34, 0.34]) part(rbox(0.08, 0.1, 0.2, 0.015), steelDark, x, 0.05, -0.37, g);
    return g;
  },

  // 0.5 x 0.23 on the wall: compressed-air manifold with a gauge, valve wheel and hose.
  'air-line': (kit) => {
    const g = new THREE.Group();
    const pipe = kit.get(0x4f9d8f, { roughness: 0.35, metalness: 0.4, flat: false });
    const { chrome, brass, steelDark } = metals(kit);
    for (const x of [-0.16, 0.16]) {
      part(cyl(0.04, 0.04, 1.42, 12), pipe, x, 0.71, -0.42, g);
      for (const y of [0.25, 1.15]) part(rbox(0.12, 0.05, 0.1, 0.015), steelDark, x, y, -0.45, g);
      part(cyl(0.06, 0.06, 0.04, 12), pipe, x, 0.02, -0.42, g);
    }
    const cross = part(cyl(0.035, 0.035, 0.34, 12), pipe, 0, 0.78, -0.42, g);
    cross.rotation.z = Math.PI / 2;
    for (const x of [-0.16, 0.16]) part(sphere(0.055, 12, 8), pipe, x, 0.78, -0.42, g);
    // Gauge and valve.
    part(cyl(0.015, 0.015, 0.08, 8), brass, 0, 0.95, -0.42, g);
    gauge(kit, g, 0, 1.03, -0.36, 0.065);
    part(torus(0.085, 0.016, 6, 18), kit.get(0xe53935, { roughness: 0.4 }), 0, 0.6, -0.31, g);
    for (const a of [0, Math.PI / 2]) {
      part(box(0.16, 0.014, 0.014), kit.get(0xe53935), 0, 0.6, -0.31, g).rotation.z = a;
    }
    part(cyl(0.02, 0.02, 0.1, 8), brass, 0, 0.6, -0.36, g).rotation.x = Math.PI / 2;
    // Coiled yellow hose hanging on a hook.
    part(cyl(0.012, 0.012, 0.12, 6), chrome, 0.08, 0.5, -0.44, g).rotation.x = Math.PI / 2;
    for (let i = 0; i < 2; i++) {
      const hose = part(
        torus(0.11, 0.018, 6, 18),
        kit.get(0xfdd835, { roughness: 0.6 }),
        0.08,
        0.4 - i * 0.02,
        -0.33 - i * 0.025,
        g,
      );
      hose.rotation.y = 0.15 * i;
    }
    return g;
  },

  // 0.9 x 0.27 on the wall: cast-iron column radiator.
  radiator: (kit) => {
    const g = new THREE.Group();
    const iron = kit.get(0xd2c8bb, { roughness: 0.55, metalness: 0.35 });
    const ironDark = kit.get(0xa59a8c, { roughness: 0.6, metalness: 0.35 });
    const { brass, chrome } = metals(kit);
    for (let i = -4; i <= 4; i++) {
      part(rbox(0.075, 0.6, 0.19, 0.035), i % 2 ? iron : ironDark, i * 0.096, 0.4, -0.38, g);
    }
    for (const y of [0.13, 0.66]) {
      part(cyl(0.032, 0.032, 0.88, 10), iron, 0, y, -0.38, g).rotation.z = Math.PI / 2;
    }
    for (const x of [-0.36, 0.36]) part(rbox(0.07, 0.1, 0.17, 0.02), ironDark, x, 0.05, -0.38, g);
    // Valve and supply pipe.
    part(cyl(0.022, 0.022, 0.12, 8), chrome, 0.47, 0.1, -0.38, g);
    part(cyl(0.04, 0.04, 0.04, 12), brass, 0.47, 0.2, -0.38, g);
    part(cyl(0.022, 0.022, 0.08, 8), chrome, 0.47, 0.23, -0.38, g);
    return g;
  },

  // 0.5 x 0.68 on the wall: porcelain toilet with a cistern.
  toilet: (kit) => {
    const g = new THREE.Group();
    const porcelain = kit.get(0xf7f7f4, { roughness: 0.16, flat: false });
    const { chrome } = metals(kit);
    part(rbox(0.44, 0.34, 0.17, 0.045), porcelain, 0, 0.62, -0.4, g);
    part(rbox(0.47, 0.045, 0.2, 0.02), porcelain, 0, 0.81, -0.39, g);
    part(rbox(0.07, 0.02, 0.03, 0.008), chrome, -0.15, 0.72, -0.3, g);
    // Bowl: a closed lathe profile (outside up, rim, then the inside down to the water).
    const bowl = part(
      lathe('toilet-bowl', [
        [0.0, 0.0],
        [0.12, 0.0],
        [0.13, 0.08],
        [0.12, 0.16],
        [0.17, 0.3],
        [0.2, 0.37],
        [0.205, 0.39],
        [0.175, 0.395],
        [0.15, 0.36],
        [0.1, 0.3],
        [0.0, 0.29],
      ]),
      porcelain,
      0,
      0,
      -0.13,
      g,
    );
    bowl.scale.set(1, 1, 1.3);
    const water = part(
      cyl(0.11, 0.11, 0.005, 16),
      kit.get(0x9fd3e6, { roughness: 0.05 }),
      0,
      0.305,
      -0.13,
      g,
    );
    water.scale.set(1, 1, 1.3);
    const seat = part(
      torus(0.16, 0.024, 8, 24),
      kit.get(0xfafafa, { roughness: 0.3, flat: false }),
      0,
      0.405,
      -0.12,
      g,
    );
    seat.rotation.x = Math.PI / 2;
    seat.scale.set(1, 1.28, 1);
    return g;
  },

  // 0.7 x 0.65 on the wall: floor mop sink with a bucket and a mop.
  'mop-sink': (kit, v) => {
    const g = new THREE.Group();
    const { chrome, steel } = metals(kit);
    const basin = kit.get(0xe0e3e5, { roughness: 0.3, metalness: 0.2 });
    part(rbox(0.66, 0.26, 0.6, 0.05), basin, 0, 0.13, -0.2, g);
    part(rbox(0.54, 0.02, 0.48, 0.04), kit.get(0x6f7a80), 0, 0.255, -0.2, g);
    // Wall faucet.
    for (const x of [-0.1, 0.1]) {
      part(cyl(0.02, 0.02, 0.06, 8), chrome, x, 0.72, -0.47, g).rotation.x = Math.PI / 2;
      part(rbox(0.06, 0.02, 0.02, 0.006), chrome, x, 0.72, -0.43, g);
    }
    part(cyl(0.02, 0.02, 0.2, 8), chrome, 0, 0.72, -0.4, g).rotation.x = Math.PI / 2;
    part(cyl(0.02, 0.02, 0.1, 8), chrome, 0, 0.67, -0.31, g);
    // Yellow mop bucket with wringer.
    const yellow = kit.get(0xf9c623, { roughness: 0.5 });
    part(cyl(0.13, 0.11, 0.22, 14), yellow, -0.17, 0.37, -0.15, g);
    part(rbox(0.2, 0.08, 0.12, 0.02), kit.get(0x37474f), -0.17, 0.5, -0.17, g);
    part(cyl(0.11, 0.11, 0.01, 14), kit.get(0x7da3ad, { roughness: 0.1 }), -0.17, 0.46, -0.15, g);
    // Mop leaning against the wall.
    const handle = part(cyl(0.016, 0.016, 1.15, 8), kit.get(0xa1887f), 0.2, 0.75, -0.38, g);
    handle.rotation.set(0.22, 0, -0.18 + v * 0.1);
    const head = part(ico(0.1, 1), kit.get(0xdedbd2, { roughness: 1 }), 0.1, 0.32, -0.25, g);
    head.scale.set(1.2, 0.6, 1);
    part(rbox(0.14, 0.04, 0.1, 0.01), steel, 0.12, 0.38, -0.27, g);
    return g;
  },

  // 0.6 x 0.45, centred: the teacher's side table with a brass desk lamp.
  lamp: (kit, v) => {
    const g = new THREE.Group();
    const wood = kit.get(PALETTE.wood, { roughness: 0.7 });
    const woodDark = kit.get(PALETTE.woodDark, { roughness: 0.7 });
    const { brass } = metals(kit);
    part(rbox(0.6, 0.045, 0.45, 0.015), wood, 0, 0.52, 0, g);
    part(rbox(0.54, 0.1, 0.4, 0.01), woodDark, 0, 0.44, 0, g);
    part(rbox(0.2, 0.05, 0.02, 0.008), brass, 0, 0.44, 0.205, g);
    for (const [x, z] of [
      [-0.26, -0.18],
      [0.26, -0.18],
      [-0.26, 0.18],
      [0.26, 0.18],
    ] as const) {
      part(cyl(0.022, 0.016, 0.44, 8), woodDark, x, 0.22, z, g);
    }
    // Lamp: base, arm, shade, glowing bulb.
    part(cyl(0.07, 0.085, 0.03, 14), brass, 0.12, 0.558, -0.05, g);
    const arm1 = part(cyl(0.012, 0.012, 0.22, 8), brass, 0.12, 0.67, -0.05, g);
    arm1.rotation.z = -0.25;
    part(sphere(0.02, 8, 6), brass, 0.15, 0.78, -0.05, g);
    const shade = part(
      cyl(0.05, 0.11, 0.13, 14),
      kit.get(0x2e7d32, { roughness: 0.4, metalness: 0.3 }),
      0.06,
      0.8,
      -0.05,
      g,
    );
    shade.rotation.z = 0.5;
    part(sphere(0.035, 10, 8), kit.get(0xfff8e1, { emissive: 0xffe082 }), 0.04, 0.76, -0.05, g);
    // A stack of books and an apple for the teacher.
    for (let i = 0; i < 2 + Math.floor(v * 2); i++) {
      const b = part(
        rbox(0.17, 0.035, 0.23, 0.008),
        kit.get(pick(BOOK_COLORS, v, i)),
        -0.15,
        0.562 + i * 0.036,
        0.03,
        g,
      );
      b.rotation.y = (i - 1) * 0.15;
    }
    part(
      sphere(0.04, 10, 8),
      kit.get(0xd32f2f, { roughness: 0.35, flat: false }),
      0.18,
      0.585,
      0.13,
      g,
    );
    return g;
  },

  // 0.7 x 0.8, centred: a student desk with its chair tucked in.
  desk: (kit, v) => {
    const g = new THREE.Group();
    const top = kit.get(0xc49a6c, { roughness: 0.6 });
    const tube = kit.get(0x5f6870, { roughness: 0.4, metalness: 0.7, flat: false });
    const plastic = kit.get(pick([0x3f51b5, 0x1e88e5, 0x00897b, 0x5c6bc0] as const, v), {
      roughness: 0.45,
    });
    // Desk.
    part(rbox(0.7, 0.04, 0.46, 0.015), top, 0, 0.48, -0.17, g);
    part(
      rbox(0.6, 0.1, 0.34, 0.015),
      kit.get(0x6d7780, { metalness: 0.5, roughness: 0.5 }),
      0,
      0.41,
      -0.2,
      g,
    );
    for (const [x, z] of [
      [-0.31, -0.37],
      [0.31, -0.37],
      [-0.31, 0.03],
      [0.31, 0.03],
    ] as const) {
      part(cyl(0.018, 0.018, 0.46, 8), tube, x, 0.23, z, g);
      part(cyl(0.024, 0.024, 0.015, 8), kit.get(0x212121), x, 0.008, z, g);
    }
    // Something left on the desk.
    const book = part(
      rbox(0.17, 0.03, 0.23, 0.008),
      kit.get(pick(BOOK_COLORS, v, 3)),
      -0.12 + v * 0.1,
      0.515,
      -0.18,
      g,
    );
    book.rotation.y = v * 0.8 - 0.4;
    const pencil = part(cyl(0.008, 0.008, 0.15, 6), kit.get(0xfbc02d), 0.18, 0.507, -0.12, g);
    pencil.rotation.set(Math.PI / 2, 0, v * 2);
    // Chair.
    part(rbox(0.36, 0.035, 0.3, 0.02), plastic, 0, 0.28, 0.2, g);
    const back = part(rbox(0.36, 0.2, 0.03, 0.015), plastic, 0, 0.46, 0.37, g);
    back.rotation.x = -0.12;
    for (const [x, z] of [
      [-0.15, 0.08],
      [0.15, 0.08],
      [-0.15, 0.33],
      [0.15, 0.33],
    ] as const) {
      part(cyl(0.014, 0.014, 0.27, 6), tube, x, 0.135, z, g);
    }
    part(cyl(0.012, 0.012, 0.2, 6), tube, -0.17, 0.4, 0.35, g);
    part(cyl(0.012, 0.012, 0.2, 6), tube, 0.17, 0.4, 0.35, g);
    return g;
  },
};
