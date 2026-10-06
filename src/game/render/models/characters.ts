import * as THREE from 'three';
import type { PersonalityDef, TeacherDef } from '@core/model/types';
import type { MaterialKit } from '../materials';
import { PALETTE } from '../palette';
import { box, capsule, cyl, part, sphere, torus } from './parts';

// ---------------------------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------------------------

/** Joints the gait animator drives. All rotate about local Z (forward/back swing). */
export interface Rig {
  /** Moves up/down so the planted foot stays on the floor. */
  pelvis: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  hipL: THREE.Group;
  hipR: THREE.Group;
  kneeL: THREE.Group;
  kneeR: THREE.Group;
  shoulderL: THREE.Group;
  shoulderR: THREE.Group;
  elbowL: THREE.Group;
  elbowR: THREE.Group;
}

export interface CharacterModel {
  root: THREE.Group;
  rig: Rig;
  /** Thigh and shin length (unscaled); the gait solver keeps feet on the floor with these. */
  thigh: number;
  shin: number;
  scale: number;
  /** Optional carried-scrap sack. */
  sack?: THREE.Object3D;
}

/** What a character looks like; one rig, many outfits. */
export interface RigSpec {
  scale: number;
  skin: number;
  shirt: number;
  pants: number;
  shoes: number;
  /** Chest radius; a bigger number reads as a bigger build. */
  build: number;
  cap?: number;
  hair?: number;
  bald?: boolean;
  vest?: boolean;
  belt?: number;
  tie?: number;
  backpack?: number;
  sack?: boolean;
  /** Diagonal sash across the chest (hall monitor). */
  sash?: number;
  glasses?: boolean;
  /** Glowing phone held in front of the chest. */
  phone?: boolean;
  /** Propeller on top of the cap. */
  propeller?: boolean;
  /** Give every mesh its own material (so the player can fade without touching NPCs). */
  unique?: boolean;
}

const pivot = (parent: THREE.Object3D, x: number, y: number, z: number) => {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
};

/**
 * Jointed low-poly character, facing +X (local +Z is the character's right). Limbs hang from
 * pivot groups at the hips, knees, shoulders and elbows so they can swing naturally.
 */
export function buildCharacter(kit: MaterialKit, spec: RigSpec): CharacterModel {
  const m = (c: number, o?: { roughness?: number; metalness?: number }) =>
    spec.unique ? kit.unique(c, o) : kit.get(c, o);
  const thigh = 0.2;
  const shin = 0.2;
  const root = new THREE.Group();
  const scaled = pivot(root, 0, 0, 0);
  scaled.scale.setScalar(spec.scale);
  const pelvis = pivot(scaled, 0, thigh + shin, 0);

  // Legs: thigh → knee → shin + boot.
  const legMat = m(spec.pants);
  const shoeMat = m(spec.shoes);
  const leg = (side: number) => {
    const hip = pivot(pelvis, 0, 0, side * 0.085);
    part(box(0.12, thigh, 0.11), legMat, 0, -thigh / 2, 0, hip);
    const knee = pivot(hip, 0, -thigh, 0);
    part(box(0.1, shin - 0.03, 0.1), legMat, 0, -(shin - 0.03) / 2, 0, knee);
    part(box(0.17, 0.05, 0.11), shoeMat, 0.035, -shin + 0.025, 0, knee);
    return { hip, knee };
  };
  const L = leg(-1);
  const R = leg(1);

  // Torso pivots at the pelvis so it can lean and twist over the legs.
  const torso = pivot(pelvis, 0, 0, 0);
  const shirt = m(spec.shirt);
  part(box(0.2, 0.1, 0.26), legMat, 0, 0.03, 0, torso);
  const chest = part(capsule(spec.build, 0.14), shirt, 0, 0.2, 0, torso);
  chest.scale.set(0.85, 1, 1.15);
  if (spec.belt !== undefined) part(box(0.27, 0.045, 0.34), m(spec.belt), 0, 0.07, 0, torso);
  if (spec.vest) {
    part(box(spec.build * 1.75, 0.045, spec.build * 2.05), m(0xfff176), 0, 0.27, 0, torso);
  }
  if (spec.tie !== undefined) {
    part(box(0.04, 0.2, 0.17), m(PALETTE.shirt), spec.build * 0.84, 0.27, 0, torso);
    part(box(0.035, 0.19, 0.055), m(spec.tie), spec.build * 0.86 + 0.01, 0.24, 0, torso);
  }
  if (spec.sash !== undefined) {
    const sash = part(box(0.05, 0.42, 0.05), m(spec.sash), spec.build * 0.9, 0.22, 0, torso);
    sash.rotation.x = 0.75;
    part(box(0.03, 0.06, 0.06), m(0xffeb3b), spec.build * 0.95 + 0.01, 0.26, 0.04, torso);
  }
  if (spec.phone) {
    // Held up at chest height, screen glowing on their face.
    part(box(0.05, 0.11, 0.07), m(0x212121), spec.build + 0.07, 0.24, 0.02, torso);
    part(
      box(0.012, 0.09, 0.055),
      kit.get(0x81d4fa, { emissive: 0x4fc3f7 }),
      spec.build + 0.045,
      0.24,
      0.02,
      torso,
    );
  }
  if (spec.backpack !== undefined) {
    part(box(0.12, 0.24, 0.24), m(spec.backpack), -spec.build - 0.03, 0.22, 0, torso);
  }
  let sack: THREE.Object3D | undefined;
  if (spec.sack) {
    const g = pivot(torso, -spec.build - 0.08, 0.2, 0);
    const bag = part(sphere(0.14, 8, 6), m(0x8d6e63), 0, 0, 0, g);
    bag.scale.set(0.9, 1.1, 1);
    part(
      cyl(0.03, 0.03, 0.12, 6),
      m(0xd9822b, { roughness: 0.4, metalness: 0.5 }),
      0,
      0.15,
      0.04,
      g,
    );
    sack = g;
  }

  // Arms: shoulder → upper arm → elbow → forearm + hand.
  const skin = m(spec.skin);
  const shoulderY = 0.33;
  const arm = (side: number) => {
    const shoulder = pivot(torso, 0, shoulderY, side * (spec.build + 0.05));
    part(box(0.085, 0.17, 0.085), shirt, 0, -0.085, 0, shoulder);
    const elbow = pivot(shoulder, 0, -0.17, 0);
    part(box(0.075, 0.13, 0.075), shirt, 0, -0.065, 0, elbow);
    part(sphere(0.045, 6, 5), skin, 0, -0.15, 0, elbow);
    return { shoulder, elbow };
  };
  const AL = arm(-1);
  const AR = arm(1);

  // Head.
  const head = pivot(torso, 0, 0.43, 0);
  part(sphere(0.13), skin, 0.01, 0.11, 0, head);
  if (spec.hair !== undefined) {
    part(sphere(0.135, 8, 6), m(spec.hair), -0.02, 0.15, 0, head).scale.set(1, 0.65, 1);
  }
  if (spec.bald) {
    part(box(0.2, 0.025, 0.16), m(0x5d4037), -0.01, 0.235, 0.01, head);
    part(box(0.05, 0.03, 0.1), m(0x5d4037), 0.13, 0.07, 0, head);
  }
  if (spec.cap !== undefined) {
    const capMat = m(spec.cap);
    part(cyl(0.135, 0.14, 0.07), capMat, 0, 0.2, 0, head);
    part(box(0.11, 0.022, 0.18), capMat, 0.14, 0.175, 0, head);
    if (spec.propeller) {
      part(cyl(0.012, 0.012, 0.06), m(0x9e9e9e), 0, 0.26, 0, head);
      for (const [c, a] of [
        [0xef5350, 0],
        [0x42a5f5, Math.PI / 2],
      ] as const) {
        part(box(0.2, 0.01, 0.04), m(c), 0, 0.29, 0, head).rotation.y = a;
      }
    }
  }
  if (spec.glasses) {
    const frame = m(0x212121);
    for (const z of [-0.045, 0.045]) {
      part(torus(0.03, 0.007, 4, 10), frame, 0.125, 0.12, z, head).rotation.y = Math.PI / 2;
    }
    part(box(0.01, 0.01, 0.03), frame, 0.13, 0.12, 0, head);
  }

  return {
    root,
    rig: {
      pelvis,
      torso,
      head,
      hipL: L.hip,
      hipR: R.hip,
      kneeL: L.knee,
      kneeR: R.knee,
      shoulderL: AL.shoulder,
      shoulderR: AR.shoulder,
      elbowL: AL.elbow,
      elbowR: AR.elbow,
    },
    thigh,
    shin,
    scale: spec.scale,
    sack,
  };
}

