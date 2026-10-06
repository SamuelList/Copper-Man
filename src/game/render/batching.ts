import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MaterialKit } from './materials';

/**
 * Static batching. The procedural models are dozens of small meshes each; drawn one by one, a
 * school full of them costs thousands of draw calls, which phones can't afford. This merges
 * every static mesh per map chunk. Plain coloured materials are folded into a few
 * vertex-coloured ones (grouped by roughness and metalness), so a chunk draws in a handful of
 * calls; chunks off screen are still culled.
 */
export function batchStatic(
  roots: readonly THREE.Object3D[],
  kit: MaterialKit,
  chunkSize = 8,
): THREE.Group {
  const out = new THREE.Group();
  out.name = 'static-batch';
  const buckets = new Map<
    string,
    { material: THREE.Material; castShadow: boolean; parts: THREE.BufferGeometry[] }
  >();
  const anchor = new THREE.Vector3();

  for (const root of roots) {
    root.updateMatrixWorld(true);
    anchor.setFromMatrixPosition(root.matrixWorld);
    const chunk = `${Math.floor(anchor.x / chunkSize)},${Math.floor(anchor.z / chunkSize)}`;
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || Array.isArray(mesh.material)) return;
      const source = mesh.material;
      const plain = plainColor(source);
      const material = plain
        ? kit.vertexColored(plain.roughness, plain.metalness, plain.flat)
        : source;
      const key = `${chunk}|${material.uuid}|${mesh.castShadow}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { material, castShadow: mesh.castShadow, parts: [] };
        buckets.set(key, bucket);
      }
      const piece = normalize(mesh.geometry).applyMatrix4(mesh.matrixWorld);
      if (plain) paint(piece, plain.color);
      bucket.parts.push(piece);
    });
  }

  for (const { material, castShadow, parts } of buckets.values()) {
    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere();
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

/** Same attribute set for every piece (position, normal, uv), non-indexed, so they can merge. */
function normalize(source: THREE.BufferGeometry): THREE.BufferGeometry {
  const g = source.index ? source.toNonIndexed() : source.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  }
  const count = g.attributes.position!.count;
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(count * 2, 2));
  g.clearGroups();
  return g;
}

/** Snap to a few roughness/metalness levels so similar materials share a batch. */
const quantize = (v: number, steps: number) => Math.round(v * steps) / steps;

/** An opaque, untextured, non-glowing kit material, described for vertex colouring. */
function plainColor(m: THREE.Material) {
  const info = m.userData.kit as { opacity: number; emissive: number; map: boolean } | undefined;
  if (!info || info.opacity < 1 || info.emissive || info.map) return null;
  const std = m as THREE.MeshStandardMaterial;
  return {
    color: std.color,
    roughness: quantize(std.roughness, 5),
    metalness: quantize(std.metalness, 3),
    flat: std.flatShading,
  };
}

/** Fill a vertex colour attribute (linear, like material colours). */
function paint(g: THREE.BufferGeometry, color: THREE.Color) {
  const count = g.attributes.position!.count;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) data.set([color.r, color.g, color.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
}
