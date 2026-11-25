import { lightAt, roomAt, tileAt } from '@core/level/asciiLevel';
import type { LevelDef } from '@core/level/types';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { batchStatic } from './batching';
import type { Lamp } from './lighting';
import { shadeWithWorld, type MaterialKit } from './materials';
import { box, canvasTexture, cyl, part } from './models/parts';
import { PALETTE } from './palette';

/**
 * What you only see from inside: the ceiling, the light fittings hanging from it, and the heads
 * of the doorways. The top-down camera looks in through the roof, so all of this is hidden
 * there.
 */

/** Height of an open doorway; the wall carries on above it. */
const DOOR_HEAD = 1.38;

/** Suspended ceiling: two-by-two acoustic panels per tile in a metal grid. */
const ceilingTexture = () =>
  canvasTexture('ceiling', 128, 128, (ctx) => {
    ctx.fillStyle = '#e4e0d6';
    ctx.fillRect(0, 0, 128, 128);
    // Pinholes in the panels.
    for (let i = 0; i < 900; i++) {
      const x = (i * 7919) % 128;
      const y = (i * 104729) % 128;
      ctx.fillStyle = i % 3 ? 'rgba(60,56,48,0.2)' : 'rgba(60,56,48,0.34)';
      ctx.fillRect(x, y, 1, 1);
    }
    // The grid the panels sit in.
    for (const at of [0, 64]) {
      ctx.fillStyle = '#a9a69c';
      ctx.fillRect(at, 0, 4, 128);
      ctx.fillRect(0, at, 128, 4);
      ctx.fillStyle = '#f6f4ee';
      ctx.fillRect(at + 1, 0, 2, 128);
      ctx.fillRect(0, at + 1, 128, 2);
    }
  });

/** Is there a roof over this tile? Everywhere that isn't a wall or out of doors. */
const indoors = (level: LevelDef, col: number, row: number) =>
  tileAt(level, col, row) !== 'wall' && roomAt(level, col, row)?.kind !== 'exterior';