/** Maintenance worker: coloured work shirt, hi-vis stripe, tool belt, cap, scrap sack. */
export const buildWorker = (kit: MaterialKit, color: number) =>
  buildCharacter(kit, {
    scale: 1,
    skin: PALETTE.skin,
    shirt: color,
    pants: PALETTE.pants,
    shoes: 0x3e2723,
    build: 0.15,
    cap: new THREE.Color(color).multiplyScalar(0.7).getHex(),
    vest: true,
    belt: 0x3e2723,
    sack: true,
    unique: true,
  });

/** Mr. Gravy: grey suit, red tie, comb-over. */
export const buildBoss = (kit: MaterialKit) =>
  buildCharacter(kit, {
    scale: 1.1,
    skin: 0xe8b48a,
    shirt: PALETTE.bossSuit,
    pants: PALETTE.bossSuit,
    shoes: 0x1b1b1b,
    build: 0.18,
    bald: true,
    tie: PALETTE.bossTie,
  });

/** A student whose look gives away their personality (see core/content/npcs). */
export const buildStudent = (kit: MaterialKit, shirt: number, look: PersonalityDef['look']) =>
  buildCharacter(kit, {
    scale: 0.78,
    skin: look === 'sleepy' ? 0xe6b98a : PALETTE.skin,
    shirt: look === 'glasses' ? 0x8d6e63 : shirt,
    pants: 0x3d5a80,
    shoes: 0xeeeeee,
    build: 0.14,
    hair: look === 'propeller' ? undefined : 0x4e342e,
    backpack: look === 'phone' || look === 'sleepy' ? undefined : 0x5c6bc0,
    sash: look === 'sash' ? 0xff9800 : undefined,
    phone: look === 'phone',
    cap: look === 'propeller' ? 0xffca28 : undefined,
    propeller: look === 'propeller',
    glasses: look === 'glasses',
    vest: false,
  });

/** A teacher, dressed per their content outfit. */
export const buildTeacher = (kit: MaterialKit, def: TeacherDef) =>
  buildCharacter(kit, {
    scale: 1,
    skin: PALETTE.skin,
    shirt: def.outfit.shirt,
    pants: def.outfit.pants,
    shoes: 0x3e2723,
    build: 0.16,
    hair: def.outfit.hair,
    bald: def.outfit.bald,
    cap: def.outfit.cap,
    tie: def.outfit.tie,
    glasses: def.outfit.glasses,
  });
