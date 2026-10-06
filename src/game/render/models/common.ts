import type * as THREE from 'three';
import type { MaterialKit } from '../materials';
import { PALETTE } from '../palette';
import { canvasTexture, cyl, disc, part } from './parts';

/**
 * Builds one model. Units are tiles; the origin is the tile centre on the floor. `variant`
 * (0..1, stable per tile) picks small details so rows of the same object differ.
 */
export type ModelBuilder = (kit: MaterialKit, variant: number) => THREE.Object3D;

/** Materials shared by many fixtures. */
export const metals = (kit: MaterialKit) => ({
  copper: kit.get(0xd9822b, { roughness: 0.3, metalness: 0.85, flat: false }),
  copperDark: kit.get(0xa85d1b, { roughness: 0.38, metalness: 0.8, flat: false }),
  brass: kit.get(PALETTE.brass, { roughness: 0.28, metalness: 0.9, flat: false }),
  chrome: kit.get(0xe3e8ec, { roughness: 0.12, metalness: 1, flat: false }),
  steel: kit.get(0xb4bdc5, { roughness: 0.32, metalness: 0.75 }),
  steelDark: kit.get(PALETTE.steelDark, { roughness: 0.45, metalness: 0.6 }),
  rubber: kit.get(0x26282b, { roughness: 0.9 }),
});

/** A round dial face (gauges, clocks). */
export const gaugeFace = () =>
  canvasTexture('gauge', 64, 64, (ctx) => {
    ctx.fillStyle = '#f4f1e8';
    ctx.beginPath();
    ctx.arc(32, 32, 31, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    for (let i = 0; i <= 8; i++) {
      const a = Math.PI * 0.75 + (i / 8) * Math.PI * 1.5;
      ctx.beginPath();
      ctx.moveTo(32 + Math.cos(a) * 22, 32 + Math.sin(a) * 22);
      ctx.lineTo(32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28);
      ctx.stroke();
    }
    ctx.strokeStyle = '#d32f2f';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(32, 32);
    ctx.lineTo(48, 18);
    ctx.stroke();
  });

/** A small round gauge facing +Z. */
export function gauge(
  kit: MaterialKit,
  parent: THREE.Object3D,
  x: number,
  y: number,
  z: number,
  r = 0.06,
) {
  const rim = part(cyl(r, r, 0.03, 14), metals(kit).chrome, x, y, z, parent);
  rim.rotation.x = Math.PI / 2;
  part(
    disc(r * 0.85),
    kit.get(0xffffff, { map: gaugeFace(), roughness: 0.4 }),
    x,
    y,
    z + 0.016,
    parent,
  );
}