function buildCeiling(level: LevelDef, kit: MaterialKit, height: number, anisotropy: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  for (let row = 0; row < level.rows; row++) {
    for (let col = 0; col < level.cols; col++) {
      if (!indoors(level, col, row)) continue;
      // Two triangles facing down.
      for (const [dx, dz] of [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
        [1, 1],
        [0, 1],
      ] as const) {
        positions.push(col + dx, height, row + dz);
        uvs.push(col + dx, row + dz);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const normals = new Float32Array(positions.length);
  for (let i = 1; i < normals.length; i += 3) normals[i] = -1;
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

  const map = ceilingTexture();
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = anisotropy;
  // A ceiling faces away from every light in the scene: what lights it is the room's light
  // bouncing off the floor, so it gives back a share of that whichever way it faces.
  const material = shadeWithWorld(
    new THREE.MeshStandardMaterial({ color: 0xffffff, map, roughness: 0.95 }),
    kit.shading,
    { bounce: 0.5 },
  );
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'ceiling';
  return mesh;
}

/** A coloured rectangle facing down. */
function panel(x: number, y: number, z: number, w: number, d: number, color: THREE.Color) {
  const g = new THREE.PlaneGeometry(w, d);
  g.rotateX(Math.PI / 2);
  g.translate(x, y, z);
  return tint(g, color);
}

function tint(g: THREE.BufferGeometry, color: THREE.Color) {
  const count = g.attributes.position!.count;
  const data = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) data.set([color.r, color.g, color.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(data, 3));
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  return g.index ? g.toNonIndexed() : g;
}

/**
 * The lit part of every fitting, in one mesh: fluorescent panels set into the ceiling and bare
 * bulbs on cords. Brighter than white, so they bloom; brighter still in brighter rooms.
 */
function buildFittings(
  level: LevelDef,
  kit: MaterialKit,
  lamps: readonly Lamp[],
  height: number,
): THREE.Object3D[] {
  const lit: THREE.BufferGeometry[] = [];
  const hardware: THREE.Object3D[] = [];
  const cord = kit.get(0x26282b, { roughness: 0.8 });
  const shade = kit.get(0x39424a, { roughness: 0.5, metalness: 0.5 });
  for (const lamp of lamps) {
    const room = level.rooms.find((r) => r.id === lamp.roomId);
    if (!room) continue;
    const bright = lightAt(level, room.rect.col, room.rect.row);
    const peak = Math.max(...lamp.color);
    const glow = new THREE.Color(
      lamp.color[0] / peak,
      lamp.color[1] / peak,
      lamp.color[2] / peak,
    ).multiplyScalar(1.6 + bright * 3);
    if (lamp.fitting === 'panel') {
      // Long side down the length of the room.
      const along = room.rect.w >= room.rect.h;
      lit.push(panel(lamp.x, height - 0.004, lamp.y, along ? 0.9 : 0.42, along ? 0.42 : 0.9, glow));
    } else {
      const bulb = tint(new THREE.IcosahedronGeometry(0.05, 1), glow.multiplyScalar(1.5));
      bulb.translate(lamp.x, height - 0.36, lamp.y);
      lit.push(bulb);
      const pendant = new THREE.Group();
      part(cyl(0.008, 0.008, 0.28, 5), cord, 0, height - 0.14, 0, pendant);
      part(cyl(0.03, 0.11, 0.07, 10), shade, 0, height - 0.3, 0, pendant);
      pendant.position.set(lamp.x, 0, lamp.y);
      pendant.traverse((o) => (o.castShadow = false));
      hardware.push(pendant);
    }
  }
  const out: THREE.Object3D[] = [];
  const merged = lit.length ? mergeGeometries(lit, false) : null;
  lit.forEach((g) => g.dispose());
  if (merged) {
    const mesh = new THREE.Mesh(merged, new THREE.MeshBasicMaterial({ vertexColors: true }));
    mesh.name = 'lamps';
    out.push(mesh);
  }
  if (hardware.length) out.push(batchStatic(hardware, kit, 16));
  return out;
}

/**
 * Open doorways, finished: wall above the opening (seen from above they're simply gaps, which
 * reads better there) and a casing around it on both faces.
 */
function buildDoorHeads(level: LevelDef, kit: MaterialKit, height: number): THREE.Object3D {
  const wall = kit.wall(PALETTE.wallSide, 0.9);
  const casing = kit.get(PALETTE.door, { roughness: 0.55 });
  const open = (col: number, row: number) => tileAt(level, col, row) !== 'wall';
  const frames: THREE.Object3D[] = [];
  for (const door of level.doors) {
    // Locked doors come with their own full-height frame.
    if (door.locked) continue;
    const { col, row } = door.tile;
    // Built for a doorway you walk through north to south; turned for the other kind.
    const northSouth = open(col, row - 1) && open(col, row + 1);
    const frame = new THREE.Group();
    part(box(1, height - DOOR_HEAD, 1), wall, 0, (height + DOOR_HEAD) / 2, 0, frame);
    for (const face of [-1, 1]) {
      part(box(1, 0.07, 0.03), casing, 0, DOOR_HEAD - 0.035, face * 0.5, frame);
      for (const side of [-1, 1]) {
        // A post only where the opening meets wall (double doors share one opening).
        const beside = northSouth ? open(col + side, row) : open(col, row - side);
        if (!beside)
          part(box(0.06, DOOR_HEAD, 0.03), casing, side * 0.47, DOOR_HEAD / 2, face * 0.5, frame);
      }
    }
    frame.position.set(col + 0.5, 0, row + 0.5);
    if (!northSouth) frame.rotation.y = Math.PI / 2;
    frames.push(frame);
  }
  return batchStatic(frames, kit, 16);
}

/** Ceiling, light fittings and door heads for a level, as one group to show in first person. */
export function buildInterior(
  level: LevelDef,
  kit: MaterialKit,
  lamps: readonly Lamp[],
  height: number,
  anisotropy: number,
): THREE.Group {
  const group = new THREE.Group();
  group.name = 'interior';
  group.add(
    buildCeiling(level, kit, height, anisotropy),
    ...buildFittings(level, kit, lamps, height),
    buildDoorHeads(level, kit, height),
  );
  return group;
}
