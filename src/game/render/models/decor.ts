import * as THREE from 'three';
import type { MaterialKit } from '../materials';
import { metals } from './common';
import { box, canvasTexture, disc, geo, part, pick, plane, rbox, torus } from './parts';

/**
 * Flat things hung on walls. Each builder faces +Z with its back on the wall face at z = 0 and
 * stays within a few centimetres of it, so decor never needs a hitbox. The world scales decor
 * with its wall when the wall drops for the cutaway.
 */
export type DecorBuilder = (kit: MaterialKit, variant: number) => THREE.Object3D;

const chalkTexture = () =>
  canvasTexture('chalkboard', 512, 160, (ctx) => {
    ctx.fillStyle = '#2f4a3a';
    ctx.fillRect(0, 0, 512, 160);
    // Old smudges.
    ctx.fillStyle = 'rgba(255,255,255,0.05)';
    for (let i = 0; i < 14; i++) ctx.fillRect((i * 97) % 480, (i * 53) % 130, 60, 18);
    ctx.fillStyle = 'rgba(245,245,235,0.9)';
    ctx.strokeStyle = 'rgba(245,245,235,0.85)';
    ctx.lineWidth = 3;
    ctx.font = 'bold 26px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillText('2 + 2 = 4', 22, 44);
    ctx.fillText('Spelling test FRIDAY', 190, 40);
    ctx.font = '22px "Comic Sans MS", system-ui, sans-serif';
    ctx.fillText('Cu = copper (29)', 30, 104);
    ctx.fillText('DO NOT ERASE', 340, 132);
    ctx.beginPath();
    ctx.arc(250, 100, 26, 0, Math.PI * 2);
    ctx.moveTo(236, 92);
    ctx.arc(236, 92, 2, 0, Math.PI * 2);
    ctx.moveTo(266, 92);
    ctx.arc(264, 92, 2, 0, Math.PI * 2);
    ctx.moveTo(236, 108);
    ctx.quadraticCurveTo(250, 120, 264, 108);
    ctx.stroke();
  });

/** One tile-wide slice of a chalkboard: `index` of `count` slices share one painted board. */
export function chalkboardSlice(kit: MaterialKit, index: number, count: number): THREE.Object3D {
  const g = new THREE.Group();
  const board = geo(`chalk:${index}:${count}`, () => {
    const p = new THREE.PlaneGeometry(1, 0.62);
    const uv = p.attributes.uv!;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (index + uv.getX(i)) / count);
    return p;
  });
  const surface = part(
    board,
    kit.get(0xffffff, { map: chalkTexture(), roughness: 0.95 }),
    0,
    1.02,
    0.02,
    g,
  );
  surface.castShadow = false;
  const wood = kit.get(0x8d6240, { roughness: 0.7 });
  part(box(1, 0.05, 0.04), wood, 0, 1.35, 0.02, g);
  part(box(1, 0.05, 0.04), wood, 0, 0.69, 0.02, g);
  part(box(1, 0.025, 0.07), wood, 0, 0.665, 0.04, g);
  if (index === 0) part(box(0.05, 0.7, 0.04), wood, -0.475, 1.02, 0.02, g);
  if (index === count - 1) part(box(0.05, 0.7, 0.04), wood, 0.475, 1.02, 0.02, g);
  // Chalk and an eraser on the tray.
  if (index === Math.floor(count / 2)) {
    part(rbox(0.12, 0.035, 0.05, 0.01), kit.get(0x5d4037), 0.2, 0.695, 0.045, g);
    part(box(0.07, 0.015, 0.015), kit.get(0xffffff), -0.1, 0.685, 0.05, g);
  }
  return g;
}

const clockFace = () =>
  canvasTexture('clock', 64, 64, (ctx) => {
    ctx.fillStyle = '#fafafa';
    ctx.beginPath();
    ctx.arc(32, 32, 31, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#222';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.fillRect(32 + Math.cos(a) * 25 - 1.5, 32 + Math.sin(a) * 25 - 1.5, 3, 3);
    }
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(32, 32);
    ctx.lineTo(32, 14);
    ctx.moveTo(32, 32);
    ctx.lineTo(44, 36);
    ctx.stroke();
  });

const exitSign = () =>
  canvasTexture('exit', 96, 40, (ctx) => {
    ctx.fillStyle = '#1b1b1b';
    ctx.fillRect(0, 0, 96, 40);
    ctx.fillStyle = '#ff3b30';
    ctx.font = 'bold 30px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXIT', 48, 22);
  });

const POSTERS = [
  { bg: '#1e88e5', fg: '#fff', title: 'READ!', sub: 'Books are cool' },
  { bg: '#43a047', fg: '#fff', title: 'RECYCLE', sub: 'Every can counts' },
  { bg: '#fdd835', fg: '#222', title: 'BE KIND', sub: 'Lincoln Elementary' },
  { bg: '#e53935', fg: '#fff', title: 'NO RUNNING', sub: 'in the halls' },
  { bg: '#8e24aa', fg: '#fff', title: 'SCIENCE FAIR', sub: 'Gym · Thursday' },
] as const;

