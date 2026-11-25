import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MaterialKit } from './materials';

/**
 * Which batch something goes in, from where it stands (world x, z): the size of a square grid
 * of chunks, or a function naming its cell (the world batches by room, so a room the camera
 * can't see into can be skipped whole).
 */
export type Cells = number | ((x: number, z: number) => string);

/**
 * Static batching. The procedural models are dozens of small meshes each; drawn one by one, a
 * school full of them costs thousands of draw calls, which phones can't afford. This merges
 * every static mesh per cell. Plain coloured materials are folded into one, their colour and
 * finish (roughness, metalness, faceting) carried by each vertex instead, so a cell's plain
 * scenery draws in one or two calls however it is painted; cells off screen are still culled.
 *
 * The merged meshes are most of the vertices in the game, so they are kept lean: welded and
 * indexed (a corner shared by several triangles is stored once: a rounded box comes as 144
 * loose vertices and leaves as 26), with texture coordinates only where a texture will read
 * them, and with the JavaScript copy of each buffer dropped once the graphics card has its own.
 */
export function batchStatic(
  roots: readonly THREE.Object3D[],
  kit: MaterialKit,
  cells: Cells = 8,
): THREE.Group {
  const out = new THREE.Group();
  out.name = 'static-batch';
  const cellOf =
    typeof cells === 'number'
      ? (x: number, z: number) => `${Math.floor(x / cells)},${Math.floor(z / cells)}`
      : cells;
  const buckets = new Map<
    string,
    { material: THREE.Material; castShadow: boolean; parts: THREE.BufferGeometry[] }
  >();
  const anchor = new THREE.Vector3();

  for (const root of roots) {
    root.updateMatrixWorld(true);
    anchor.setFromMatrixPosition(root.matrixWorld);
    const chunk = cellOf(anchor.x, anchor.z);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const source = mesh.material;
      const plain = plainColor(source);
      const material = plain ? kit.mixed() : source;
      const key = `${chunk}|${material.uuid}|${mesh.castShadow}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material, castShadow: mesh.castShadow, parts: [] };
        buckets.set(key, bucket);
      }
      const piece = lean(mesh.geometry, textured(material)).clone();
      piece.applyMatrix4(mesh.matrixWorld);
      if (plain) paint(piece, plain);
      bucket.parts.push(piece);
    });
  }

  for (const { material, castShadow, parts } of buckets.values()) {
    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    if (!merged) continue;
    // Worked out now, while the positions are still to hand (culling needs both).
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    for (const attribute of Object.values(merged.attributes)) {
      if (attribute instanceof THREE.BufferAttribute) attribute.onUpload(release);
    }
    merged.index?.onUpload(release);
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    mesh.matrixAutoUpdate = false;
    out.add(mesh);
  }
  return out;
}

/**
 * Merge a freshly built, unplaced object's meshes per material. It still moves as one group
 * (decor that sinks with its wall) but draws in a couple of calls.
 */
export const bake = (root: THREE.Object3D, kit: MaterialKit): THREE.Group =>
  batchStatic([root], kit, Infinity);

/** Once a buffer is on the graphics card nothing here reads it again: let the copy go. */
function release(this: THREE.BufferAttribute) {
  (this as { array: unknown }).array = null;
}

/** Does anything sample a texture through this material's texture coordinates? */
function textured(m: THREE.Material): boolean {
  const info = m.userData.kit as { map: boolean } | undefined;
  if (info) return info.map;
  const maps = m as THREE.MeshStandardMaterial;
  return Boolean(maps.map || maps.alphaMap || maps.emissiveMap || maps.normalMap);
}

/** Each shape as the batches want it, worked out once however many times it's placed. */
const leanShapes = new WeakMap<
  THREE.BufferGeometry,
  { plain?: THREE.BufferGeometry; textured?: THREE.BufferGeometry }
>();

/**
 * A shape with the same attribute set as every other piece of its bucket (position, normal,
 * and uv if `uv`), welded and indexed, so they can merge. Shared: clone it before moving it.
 */
function lean(source: THREE.BufferGeometry, uv: boolean): THREE.BufferGeometry {
  let shapes = leanShapes.get(source);
  if (!shapes) leanShapes.set(source, (shapes = {}));
  const kind = uv ? 'textured' : 'plain';
  return (shapes[kind] ??= weld(source, uv));
}

function weld(source: THREE.BufferGeometry, uv: boolean): THREE.BufferGeometry {
  const g = source.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && !(uv && name === 'uv')) {
      g.deleteAttribute(name);
    }
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (uv && !g.attributes.uv) {
    const count = g.attributes.position!.count;
    g.setAttribute('uv', new THREE.Float32BufferAttribute(count * 2, 2));
  }
  g.clearGroups();
  // Vertices that agree in every attribute become one (which also gives it an index).
  const welded = mergeVertices(g);
  g.dispose();
  return welded;
}

/** How a plain material looks, for carrying on the vertices instead. */
interface Finish {
  color: THREE.Color;
  roughness: number;
  metalness: number;
  flat: boolean;
}

/** An opaque, untextured, non-glowing kit material, described for the vertices. */
function plainColor(m: THREE.Material): Finish | null {
  const info = m.userData.kit as { opacity: number; emissive: number; map: boolean } | undefined;
  if (!info || info.opacity < 1 || info.emissive || info.map) return null;
  const std = m as THREE.MeshStandardMaterial;
  return {
    color: std.color,
    roughness: std.roughness,
    metalness: std.metalness,
    flat: std.flatShading,
  };
}

/**
 * Give every vertex its colour (linear, like material colours) and its finish: roughness,
 * metalness and faceting, a byte each (`aSurface`, read by the kit's mixed material).
 */
function paint(g: THREE.BufferGeometry, finish: Finish) {
  const count = g.attributes.position!.count;
  const color = new Float32Array(count * 3);
  const surface = new Uint8Array(count * 4);
  const rough = Math.round(finish.roughness * 255);
  const metal = Math.round(finish.metalness * 255);
  const flat = finish.flat ? 255 : 0;
  for (let i = 0; i < count; i++) {
    color[i * 3] = finish.color.r;
    color[i * 3 + 1] = finish.color.g;
    color[i * 3 + 2] = finish.color.b;
    surface[i * 4] = rough;
    surface[i * 4 + 1] = metal;
    surface[i * 4 + 2] = flat;
  }
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.setAttribute('aSurface', new THREE.BufferAttribute(surface, 4, true));
}
