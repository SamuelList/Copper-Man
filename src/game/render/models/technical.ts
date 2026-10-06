import * as THREE from 'three';
import type { MaterialKit } from '../materials';
import { gauge, metals, type ModelBuilder } from './common';
import {
  box,
  canvasTexture,
  cyl,
  disc,
  lathe,
  part,
  pick,
  plane,
  rbox,
  sphere,
  torus,
} from './parts';

/**
 * Restroom, lab, kitchen and technical-room fixtures. Same conventions as `fixtures.ts`: built
 * to the content footprint, back on local -Z for wall-mounted ones.
 */

const porcelain = (kit: MaterialKit) => kit.get(0xf7f7f4, { roughness: 0.16, flat: false });

const voltageSign = () =>
  canvasTexture('high-voltage', 64, 48, (ctx) => {
    ctx.fillStyle = '#fdd835';
    ctx.fillRect(0, 0, 64, 48);
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.moveTo(36, 4);
    ctx.lineTo(20, 26);
    ctx.lineTo(31, 26);
    ctx.lineTo(26, 44);
    ctx.lineTo(44, 20);
    ctx.lineTo(33, 20);
    ctx.closePath();
    ctx.fill();
  });

export const TECHNICAL_MODELS: Record<string, ModelBuilder> = {
  // 0.45 x 0.35 on the wall: wall-hung urinal with a chrome flush valve.
  urinal: (kit) => {
    const g = new THREE.Group();
    const { chrome } = metals(kit);
    part(rbox(0.4, 0.6, 0.3, 0.12), porcelain(kit), 0, 0.72, -0.34, g);
    part(
      rbox(0.28, 0.42, 0.04, 0.06),
      kit.get(0xdfe3e6, { roughness: 0.2, flat: false }),
      0,
      0.72,
      -0.19,
      g,
    );
    part(cyl(0.02, 0.02, 0.32, 8), chrome, 0, 1.17, -0.44, g);
    const valve = part(cyl(0.04, 0.04, 0.12, 10), chrome, 0, 1.3, -0.42, g);
    valve.rotation.x = Math.PI / 2;
    part(box(0.1, 0.015, 0.015), chrome, 0.06, 1.3, -0.36, g);
    part(cyl(0.05, 0.05, 0.01, 10), kit.get(0x90a4ae), 0, 0.43, -0.32, g);
    return g;
  },

  // 0.6 x 0.45 on the wall: porcelain basin, chrome faucet, trap underneath.
  sink: (kit) => {
    const g = new THREE.Group();
    const { chrome } = metals(kit);
    part(rbox(0.56, 0.15, 0.42, 0.06), porcelain(kit), 0, 0.82, -0.29, g);
    part(
      rbox(0.42, 0.02, 0.28, 0.05),
      kit.get(0xd5dbe0, { roughness: 0.15, flat: false }),
      0,
      0.895,
      -0.27,
      g,
    );
    part(cyl(0.022, 0.022, 0.16, 8), chrome, 0, 0.98, -0.45, g);
    const spout = part(cyl(0.016, 0.016, 0.13, 8), chrome, 0, 1.05, -0.39, g);
    spout.rotation.x = Math.PI / 2;
    for (const x of [-0.1, 0.1]) part(cyl(0.025, 0.025, 0.03, 8), chrome, x, 0.93, -0.45, g);
    part(cyl(0.022, 0.022, 0.3, 8), chrome, 0, 0.6, -0.33, g);
    const trap = part(torus(0.05, 0.02, 6, 12), chrome, 0, 0.44, -0.38, g);
    trap.rotation.y = Math.PI / 2;
    return g;
  },

  // 0.35 x 0.22 on the wall: chrome hand dryer.
  'hand-dryer': (kit) => {
    const g = new THREE.Group();
    const { chrome } = metals(kit);
    part(
      rbox(0.32, 0.3, 0.2, 0.08),
      kit.get(0xeceff1, { roughness: 0.3, metalness: 0.2, flat: false }),
      0,
      1.05,
      -0.39,
      g,
    );
    part(rbox(0.3, 0.04, 0.18, 0.02), chrome, 0, 0.91, -0.39, g);
    part(cyl(0.035, 0.03, 0.08, 10), chrome, 0.06, 0.86, -0.36, g);
    part(cyl(0.025, 0.025, 0.02, 10), kit.get(0x37474f), -0.07, 1.1, -0.29, g).rotation.x =
      Math.PI / 2;
    return g;
  },

  // 0.9 x 0.6, centred: a lab bench with a black top, gas taps and a bunsen burner.
  'lab-bench': (kit, v) => {
    const g = new THREE.Group();
    const { brass, chrome } = metals(kit);
    part(rbox(0.86, 0.46, 0.56, 0.02), kit.get(0xe0e0e0, { roughness: 0.6 }), 0, 0.23, 0, g);
    for (const x of [-0.21, 0.21]) part(box(0.004, 0.36, 0.5), kit.get(0x9e9e9e), x, 0.24, 0.0, g);
    part(rbox(0.9, 0.05, 0.6, 0.015), kit.get(0x263238, { roughness: 0.35 }), 0, 0.485, 0, g);
    for (const x of [-0.12, 0.12]) {
      part(cyl(0.02, 0.025, 0.12, 8), brass, x, 0.57, 0, g);
      part(sphere(0.025, 8, 6), brass, x, 0.63, 0, g);
      part(box(0.07, 0.012, 0.012), brass, x + 0.03, 0.62, 0, g);
    }
    // Bunsen burner and a beaker.
    part(cyl(0.035, 0.05, 0.02, 10), chrome, 0.3, 0.52, 0.12, g);
    part(cyl(0.015, 0.015, 0.14, 8), chrome, 0.3, 0.59, 0.12, g);
    const glass = kit.get(0xb3e5fc, {
      roughness: 0.05,
      metalness: 0.1,
      opacity: 0.45,
      flat: false,
    });
    part(cyl(0.04, 0.04, 0.1, 12), glass, -0.3, 0.56, -0.12, g);
    part(
      cyl(0.036, 0.036, 0.04, 12),
      kit.get(pick([0x66bb6a, 0xef5350, 0x7e57c2] as const, v)),
      -0.3,
      0.53,
      -0.12,
      g,
    );
    return g;
  },

  // 0.9 x 0.55 on the wall: the walk-in cooler's condensing unit, coils full of copper.
  'cooler-coils': (kit) => {
    const g = new THREE.Group();
    const { copper, copperDark, steelDark } = metals(kit);
    const cabinet = kit.get(0xb0bec5, { roughness: 0.4, metalness: 0.5 });
    part(rbox(0.88, 0.72, 0.5, 0.04), cabinet, 0, 0.4, -0.25, g);
    for (let i = 0; i < 7; i++)
      part(box(0.36, 0.015, 0.02), steelDark, -0.2, 0.15 + i * 0.075, 0.0, g);
    part(disc(0.17, 20), kit.get(0x263238), 0.22, 0.42, 0.003, g);
    part(torus(0.17, 0.015, 6, 20), steelDark, 0.22, 0.42, 0.005, g);
    for (const a of [0, Math.PI / 3, (2 * Math.PI) / 3]) {
      part(box(0.3, 0.04, 0.01), kit.get(0x546e7a), 0.22, 0.42, 0.01, g).rotation.z = a;
    }
    // Copper lines out of the top, into the wall.
    for (const [x, m] of [
      [-0.3, copper],
      [-0.2, copperDark],
    ] as const) {
      part(cyl(0.025, 0.025, 0.4, 8), m, x, 0.95, -0.3, g);
      const bend = part(cyl(0.025, 0.025, 0.22, 8), m, x, 1.15, -0.4, g);
      bend.rotation.x = Math.PI / 2;
    }
    return g;
  },

  // 0.7 x 0.22 on the wall: a breaker panel fed by thick conduit.
  'electrical-panel': (kit) => {
    const g = new THREE.Group();
    const { chrome, steelDark } = metals(kit);
    part(
      rbox(0.66, 0.92, 0.18, 0.02),
      kit.get(0x9ea7ad, { roughness: 0.45, metalness: 0.5 }),
      0,
      1.0,
      -0.41,
      g,
    );
    part(box(0.004, 0.86, 0.004), steelDark, 0, 1.0, -0.318, g);
    part(rbox(0.03, 0.1, 0.03, 0.01), chrome, 0.06, 1.0, -0.31, g);
    const sign = part(
      plane(0.16, 0.12),
      kit.get(0xffffff, { map: voltageSign() }),
      -0.18,
      1.25,
      -0.318,
      g,
    );
    sign.castShadow = false;
    for (const x of [-0.2, 0, 0.2]) part(cyl(0.035, 0.035, 0.6, 8), steelDark, x, 1.7, -0.45, g);
    return g;
  },

  // 0.95 x 0.45 on the wall: glass trophy case full of brass.
  'trophy-case': (kit, v) => {
    const g = new THREE.Group();
    const { brass } = metals(kit);
    const wood = kit.get(0x6d4c41, { roughness: 0.55 });
    part(rbox(0.95, 0.5, 0.42, 0.02), wood, 0, 0.25, -0.29, g);
    part(rbox(0.95, 0.05, 0.42, 0.02), wood, 0, 1.38, -0.29, g);
    for (const x of [-0.46, 0.46]) part(box(0.03, 0.85, 0.42), wood, x, 0.93, -0.29, g);
    part(
      box(0.9, 0.02, 0.38),
      kit.get(0xeceff1, { opacity: 0.35, roughness: 0.05 }),
      0,
      0.93,
      -0.29,
      g,
    );
    const cup = lathe('trophy-cup', [
      [0.0, 0.0],
      [0.06, 0.0],
      [0.06, 0.02],
      [0.02, 0.04],
      [0.015, 0.1],
      [0.05, 0.13],
      [0.065, 0.22],
      [0.0, 0.2],
    ]);
    for (const [x, y, s] of [
      [-0.3, 0.52, 1.2],
      [0, 0.52, 1.5],
      [0.3, 0.52, 1],
      [-0.2, 0.95, 1],
      [0.15, 0.95, 1.3],
    ] as const) {
      const t = part(cup, brass, x + (v - 0.5) * 0.05, y, -0.3, g);
      t.scale.setScalar(s);
    }
    part(
      plane(0.92, 0.85),
      kit.get(0xdfefff, { opacity: 0.18, roughness: 0.02, metalness: 0.5 }),
      0,
      0.93,
      -0.08,
      g,
    ).castShadow = false;
    return g;
  },

  // 0.6 x 0.8 on the wall: a server rack with blinking lights.
  'server-rack': (kit, v) => {
    const g = new THREE.Group();
    const { steelDark } = metals(kit);
    part(
      rbox(0.58, 1.5, 0.76, 0.02),
      kit.get(0x1c1f22, { roughness: 0.4, metalness: 0.5 }),
      0,
      0.75,
      -0.11,
      g,
    );
    const leds = [
      kit.get(0x69f0ae, { emissive: 0x00e676 }),
      kit.get(0xffab40, { emissive: 0xff9100 }),
    ];
    for (let i = 0; i < 9; i++) {
      part(
        box(0.5, 0.11, 0.01),
        kit.get(0x2b3035, { roughness: 0.5 }),
        0,
        0.2 + i * 0.14,
        0.275,
        g,
      );
      for (let k = 0; k < 3; k++) {
        part(
          box(0.02, 0.02, 0.01),
          leds[(i + k + Math.round(v * 3)) % 2]!,
          -0.2 + k * 0.04,
          0.2 + i * 0.14,
          0.281,
          g,
        );
      }
    }
    for (const x of [-0.29, 0.29]) part(box(0.004, 1.3, 0.6), steelDark, x, 0.78, -0.11, g);
    return g;
  },

  // 0.95 x 0.95, centred: a chiller with its compressor and big copper loops.
  chiller: (kit) => {
    const g = new THREE.Group();
    const { copper, copperDark, steel } = metals(kit);
    const body = kit.get(0x546e7a, { roughness: 0.45, metalness: 0.45 });
    part(rbox(0.94, 0.12, 0.94, 0.02), kit.get(0x6d6d6d, { roughness: 1 }), 0, 0.06, 0, g);
    part(rbox(0.88, 0.62, 0.88, 0.05), body, 0, 0.43, 0, g);
    const comp = part(
      cyl(0.2, 0.2, 0.7, 16),
      kit.get(0x37474f, { roughness: 0.4, metalness: 0.6, flat: false }),
      0,
      0.94,
      -0.1,
      g,
    );
    comp.rotation.z = Math.PI / 2;
    for (const x of [-0.36, 0.36])
      part(cyl(0.21, 0.21, 0.03, 16), steel, x, 0.94, -0.1, g).rotation.z = Math.PI / 2;
    for (const [z, m] of [
      [0.22, copper],
      [0.3, copperDark],
    ] as const) {
      const loop = part(torus(0.18, 0.03, 8, 20), m, 0, 0.8, z, g);
      loop.rotation.y = Math.PI / 2;
    }
    gauge(kit, g, 0.25, 0.55, 0.445, 0.06);
    gauge(kit, g, 0.05, 0.55, 0.445, 0.05);
    part(
      plane(0.18, 0.13),
      kit.get(0xffffff, { map: voltageSign() }),
      -0.25,
      0.5,
      0.443,
      g,
    ).castShadow = false;
    return g;
  },
};