const posterTexture = (i: number) =>
  canvasTexture(`poster:${i}`, 96, 128, (ctx) => {
    const p = POSTERS[i]!;
    ctx.fillStyle = p.bg;
    ctx.fillRect(0, 0, 96, 128);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.beginPath();
    ctx.arc(48, 52, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.fg;
    ctx.textAlign = 'center';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText(p.title, 48, 100, 90);
    ctx.font = '10px system-ui, sans-serif';
    ctx.fillText(p.sub, 48, 116, 90);
  });

export const DECOR: Record<string, DecorBuilder> = {
  /** Outside window: frame, sky-tinted glass, mullions, sill. */
  window: (kit) => {
    const g = new THREE.Group();
    const frame = kit.get(0xeceff1, { roughness: 0.5 });
    part(rbox(0.8, 0.74, 0.05, 0.015), frame, 0, 0.98, 0.0, g);
    const glass = part(
      plane(0.68, 0.62),
      kit.get(0x7fa9cc, { roughness: 0.05, metalness: 0.6 }),
      0,
      0.98,
      0.027,
      g,
    );
    glass.castShadow = false;
    part(box(0.03, 0.62, 0.02), frame, 0, 0.98, 0.035, g);
    part(box(0.68, 0.03, 0.02), frame, 0, 0.98, 0.035, g);
    part(rbox(0.88, 0.04, 0.1, 0.015), frame, 0, 0.6, 0.04, g);
    return g;
  },

  clock: (kit) => {
    const g = new THREE.Group();
    part(
      torus(0.13, 0.018, 6, 20),
      kit.get(0x263238, { roughness: 0.4, metalness: 0.4 }),
      0,
      1.48,
      0.02,
      g,
    );
    part(
      disc(0.125, 20),
      kit.get(0xffffff, { map: clockFace(), roughness: 0.5 }),
      0,
      1.48,
      0.025,
      g,
    ).castShadow = false;
    return g;
  },

  bulletin: (kit, v) => {
    const g = new THREE.Group();
    part(rbox(0.86, 0.56, 0.03, 0.01), kit.get(0x5d4037), 0, 1.05, 0.015, g);
    part(box(0.8, 0.5, 0.01), kit.get(0xc29a6b, { roughness: 1 }), 0, 1.05, 0.032, g);
    const papers = [0xffffff, 0xfff59d, 0xf8bbd0, 0xb3e5fc, 0xc8e6c9];
    for (let i = 0; i < 5; i++) {
      const sheet = part(
        plane(0.18, 0.22),
        kit.get(pick(papers, v, i), { roughness: 0.9 }),
        -0.28 + i * 0.14,
        1.05 + ((i * 37) % 3) * 0.06 - 0.06,
        0.039 + i * 0.001,
        g,
      );
      sheet.rotation.z = ((i * 53) % 7) * 0.03 - 0.09;
      sheet.castShadow = false;
      part(
        box(0.02, 0.02, 0.01),
        kit.get(0xe53935),
        sheet.position.x,
        sheet.position.y + 0.1,
        0.045,
        g,
      );
    }
    return g;
  },

  poster: (kit, v) => {
    const g = new THREE.Group();
    const i = Math.floor(v * POSTERS.length) % POSTERS.length;
    const p = part(
      plane(0.36, 0.48),
      kit.get(0xffffff, { map: posterTexture(i), roughness: 0.8 }),
      0,
      1.0,
      0.012,
      g,
    );
    p.rotation.z = (v - 0.5) * 0.08;
    p.castShadow = false;
    return g;
  },

  exit: (kit) => {
    const g = new THREE.Group();
    part(rbox(0.34, 0.16, 0.05, 0.015), kit.get(0x263238), 0, 1.42, 0.025, g);
    part(
      plane(0.3, 0.12),
      kit.get(0xffffff, { map: exitSign(), emissive: 0x330000 }),
      0,
      1.42,
      0.052,
      g,
    ).castShadow = false;
    return g;
  },

  mirror: (kit) => {
    const g = new THREE.Group();
    const { chrome } = metals(kit);
    part(rbox(0.62, 0.74, 0.03, 0.015), chrome, 0, 1.05, 0.015, g);
    part(
      plane(0.56, 0.68),
      kit.get(0xcfe3ee, { roughness: 0.08, metalness: 0.6, emissive: 0x1d2a33 }),
      0,
      1.05,
      0.032,
      g,
    ).castShadow = false;
    return g;
  },

  warning: (kit) => {
    const g = new THREE.Group();
    const sign = canvasTexture('danger', 96, 64, (ctx) => {
      ctx.fillStyle = '#fdd835';
      ctx.fillRect(0, 0, 96, 64);
      ctx.fillStyle = '#111';
      ctx.fillRect(0, 0, 96, 18);
      ctx.fillStyle = '#fdd835';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DANGER', 48, 14);
      ctx.fillStyle = '#111';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.fillText('HIGH PRESSURE', 48, 38);
      ctx.fillText('STAFF ONLY', 48, 55);
    });
    part(
      plane(0.36, 0.24),
      kit.get(0xffffff, { map: sign, roughness: 0.6 }),
      0,
      1.25,
      0.012,
      g,
    ).castShadow = false;
    return g;
  },

  /** Gym pennant banner. */
  banner: (kit, v) => {
    const g = new THREE.Group();
    const i = Math.floor(v * 3) % 3;
    const tex = canvasTexture(`banner:${i}`, 64, 128, (ctx) => {
      const [bg, text] = [
        ['#c62828', 'LIONS'],
        ['#1565c0', 'GO!'],
        ['#f9a825', '#1'],
      ][i]!;
      ctx.fillStyle = bg!;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(64, 0);
      ctx.lineTo(64, 100);
      ctx.lineTo(32, 128);
      ctx.lineTo(0, 100);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 18px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.save();
      ctx.translate(32, 60);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(text!, 0, 6);
      ctx.restore();
    });
    const b = part(
      plane(0.34, 0.68),
      kit.get(0xffffff, { map: tex, opacity: 0.999, roughness: 0.9 }),
      0,
      1.15,
      0.012,
      g,
    );
    b.castShadow = false;
    part(box(0.4, 0.02, 0.02), kit.get(0x5d4037), 0, 1.5, 0.012, g);
    return g;
  },

  /** Cafeteria menu board. */
  menu: (kit) => {
    const g = new THREE.Group();
    const tex = canvasTexture('menu', 128, 96, (ctx) => {
      ctx.fillStyle = '#263238';
      ctx.fillRect(0, 0, 128, 96);
      ctx.fillStyle = '#ffeb3b';
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText("TODAY'S LUNCH", 64, 20);
      ctx.fillStyle = '#fff';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText('Mystery Meat', 64, 44);
      ctx.fillText('Tater Tots', 64, 62);
      ctx.fillText('Chocolate Milk', 64, 80);
    });
    part(rbox(0.82, 0.62, 0.03, 0.01), kit.get(0x5d4037), 0, 1.05, 0.015, g);
    part(
      plane(0.76, 0.56),
      kit.get(0xffffff, { map: tex, roughness: 0.8 }),
      0,
      1.05,
      0.032,
      g,
    ).castShadow = false;
    return g;
  },

  /** Periodic table poster for the science lab. */
  periodic: (kit) => {
    const g = new THREE.Group();
    const tex = canvasTexture('periodic', 128, 80, (ctx) => {
      ctx.fillStyle = '#fafafa';
      ctx.fillRect(0, 0, 128, 80);
      const colors = ['#ef9a9a', '#ffcc80', '#fff59d', '#a5d6a7', '#90caf9', '#ce93d8'];
      for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 18; c++) {
          const gap = r > 0 && r < 3 && c > 1 && c < 12 - (r === 1 ? 0 : 10);
          if (r === 0 && c > 0 && c < 17) continue;
          if (gap) continue;
          ctx.fillStyle = colors[(c + r) % colors.length]!;
          ctx.fillRect(4 + c * 6.7, 6 + r * 10, 6, 9);
        }
      }
      ctx.fillStyle = '#d9822b';
      ctx.fillRect(4 + 10 * 6.7, 36, 6, 9); // Cu
    });
    part(
      plane(0.7, 0.44),
      kit.get(0xffffff, { map: tex, roughness: 0.8 }),
      0,
      1.1,
      0.012,
      g,
    ).castShadow = false;
    return g;
  },

  /** A framed portrait of Mr. Gravy, for his office. */
  portrait: (kit) => {
    const g = new THREE.Group();
    const tex = canvasTexture('gravy-portrait', 64, 80, (ctx) => {
      ctx.fillStyle = '#4e342e';
      ctx.fillRect(0, 0, 64, 80);
      ctx.fillStyle = '#3f4a52';
      ctx.fillRect(14, 52, 36, 28);
      ctx.fillStyle = '#e8b48a';
      ctx.beginPath();
      ctx.arc(32, 36, 15, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5d4037';
      ctx.fillRect(20, 22, 24, 3);
      ctx.fillStyle = '#d84339';
      ctx.fillRect(30, 54, 4, 18);
      ctx.fillStyle = '#212121';
      ctx.fillRect(25, 34, 3, 3);
      ctx.fillRect(36, 34, 3, 3);
      ctx.fillRect(27, 43, 10, 2);
    });
    part(
      rbox(0.44, 0.54, 0.03, 0.01),
      kit.get(0xb8860b, { metalness: 0.6, roughness: 0.3 }),
      0,
      1.1,
      0.015,
      g,
    );
    part(
      plane(0.36, 0.46),
      kit.get(0xffffff, { map: tex, roughness: 0.7 }),
      0,
      1.1,
      0.032,
      g,
    ).castShadow = false;
    return g;
  },
};
