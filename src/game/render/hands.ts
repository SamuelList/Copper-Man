import * as THREE from 'three';
import { onOverlay } from './layers';
import type { MaterialKit } from './materials';
import { metals } from './models/common';
import { box, cyl, part, rbox } from './models/parts';

export interface HandsPose {
  /** Stride from the first-person camera: where it is in its cycle, and how hard (0..2). */
  phase: number;
  amount: number;
  /** Hands busy scrapping, unlocking or selling. */
  working: boolean;
  /** How fast the view is turning, radians per second (right and up are positive). */
  turnX: number;
  turnY: number;
  time: number;
  dt: number;
}

interface Arm {
  pivot: THREE.Group;
  hand: THREE.Group;
}

const ease = (from: number, to: number, rate: number, dt: number) =>
  from + (to - from) * (1 - Math.exp(-rate * dt));

/**
 * The worker's own hands, as seen in first person: sleeves in their shirt colour, work gloves,
 * and a pipe wrench in the right. They swing with the stride, lag a little behind a quick turn,
 * and come up to work when you scrap or pick a lock.
 *
 * Everything sits within arm's reach of the camera it's parented to, closer than the worker can
 * get to a wall, so it never pokes through one. Lit by the room like anything else.
 */
export class Hands {
  readonly root = new THREE.Group();
  private readonly right: Arm;
  private readonly left: Arm;
  private readonly wrench = new THREE.Group();
  private work = 0;
  private swayX = 0;
  private swayY = 0;

  constructor(kit: MaterialKit, shirt: number) {
    const sleeve = kit.get(shirt, { roughness: 0.9 });
    const cuff = kit.get(new THREE.Color(shirt).multiplyScalar(0.6).getHex(), { roughness: 0.9 });
    const glove = kit.get(0xb8894f, { roughness: 0.8 });
    const arm = (side: 1 | -1): Arm => {
      // The elbow, just off the bottom of the screen; the forearm reaches forward from it.
      const pivot = new THREE.Group();
      part(box(0.026, 0.026, 0.13), sleeve, 0, 0, -0.065, pivot);
      part(box(0.03, 0.03, 0.012), cuff, 0, 0, -0.128, pivot);
      const hand = new THREE.Group();
      hand.position.set(0, 0, -0.15);
      pivot.add(hand);
      part(rbox(0.029, 0.024, 0.036, 0.008), glove, 0, 0, 0, hand);
      part(rbox(0.011, 0.012, 0.024, 0.004), glove, -side * 0.018, 0.004, 0.002, hand);
      this.root.add(pivot);
      return { pivot, hand };
    };
    this.right = arm(1);
    this.left = arm(-1);

    // A pipe wrench: rubber grip in the fist, steel jaw above it.
    const { steel, steelDark } = metals(kit);
    const grip = kit.get(0xc62828, { roughness: 0.6 });
    part(cyl(0.006, 0.006, 0.044, 8), grip, 0, 0.008, 0, this.wrench);
    part(cyl(0.0045, 0.0045, 0.034, 8), steel, 0, 0.046, 0, this.wrench);
    part(box(0.01, 0.026, 0.01), steel, 0.003, 0.074, 0, this.wrench);
    part(box(0.022, 0.008, 0.01), steel, 0.009, 0.085, 0, this.wrench);
    part(box(0.016, 0.007, 0.01), steelDark, 0.01, 0.066, 0, this.wrench);
    // Held low, pointing ahead and a little up.
    this.wrench.rotation.x = -1.05;
    this.right.hand.add(this.wrench);

    this.root.traverse((o) => {
      o.castShadow = false;
      // Never culled: they move with the camera.
      o.frustumCulled = false;
    });
    onOverlay(this.root);
  }

  update(pose: HandsPose) {
    const { dt, time } = pose;
    this.work = ease(this.work, pose.working ? 1 : 0, 9, dt);
    // Trail a quick turn of the head, then settle.
    const lag = (turn: number) => Math.max(-0.07, Math.min(0.07, -turn * 0.012));
    this.swayX = ease(this.swayX, lag(pose.turnX), 9, dt);
    this.swayY = ease(this.swayY, lag(pose.turnY), 9, dt);
    this.root.rotation.set(-this.swayY, this.swayX, 0);

    const w = this.work;
    const stride = pose.amount * (1 - w);
    const swing = Math.sin(pose.phase) * 0.07 * stride;
    const dip = Math.abs(Math.sin(pose.phase)) * 0.005 * stride;
    const breath = Math.sin(time * 1.6) * 0.0015;
    const turnWrench = Math.sin(time * 9);

    // Elbows sit just off the bottom corners of the screen; the forearms reach in from there.
    const { right, left } = this;
    right.pivot.position.set(0.105 - 0.035 * w, -0.14 + 0.012 * w - dip + breath, -0.03);
    right.pivot.rotation.set(0.26 + swing + 0.1 * w + turnWrench * 0.03 * w, 0.24 + 0.22 * w, 0);
    right.hand.rotation.z = turnWrench * 0.5 * w;
    // The free hand hangs lower, and comes up to steady the work.
    left.pivot.position.set(-0.108 + 0.04 * w, -0.158 + 0.03 * w - dip - breath, -0.03);
    left.pivot.rotation.set(0.16 - swing + 0.2 * w, -0.2 - 0.28 * w, 0);
    left.hand.rotation.z = -Math.sin(time * 9 + 0.6) * 0.12 * w;
  }
}
