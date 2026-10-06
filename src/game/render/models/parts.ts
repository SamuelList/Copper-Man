import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

/**
 * Shared building blocks for the procedural models. Geometry is cached by shape, so a hundred
 * desks share one set of buffers until the world batches them (see `batching.ts`).
 */

const geoCache = new Map<string, THREE.BufferGeometry>();

export function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
}

export const box = (w: number, h: number, d: number) =>
  geo(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));

/** A box with softened edges; the bevels catch light and read as manufactured objects. */
export const rbox = (w: number, h: number, d: number, r = 0.03) =>
  geo(
    `rbox:${w}:${h}:${d}:${r}`,
    () => new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2, h / 2, d / 2) * 0.999),
  );

export const cyl = (rt: number, rb: number, h: number, seg = 10) =>
  geo(`cyl:${rt}:${rb}:${h}:${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg));

export const sphere = (r: number, w = 10, h = 8) =>
  geo(`sph:${r}:${w}:${h}`, () => new THREE.SphereGeometry(r, w, h));

export const capsule = (r: number, len: number) =>
  geo(`cap:${r}:${len}`, () => new THREE.CapsuleGeometry(r, len, 3, 10));

export const torus = (r: number, tube: number, radial = 6, tubular = 16) =>
  geo(
    `tor:${r}:${tube}:${radial}:${tubular}`,
    () => new THREE.TorusGeometry(r, tube, radial, tubular),
  );

/** A flat disc facing +Z (dial faces, signs). */
export const disc = (r: number, seg = 16) =>
  geo(`disc:${r}:${seg}`, () => new THREE.CircleGeometry(r, seg));

/** A flat rectangle facing +Z (labels, posters, glass). */
export const plane = (w: number, h: number) =>
  geo(`plane:${w}:${h}`, () => new THREE.PlaneGeometry(w, h));

export const ico = (r: number, detail = 0) =>
  geo(`ico:${r}:${detail}`, () => new THREE.IcosahedronGeometry(r, detail));

/** Surface of revolution around Y from (radius, height) pairs, e.g. a toilet bowl. */
export const lathe = (key: string, points: readonly [number, number][], seg = 16) =>
  geo(
    `lathe:${key}`,
    () =>
      new THREE.LatheGeometry(
        points.map(([r, y]) => new THREE.Vector2(r, y)),
        seg,
      ),
  );

/** Pick from a list with a stable 0..1 variant (and a salt for several picks per object). */
export const pick = <T>(list: readonly T[], v: number, salt = 0): T =>
  list[Math.floor(((((v * 9301 + salt * 0.618) % 1) + 1) % 1) * list.length) % list.length]!;

export function part(
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

/** Rotate in place and hand the object back (keeps builders terse). */
export function turn<T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0): T {
  o.rotation.set(x, y, z);
  return o;
}

export function disposeModelCache() {
  geoCache.forEach((g) => g.dispose());
  geoCache.clear();
}

/** A small canvas texture (labels, screens, posters). Cached by key. */
const textureCache = new Map<string, THREE.CanvasTexture>();
export function canvasTexture(
  key: string,
  w: number,
  h: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): THREE.CanvasTexture {
  let t = textureCache.get(key);
  if (!t) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d')!);
    t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    textureCache.set(key, t);
  }
  return t;
}

export function disposeTextureCache() {
  textureCache.forEach((t) => t.dispose());
  textureCache.clear();
}
