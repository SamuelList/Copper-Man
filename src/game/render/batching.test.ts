import * as THREE from 'three';
import { batchStatic } from './batching';
import { createWorldShading, MaterialKit } from './materials';

const kit = new MaterialKit(createWorldShading(10, 10));

function crate(x: number, color: number) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), kit.get(color));
  body.castShadow = true;
  g.add(body);
  g.position.set(x, 0, 0);
  return g;
}

describe('batchStatic', () => {
  it('merges plain colours into one vertex-coloured mesh per chunk', () => {
    const batch = batchStatic([crate(0.5, 0xff0000), crate(2.5, 0x00ff00)], kit, 8);
    expect(batch.children).toHaveLength(1);
    const mesh = batch.children[0] as THREE.Mesh;
    expect((mesh.material as THREE.MeshStandardMaterial).vertexColors).toBe(true);
    const colors = mesh.geometry.attributes.color!;
    const reds = new Set<number>();
    for (let i = 0; i < colors.count; i++) reds.add(Math.round(colors.getX(i)));
    expect(reds).toEqual(new Set([0, 1]));
    // Positions are baked into world space.
    mesh.geometry.computeBoundingBox();
    expect(mesh.geometry.boundingBox!.min.x).toBeCloseTo(0);
    expect(mesh.geometry.boundingBox!.max.x).toBeCloseTo(3);
  });

  it('keeps the merged scenery lean', () => {
    const batch = batchStatic([crate(0.5, 0xff0000), crate(2.5, 0x00ff00)], kit, 8);
    const { geometry } = batch.children[0] as THREE.Mesh;
    // Indexed: a box is 24 corners (4 a face), not 36 (3 a triangle), and both are in there.
    expect(geometry.attributes.position!.count).toBe(48);
    expect(geometry.index!.count).toBe(72);
    expect(Math.max(...geometry.index!.array)).toBe(47);
    // No texture, so no texture coordinates.
    expect(geometry.attributes.uv).toBeUndefined();
    // What culling needs is worked out before the buffers are let go on upload.
    expect(geometry.boundingSphere).not.toBeNull();
    expect(geometry.boundingBox).not.toBeNull();
    const position = geometry.attributes.position as THREE.BufferAttribute;
    position.onUploadCallback();
    expect(position.array).toBeNull();
  });

  it('welds the loose vertices of a rounded shape', () => {
    // A ball built the way three builds one: three vertices to a triangle, none shared.
    const ball = new THREE.Group();
    const loose = new THREE.IcosahedronGeometry(0.5, 2);
    expect(loose.index).toBeNull();
    ball.add(new THREE.Mesh(loose, kit.get(0x3366ff, { flat: false })));
    const batch = batchStatic([ball], kit, 8);
    const { geometry } = batch.children[0] as THREE.Mesh;
    expect(geometry.index!.count).toBe(loose.attributes.position!.count);
    expect(geometry.attributes.position!.count).toBeLessThan(loose.attributes.position!.count / 4);
  });

  it('gives a textured batch its texture coordinates', () => {
    const sign = crate(0.5, 0xffffff);
    const texture = new THREE.Texture();
    (sign.children[0] as THREE.Mesh).material = kit.get(0xffffff, { map: texture });
    const batch = batchStatic([sign], kit, 8);
    const { geometry } = batch.children[0] as THREE.Mesh;
    expect(geometry.attributes.uv!.count).toBe(24);
  });

  it('keeps textured and glowing materials separate, and splits by chunk', () => {
    const glow = crate(0.5, 0xffffff);
    (glow.children[0] as THREE.Mesh).material = kit.get(0xff8800, { emissive: 0xff4400 });
    const far = crate(20.5, 0x0000ff);
    const batch = batchStatic([crate(1.5, 0xff0000), glow, far], kit, 8);
    expect(batch.children).toHaveLength(3);
  });
});
