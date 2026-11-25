import * as THREE from 'three';
import { OVERLAY_LAYER } from './layers';

/** The camera looks at a point this far above the ground (about waist height). */
const LOOK_HEIGHT = 0.5;

/**
 * Fixed axonometric camera: true isometric angles (45° around, ~35.26° down), looking north-east
 * from the south-west. Orthographic, so there's no perspective distortion. It only follows the
 * player; the framing is fixed and close, sized from the screen's shorter side so phones and
 * monitors see about the same amount of the school.
 */
export class IsoCamera {
  readonly camera: THREE.OrthographicCamera;
  /** Ground-plane (x, z) unit vectors in screen terms. */
  readonly screenUp = new THREE.Vector2(Math.SQRT1_2, -Math.SQRT1_2);
  readonly screenRight = new THREE.Vector2(Math.SQRT1_2, Math.SQRT1_2);
  /** Ground-plane direction pointing from the scene toward the camera. */
  readonly toCamera = new THREE.Vector2(-Math.SQRT1_2, Math.SQRT1_2);

  private readonly offset = new THREE.Vector3(-1, 1, 1).normalize().multiplyScalar(60);
  private readonly target = new THREE.Vector3();
  private aspect = 16 / 9;

  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
    this.camera.layers.enable(OVERLAY_LAYER);
  }

  /** World units across the screen's shorter side, from its size in CSS pixels. */
  static shortSideUnits(shortSidePx: number) {
    return THREE.MathUtils.clamp(shortSidePx / 64, 8.5, 11);
  }

  resize(width: number, height: number) {
    this.aspect = width / Math.max(1, height);
    const short = IsoCamera.shortSideUnits(Math.min(width, height));
    // Landscape: `short` units tall. Portrait: `short` units wide (and taller to match).
    const h = this.aspect >= 1 ? short : short / this.aspect;
    this.camera.top = h / 2;
    this.camera.bottom = -h / 2;
    this.camera.left = (-h * this.aspect) / 2;
    this.camera.right = (h * this.aspect) / 2;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Where the corners of the screen meet level planes at each of `heights`, relative to the
   * point on the ground the camera is following: the patch of the world this view shows, for
   * anything (the shadow pass) that only needs to cover that much.
   */
  footprint(heights: readonly number[]): THREE.Vector3[] {
    const forward = this.offset.clone().normalize().negate();
    const right = new THREE.Vector3().crossVectors(forward, this.camera.up).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward);
    const out: THREE.Vector3[] = [];
    for (const h of heights) {
      for (const u of [this.camera.left, this.camera.right]) {
        for (const v of [this.camera.bottom, this.camera.top]) {
          // On the plane through the point looked at, then along the line of sight to `h`.
          const p = new THREE.Vector3(0, LOOK_HEIGHT, 0)
            .addScaledVector(right, u)
            .addScaledVector(up, v);
          out.push(p.addScaledVector(forward, (h - p.y) / forward.y));
        }
      }
    }
    return out;
  }

  /** The point on the ground at the middle of the view (it trails what it follows a little). */
  get focus(): { x: number; z: number } {
    return this.target;
  }

  /** Ease toward a world point (x, z); `snap` jumps straight there. */
  follow(x: number, z: number, dt: number, snap = false) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    this.target.x += (x - this.target.x) * k;
    this.target.z += (z - this.target.z) * k;
    this.target.y = LOOK_HEIGHT;
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
  }
}
