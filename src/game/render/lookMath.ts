/**
 * Math for the first-person view. Pure (no Three.js) so it can be unit-tested.
 *
 * Headings are map angles like the simulation's `facing`: radians, 0 = east, growing clockwise
 * as seen on the map (y points down), so turning right adds to the heading.
 */

export interface Look {
  /** Heading, radians, wrapped to (-PI, PI]. */
  yaw: number;
  /** Radians above (+) or below (-) level. */
  pitch: number;
}

/** How far up or down you can look. */
export const MAX_PITCH = (80 * Math.PI) / 180;

/** Height of the worker's eyes, tiles. */
export const EYE_HEIGHT = 0.92;

const wrap = (a: number) => {
  const r = (a + Math.PI) % (Math.PI * 2);
  return (r < 0 ? r + Math.PI * 2 : r) - Math.PI;
};

/** Turn by `dx` radians to the right and `dy` radians up. */
export function applyLook(look: Look, dx: number, dy: number): Look {
  return {
    yaw: wrap(look.yaw + dx),
    pitch: Math.max(-MAX_PITCH, Math.min(MAX_PITCH, look.pitch + dy)),
  };
}

/**
 * Ground-plane directions for movement input: "up" on the stick or W walks the way you face,
 * "right" strafes to your right.
 */
export function lookBasis(yaw: number) {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { screenUp: { x: c, y: s }, screenRight: { x: -s, y: c } };
}

/**
 * Which way something lies from where you're looking: 0 straight ahead, positive to your
 * right, PI (or -PI) directly behind. Positions are map coordinates.
 */
export function bearingTo(
  eye: { x: number; y: number },
  yaw: number,
  target: { x: number; y: number },
) {
  return wrap(Math.atan2(target.y - eye.y, target.x - eye.x) - yaw);
}

const HORIZONTAL_FOV = (96 * Math.PI) / 180;

/**
 * Vertical field of view, degrees, for a screen shape: a comfortable width on a monitor,
 * without the fisheye on an ultra-wide phone or tunnel vision in portrait.
 */
export function verticalFov(aspect: number) {
  const fov = (2 * Math.atan(Math.tan(HORIZONTAL_FOV / 2) / aspect) * 180) / Math.PI;
  return Math.max(58, Math.min(82, fov));
}

export interface HeadBob {
  /** Sideways sway, tiles (+ is to the right). */
  x: number;
  /** Up and down, tiles. */
  y: number;
  /** Lean into the sway, radians. */
  roll: number;
}

/**
 * Where the head is in its stride. `phase` is the gait cycle (two steps per turn, as in
 * gait.ts); the head dips once per step and sways once per cycle. `amount` runs 0 (standing) to
 * 1 (walking) to 2 (sprinting).
 */
export function headBob(phase: number, amount: number): HeadBob {
  const lift = 0.013 * amount;
  return {
    x: Math.cos(phase) * lift * 0.6,
    y: -Math.abs(Math.sin(phase)) * lift * 1.6 + lift * 0.8,
    roll: Math.cos(phase) * 0.004 * amount,
  };
}
