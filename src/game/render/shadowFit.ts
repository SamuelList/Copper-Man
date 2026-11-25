import * as THREE from 'three';

/** A box in the sun's own view: `x` across it, `y` up it, both in world units. */
export interface ShadowBox {
  left: number;
  right: number;
  bottom: number;
  top: number;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * The smallest box in the sun's view that holds `points` (given relative to the point the sun
 * is aimed at), plus `margin` all round.
 *
 * Holding what's on screen is enough: whatever casts a shadow onto a point lies between it and
 * the sun, which is the same place in the sun's view, so nothing off screen needs room of its
 * own. Everything outside the box is simply left out of the shadow pass.
 */
export function fitShadowBox(
  points: readonly THREE.Vector3[],
  sunOffset: THREE.Vector3,
  margin: number,
): ShadowBox {
  // The same frame three gives a light's shadow camera: looking from the sun at its target.
  const forward = sunOffset.clone().normalize().negate();
  const across = new THREE.Vector3().crossVectors(forward, UP).normalize();
  const up = new THREE.Vector3().crossVectors(across, forward);
  const box = { left: Infinity, right: -Infinity, bottom: Infinity, top: -Infinity };
  for (const p of points) {
    const x = p.dot(across);
    const y = p.dot(up);
    box.left = Math.min(box.left, x);
    box.right = Math.max(box.right, x);
    box.bottom = Math.min(box.bottom, y);
    box.top = Math.max(box.top, y);
  }
  return {
    left: box.left - margin,
    right: box.right + margin,
    bottom: box.bottom - margin,
    top: box.top + margin,
  };
}

/**
 * Shadow map size for a box, at the sharpness a `size` x `size` map has over a square box of
 * half-width `extent`: the same texels per tile, on however many texels this box needs.
 */
export function shadowMapSize(box: ShadowBox, size: number, extent: number, max = 4096) {
  const perUnit = size / (extent * 2);
  const fit = (span: number) => Math.max(64, Math.min(max, Math.ceil(span * perUnit)));
  return { x: fit(box.right - box.left), y: fit(box.top - box.bottom) };
}
