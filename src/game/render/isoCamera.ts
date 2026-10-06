import * as THREE from 'three';

/**
 * Fixed axonometric camera: true isometric angles (45° around, ~35.26° down), looking north-east
 * from the south-west. Orthographic, so there's no perspective distortion; it only follows and
 * zooms.
 */
export class IsoCamera {
  readonly camera: THREE.OrthographicCamera;
  /** Ground-plane (x, z) unit vectors in screen terms. */
  readonly screenUp = new THREE.Vector2(Math.SQRT1_2, -Math.SQRT1_2);
  readonly screenRight = new THREE.Vector2(Math.SQRT1_2, Math.SQRT1_2);
  /** Ground-plane direction pointing from the scene toward the camera. */
  readonly toCamera = new THREE.Vector2(-Math.SQRT1_2, Math.SQRT1_2);

  /** World units visible vertically at zoom 1. */
  private readonly viewHeight = 15;
  private readonly offset = new THREE.Vector3(-1, 1, 1).normalize().multiplyScalar(60);
  private readonly target = new THREE.Vector3();
  private aspect = 16 / 9;
  private zoomLevel = 1;

  constructor() {
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
  }

  resize(width: number, height: number) {
    this.aspect = width / Math.max(1, height);
    // Keep the view comfortable on very wide or tall screens.
    const h = this.viewHeight * (this.aspect < 1 ? 1.35 : 1);
    this.camera.top = h / 2;
    this.camera.bottom = -h / 2;
    this.camera.left = (-h * this.aspect) / 2;
    this.camera.right = (h * this.aspect) / 2;
    this.camera.updateProjectionMatrix();
  }

  zoomBy(steps: number) {
    this.zoomLevel = THREE.MathUtils.clamp(this.zoomLevel * Math.pow(1.12, steps), 0.6, 1.8);
    this.camera.zoom = this.zoomLevel;
    this.camera.updateProjectionMatrix();
  }

  /** Ease toward a world point (x, z); `snap` jumps straight there. */
  follow(x: number, z: number, dt: number, snap = false) {
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    this.target.x += (x - this.target.x) * k;
    this.target.z += (z - this.target.z) * k;
    this.target.y = 0.5;
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.lookAt(this.target);
  }
}
