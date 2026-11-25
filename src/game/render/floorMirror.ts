import * as THREE from 'three';

/**
 * What the floor reflects. The scene is drawn a second time from a camera mirrored through the
 * floor plane, into a half-size target; the floor's shader then looks its own world position up
 * in that picture. Mipmaps of the target give blurrier reflections on duller floors.
 */
export class FloorMirror {
  private readonly target: THREE.WebGLRenderTarget;
  /** World position to mirror-texture coordinates (divide by w). */
  readonly matrix = new THREE.Matrix4();
  private readonly perspective = new THREE.PerspectiveCamera();
  private readonly orthographic = new THREE.OrthographicCamera();
  private readonly position = new THREE.Vector3();
  private readonly aim = new THREE.Vector3();
  private readonly up = new THREE.Vector3();
  /** Things at or below the floor that would block a view from underneath it. */
  private readonly hidden: THREE.Object3D[] = [];

  constructor() {
    this.target = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      generateMipmaps: true,
      minFilter: THREE.LinearMipmapLinearFilter,
    });
    // These cameras stay on the default layer only: markers aren't part of the room.
  }

  get texture() {
    return this.target.texture;
  }

  /** Size of the screen's drawing buffer; the mirror is drawn at half that. */
  setSize(width: number, height: number) {
    this.target.setSize(Math.max(1, width >> 1), Math.max(1, height >> 1));
  }

  /** Hide these while the mirror is drawn (the floor itself and what's under it). */
  hide(...objects: THREE.Object3D[]) {
    this.hidden.push(...objects);
  }

  /**
   * Draw the reflection for this frame. Call before the scene itself is drawn; this pass also
   * renders the frame's shadow maps, so the scene's own pass can skip them.
   */
  render(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
  ) {
    camera.updateMatrixWorld();
    let mirror: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    if (camera instanceof THREE.PerspectiveCamera) {
      mirror = this.perspective;
      mirror.fov = camera.fov;
      mirror.aspect = camera.aspect;
    } else {
      mirror = this.orthographic;
      mirror.left = camera.left;
      mirror.right = camera.right;
      mirror.top = camera.top;
      mirror.bottom = camera.bottom;
      mirror.zoom = camera.zoom;
    }
    mirror.near = camera.near;
    mirror.far = camera.far;
    mirror.updateProjectionMatrix();

    // The same camera, reflected through the floor (y = 0): position, aim and up all flip.
    const e = camera.matrixWorld.elements;
    this.position.setFromMatrixPosition(camera.matrixWorld);
    this.aim.set(-e[8]!, -e[9]!, -e[10]!).add(this.position);
    this.up.set(e[4]!, -e[5]!, e[6]!);
    mirror.position.set(this.position.x, -this.position.y, this.position.z);
    mirror.up.copy(this.up);
    mirror.lookAt(this.aim.x, -this.aim.y, this.aim.z);
    mirror.updateMatrixWorld();

    this.matrix
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(mirror.projectionMatrix)
      .multiply(mirror.matrixWorldInverse);

    const shown = this.hidden.map((o) => o.visible);
    for (const o of this.hidden) o.visible = false;
    const target = renderer.getRenderTarget();
    renderer.setRenderTarget(this.target);
    renderer.render(scene, mirror);
    renderer.setRenderTarget(target);
    this.hidden.forEach((o, i) => (o.visible = shown[i]!));
  }

  dispose() {
    this.target.dispose();
  }
}
