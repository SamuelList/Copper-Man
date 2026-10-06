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

  it('keeps textured and glowing materials separate, and splits by chunk', () => {
    const glow = crate(0.5, 0xffffff);
    (glow.children[0] as THREE.Mesh).material = kit.get(0xff8800, { emissive: 0xff4400 });
    const far = crate(20.5, 0x0000ff);
    const batch = batchStatic([crate(1.5, 0xff0000), glow, far], kit, 8);
    expect(batch.children).toHaveLength(3);
  });
});
