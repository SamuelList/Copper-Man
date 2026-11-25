import * as THREE from 'three';
import { cycleLength } from './gait';
import { OVERLAY_LAYER } from './layers';
import { applyLook, EYE_HEIGHT, headBob, lookBasis, verticalFov, type Look } from './lookMath';

/** Extra field of view at a full sprint, degrees. */
const SPRINT_FOV = 7;
/** Ignore position jumps bigger than this (being escorted back to the van), tiles. */
const TELEPORT_TILES = 1.5;

export interface Stride {
  /** The worker is sprinting. */
  sprinting: boolean;
  /** Sideways part of their movement, -1 (left) to 1 (right). */
  strafe: number;
}

/**
 * The worker's eyes: a perspective camera at head height that you turn yourself. It walks with
 * a little head bob timed to the same stride as the body's gait, widens its view in a sprint,
 * and leans into a strafe. All of that eases off for people who prefer reduced motion.
 */
export class FirstPersonCamera {
  readonly camera = new THREE.PerspectiveCamera(64, 16 / 9, 0.03, 190);
  private look: Look = { yaw: 0, pitch: 0 };
  private aspect = 16 / 9;
  private phase = 0;
  private stride = 0;
  private kick = 0;
  private lean = 0;
  private last: { x: number; z: number } | null = null;
  private speed = 0;
  private readonly calm =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

  constructor() {
    this.camera.rotation.order = 'YXZ';
    this.camera.layers.enable(OVERLAY_LAYER);
  }

  /** Heading you're looking along (a map angle, like the simulation's `facing`). */
  get yaw() {
    return this.look.yaw;
  }

  get pitch() {
    return this.look.pitch;
  }

  /** Where the stride is in its cycle, and how hard (0 standing, 1 walking, 2 sprinting). */
  get gait() {
    return { phase: this.phase, amount: this.stride };
  }

  /** Movement directions for the input controller: forward and right of where you look. */
  get basis() {
    return lookBasis(this.look.yaw);
  }

  /** Start out looking level along `heading`. */
  face(heading: number) {
    this.look = { yaw: heading, pitch: 0 };
    this.last = null;
  }

  /** Turn by `dx` radians to the right and `dy` radians up. */
  turn(dx: number, dy: number) {
    this.look = applyLook(this.look, dx, dy);
  }

  resize(width: number, height: number) {
    this.aspect = width / Math.max(1, height);
    this.camera.aspect = this.aspect;
    this.applyFov();
  }

  private applyFov() {
    this.camera.fov = verticalFov(this.aspect) + this.kick * SPRINT_FOV;
    this.camera.updateProjectionMatrix();
  }

  /** Put the eyes at world (x, z) and advance the stride. */
  update(x: number, z: number, dt: number, stride: Stride) {
    // Measured ground speed (tiles/s) drives the bob, so it stops when you walk into a wall.
    if (this.last && dt > 0) {
      const moved = Math.hypot(x - this.last.x, z - this.last.z);
      const instant = moved > TELEPORT_TILES ? 0 : moved / dt;
      this.speed += (instant - this.speed) * (1 - Math.exp(-dt * 12));
    }
    this.last = { x, z };
    this.phase += (Math.PI * 2 * this.speed * dt) / cycleLength(this.speed);

    const ease = (from: number, to: number, rate: number) =>
      from + (to - from) * (1 - Math.exp(-dt * rate));
    const moving = Math.min(1, this.speed / 1.2);
    const calm = this.calm ? 0 : 1;
    this.stride = ease(this.stride, moving * (stride.sprinting ? 2 : 1) * calm, 8);
    this.lean = ease(this.lean, -stride.strafe * 0.014 * moving * calm, 6);
    const kick = ease(this.kick, stride.sprinting && moving > 0.5 ? calm : 0, 5);
    if (Math.abs(kick - this.kick) > 1e-4) {
      this.kick = kick;
      this.applyFov();
    }

    const bob = headBob(this.phase, this.stride);
    const right = lookBasis(this.look.yaw).screenRight;
    this.camera.position.set(x + right.x * bob.x, EYE_HEIGHT + bob.y, z + right.y * bob.x);
    // Three.js cameras look down -Z; a map heading of 0 looks along +X.
    this.camera.rotation.set(this.look.pitch, -this.look.yaw - Math.PI / 2, this.lean + bob.roll);
  }
}
