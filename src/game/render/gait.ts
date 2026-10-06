/**
 * Procedural walk/run cycle. Pure math (no Three.js) so it can be unit-tested.
 *
 * The cycle is driven by distance travelled rather than time, so feet plant where they land
 * instead of skating. Walking and running are separate poses blended by a smoothed "run"
 * weight; crouching and working (hands busy on a fixture) layer on top. All angles are radians
 * about the character's local Z axis: positive swings a limb forward.
 */

export interface GaitInput {
  /** Ground speed in tiles per second (measured from actual movement). */
  speed: number;
  running: boolean;
  crouching: boolean;
  /** Hands busy scrapping/unlocking. */
  working: boolean;
  /** Yaw change in radians per second (for leaning into turns). */
  turnRate: number;
  dt: number;
}

export interface Pose {
  /** Pelvis height above the floor, in leg units (thigh + shin = 1). */
  pelvis: number;
  lean: number;
  roll: number;
  twist: number;
  hipL: number;
  hipR: number;
  kneeL: number;
  kneeR: number;
  shoulderL: number;
  shoulderR: number;
  elbowL: number;
  elbowR: number;
  head: number;
  /** Chest breathing scale offset. */
  breathe: number;
}

export interface GaitUpdate {
  pose: Pose;
  /** Feet that hit the ground this frame: 0 = left, 1 = right. */
  strikes: number[];
  /** How "run" the current motion is, 0..1 (for dust etc.). */
  run: number;
}

const TAU = Math.PI * 2;
const approach = (from: number, to: number, rate: number, dt: number) =>
  from + (to - from) * (1 - Math.exp(-rate * dt));
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Tiles covered per full cycle (two steps). Longer strides at speed, like a real gait. */
export const cycleLength = (speed: number) => 1.3 + speed * 0.25;

interface Params {
  hip: number;
  knee: number;
  arm: number;
  elbow: number;
  elbowSwing: number;
  lean: number;
  twist: number;
  flight: number;
}

const WALK: Params = {
  hip: 0.55,
  knee: 0.85,
  arm: 0.5,
  elbow: 0.25,
  elbowSwing: 0.3,
  lean: 0.06,
  twist: 0.12,
  flight: 0,
};
const RUN: Params = {
  hip: 0.85,
  knee: 1.55,
  arm: 0.95,
  elbow: 1.45,
  elbowSwing: 0.4,
  lean: 0.32,
  twist: 0.2,
  flight: 0.09,
};

const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Height of a hip above its foot for given joint angles, in leg units (thigh = shin = 0.5). */
const legHeight = (hip: number, knee: number) => 0.5 * Math.cos(hip) + 0.5 * Math.cos(hip + knee);

export class Gait {
  private phase = 0;
  private time = 0;
  private move = 0;
  private run = 0;
  private crouch = 0;
  private work = 0;
  private roll = 0;

  update(input: GaitInput): GaitUpdate {
    const { dt } = input;
    this.time += dt;
    const speed = Math.max(0, input.speed);

    // Advance by distance so feet stay planted; keep cycling briefly while easing to a stop.
    const prev = this.phase;
    this.phase += (TAU * speed * dt) / cycleLength(speed);
    const strikes: number[] = [];
    // A foot lands when its leg reaches full forward swing: left at phase π/2, right at 3π/2.
    for (const [foot, at] of [
      [0, Math.PI / 2],
      [1, (3 * Math.PI) / 2],
    ] as const) {
      const k = Math.floor((this.phase - at) / TAU) - Math.floor((prev - at) / TAU);
      if (k > 0 && speed > 0.2) strikes.push(foot);
    }

    this.move = approach(this.move, clamp(speed / 1.2, 0, 1), 10, dt);
    this.run = approach(this.run, input.running && speed > 0.5 ? 1 : 0, 6, dt);
    this.crouch = approach(this.crouch, input.crouching ? 1 : 0, 12, dt);
    this.work = approach(this.work, input.working ? 1 : 0, 10, dt);
    this.roll = approach(this.roll, clamp(-input.turnRate * 0.05 * this.move, -0.22, 0.22), 8, dt);

    const p: Params = {} as Params;
    for (const key of Object.keys(WALK) as (keyof Params)[])
      p[key] = mix(WALK[key], RUN[key], this.run);
    // Crouch-walking takes shorter steps.
    const stride = this.move * (1 - this.crouch * 0.45);

    const s = Math.sin(this.phase);
    const swingL = Math.max(0, Math.cos(this.phase));
    const swingR = Math.max(0, Math.cos(this.phase + Math.PI));

    const crouchHip = this.crouch * 0.95;
    const crouchKnee = -this.crouch * 1.6;
    let hipL = p.hip * stride * s + crouchHip;
    let hipR = -p.hip * stride * s + crouchHip;
    let kneeL = -(0.08 + p.knee * swingL) * stride + crouchKnee;
    let kneeR = -(0.08 + p.knee * swingR) * stride + crouchKnee;

    // Working: a little knee bend, planted.
    hipL += this.work * 0.25;
    hipR += this.work * 0.25;
    kneeL -= this.work * 0.4;
    kneeR -= this.work * 0.4;

    // Keep the lower foot on the floor; running adds a short flight phase.
    const pelvis =
      Math.max(legHeight(hipL, kneeL), legHeight(hipR, kneeR)) +
      p.flight * this.move * Math.cos(this.phase) ** 2;

    // Arms swing opposite the legs; hands come forward to work.
    const idleSway = (1 - this.move) * 0.04 * Math.sin(this.time * 1.3);
    let shoulderL = -p.arm * stride * s + idleSway + this.crouch * 0.35;
    let shoulderR = p.arm * stride * s - idleSway + this.crouch * 0.35;
    let elbowL = p.elbow * this.move + p.elbowSwing * stride * Math.max(0, -s) + this.crouch * 0.3;
    let elbowR = p.elbow * this.move + p.elbowSwing * stride * Math.max(0, s) + this.crouch * 0.3;
    const hammer = Math.sin(this.time * 15);
    shoulderL = mix(shoulderL, 1.05 + 0.22 * hammer, this.work);
    shoulderR = mix(shoulderR, 1.05 - 0.22 * hammer, this.work);
    elbowL = mix(elbowL, 0.55 - 0.2 * hammer, this.work);
    elbowR = mix(elbowR, 0.55 + 0.2 * hammer, this.work);

    const lean = p.lean * this.move + this.crouch * 0.4 + this.work * 0.28;
    return {
      pose: {
        pelvis,
        lean,
        roll: this.roll,
        twist: p.twist * stride * s,
        hipL,
        hipR,
        kneeL,
        kneeR,
        shoulderL,
        shoulderR,
        elbowL,
        elbowR,
        // Keep the eyes level-ish.
        head: lean * 0.6,
        breathe: (1 - this.move) * 0.012 * Math.sin(this.time * 2.2),
      },
      strikes,
      run: this.run,
    };
  }
}
