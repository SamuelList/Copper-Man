import type * as THREE from 'three';

/**
 * Markers and effects (speech bubbles, vision cones, floor rings, sparks) live on their own
 * layer: the cameras you look through see it, the one that draws the floor's reflection
 * doesn't.
 */
export const OVERLAY_LAYER = 1;

/** Put an object (and everything under it) on the overlay layer. */
export function onOverlay<T extends THREE.Object3D>(object: T): T {
  object.traverse((o) => o.layers.set(OVERLAY_LAYER));
  return object;
}
