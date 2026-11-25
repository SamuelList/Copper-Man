import * as THREE from 'three';
import {
  AO_BLUR_FRAGMENT,
  AO_FRAGMENT,
  BLOOM_DOWN_FRAGMENT,
  BLOOM_UP_FRAGMENT,
  COMPOSITE_FRAGMENT,
  FULLSCREEN_VERTEX,
  FXAA_FRAGMENT,
} from './shaders';

/** How the finished picture is graded. Each view has its own (see `LOOKS`). */
export interface PostLook {
  exposure: number;
  /** Strength of the glow around bright things, and how bright "bright" is. */
  bloom: number;
  bloomThreshold: number;
  /** Ambient occlusion: how dark, and how far (world units) a surface feels its neighbours. */
  ao: number;
  aoRadius: number;
  saturation: number;
  contrast: number;
  vignette: number;
  /** Blur toward the top and bottom of the screen, in pixels at 800 px tall (0 = off). */
  tilt: number;
  /** Colour fringing toward the corners (0 = off). */
  aberration: number;
  grain: number;
  shadowTint: readonly [number, number, number];
  highlightTint: readonly [number, number, number];
}

/** 1: bloom, grade and anti-aliasing. 2: also ambient occlusion and lens effects. */
export type PostLevel = 1 | 2;

const MAX_BLOOM_LEVELS = 6;

type Uniforms = Record<string, THREE.IUniform>;

function fullscreenMaterial(
  fragmentShader: string,
  uniforms: Uniforms,
  defines: Record<string, string> = {},
) {
  return new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader,
    uniforms,
    defines,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
}

/**
 * The post-processing chain. The scene is drawn once into a high-dynamic-range target with a
 * depth texture; everything else is screen-space:
 *
 *   scene (HDR + depth) → ambient occlusion (half res, blurred) ┐
 *                       → bloom (a pyramid of ever-blurrier copies) ┤
 *                                                    composite + grade → FXAA + grain → screen
 *
 * `QualityGovernor` picks the level; level 1 skips the occlusion and lens passes.
 */
export class PostFX {
  private readonly sceneTarget: THREE.WebGLRenderTarget;
  private readonly ldrTarget: THREE.WebGLRenderTarget;
  private readonly aoTargets: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
  private readonly bloomTargets: THREE.WebGLRenderTarget[] = [];
  private readonly triangle: THREE.Mesh;
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly ao: THREE.ShaderMaterial;
  private readonly aoBlur: THREE.ShaderMaterial;
  private readonly bloomPrefilter: THREE.ShaderMaterial;
  private readonly bloomDown: THREE.ShaderMaterial;
  private readonly bloomUp: THREE.ShaderMaterial;
  private readonly composite: THREE.ShaderMaterial;
  private readonly fxaa: THREE.ShaderMaterial;
  private level: PostLevel = 2;
  private lens = { tilt: false, aberration: false };
  private width = 1;
  private height = 1;

  /** Rendering to floating-point targets is an extension, though nearly universal on WebGL 2. */
  static supported(renderer: THREE.WebGLRenderer) {
    return (
      renderer.extensions.has('EXT_color_buffer_float') ||
      renderer.extensions.has('EXT_color_buffer_half_float')
    );
  }

  constructor(private readonly renderer: THREE.WebGLRenderer) {
    this.sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      depthTexture: new THREE.DepthTexture(1, 1),
    });
    this.ldrTarget = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
    const aoTarget = () =>
      new THREE.WebGLRenderTarget(1, 1, {
        depthBuffer: false,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
      });
    this.aoTargets = [aoTarget(), aoTarget()];

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    this.triangle = new THREE.Mesh(geometry);
    this.triangle.frustumCulled = false;

    this.ao = fullscreenMaterial(AO_FRAGMENT, {
      tDepth: { value: this.sceneTarget.depthTexture },
      uProj: { value: new THREE.Matrix4() },
      uProjInv: { value: new THREE.Matrix4() },
      uDepthTexel: { value: new THREE.Vector2() },
      uRadius: { value: 0.6 },
      uIntensity: { value: 1.5 },
      uBias: { value: 0.02 },
      uFar: { value: 200 },
    });
    this.aoBlur = fullscreenMaterial(AO_BLUR_FRAGMENT, {
      tAo: { value: null },
      uStep: { value: new THREE.Vector2() },
      uFar: { value: 200 },
      uSlope: { value: 0 },
    });
    const bloomUniforms = (): Uniforms => ({
      tSource: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uThreshold: { value: 1 },
      uKnee: { value: 0.5 },
      uSpread: { value: 1 },
    });
    this.bloomPrefilter = fullscreenMaterial(BLOOM_DOWN_FRAGMENT, bloomUniforms(), {
      PREFILTER: '',
    });
    this.bloomDown = fullscreenMaterial(BLOOM_DOWN_FRAGMENT, bloomUniforms());
    this.bloomUp = fullscreenMaterial(BLOOM_UP_FRAGMENT, bloomUniforms());
    this.bloomUp.blending = THREE.CustomBlending;
    this.bloomUp.blendSrc = THREE.OneFactor;
    this.bloomUp.blendDst = THREE.OneFactor;
    this.bloomUp.transparent = true;

    this.composite = fullscreenMaterial(COMPOSITE_FRAGMENT, {
      tScene: { value: this.sceneTarget.texture },
      tBloom: { value: null },
      tAo: { value: this.aoTargets[0].texture },
      tDepth: { value: this.sceneTarget.depthTexture },
      uProjInv: { value: new THREE.Matrix4() },
      uSceneTexel: { value: new THREE.Vector2() },
      uAoSize: { value: new THREE.Vector2() },
      uFar: { value: 200 },
      uExposure: { value: 1 },
      uBloom: { value: 0 },
      uAo: { value: 0 },
      uSaturation: { value: 1 },
      uContrast: { value: 1 },
      uVignette: { value: 0 },
      uShadowTint: { value: new THREE.Vector3(1, 1, 1) },
      uHighlightTint: { value: new THREE.Vector3(1, 1, 1) },
      uTilt: { value: 0 },
      uFocusBand: { value: 0.24 },
      uAberration: { value: 0 },
      uDanger: { value: 0 },
      uTime: { value: 0 },
      uGrain: { value: 0 },
    });
    this.fxaa = fullscreenMaterial(FXAA_FRAGMENT, {
      tColor: { value: this.ldrTarget.texture },
      uTexel: { value: new THREE.Vector2() },
      uTime: { value: 0 },
      uGrain: { value: 0 },
    });
    this.configure();
  }

  /** Size of the drawing buffer, in device pixels. */
  setSize(width: number, height: number) {
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));
    if (width === this.width && height === this.height) return;
    this.width = width;
    this.height = height;
    this.sceneTarget.setSize(width, height);
    this.ldrTarget.setSize(width, height);
    const hw = Math.max(1, width >> 1);
    const hh = Math.max(1, height >> 1);
    for (const t of this.aoTargets) t.setSize(hw, hh);

    // The bloom pyramid: halve until it's a handful of pixels across.
    for (const t of this.bloomTargets) t.dispose();
    this.bloomTargets.length = 0;
    let w = hw;
    let h = hh;
    while (this.bloomTargets.length < MAX_BLOOM_LEVELS && Math.min(w, h) >= 6) {
      this.bloomTargets.push(
        new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false }),
      );
      w = Math.max(1, w >> 1);
      h = Math.max(1, h >> 1);
    }
    this.composite.uniforms.uSceneTexel!.value.set(1 / width, 1 / height);
    this.composite.uniforms.uAoSize!.value.set(hw, hh);
    this.ao.uniforms.uDepthTexel!.value.set(1 / width, 1 / height);
    this.fxaa.uniforms.uTexel!.value.set(1 / width, 1 / height);
  }

  setLevel(level: PostLevel) {
    if (level === this.level) return;
    this.level = level;
    this.configure();
  }

  /** Compile the composite for exactly the effects in use, so cheaper levels pay for nothing. */
  private configure() {
    const full = this.level === 2;
    const defines: Record<string, string> = { USE_FXAA: '' };
    if (full) defines.USE_AO = '';
    if (full && this.lens.tilt) defines.USE_TILT_SHIFT = '';
    if (full && this.lens.aberration) defines.USE_ABERRATION = '';
    this.composite.defines = defines;
    this.composite.needsUpdate = true;
  }

  private pass(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.triangle.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.triangle, this.camera);
  }

  /**
   * Draw `scene` through the chain to the screen. `danger` (0..1) pulses the edge of the
   * screen red.
   */
  render(
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera | THREE.OrthographicCamera,
    look: PostLook,
    time: number,
    danger = 0,
  ) {
    const r = this.renderer;
    const lens = { tilt: look.tilt > 0, aberration: look.aberration > 0 };
    if (lens.tilt !== this.lens.tilt || lens.aberration !== this.lens.aberration) {
      this.lens = lens;
      this.configure();
    }

    r.setRenderTarget(this.sceneTarget);
    r.render(scene, camera);

    const full = this.level === 2;
    if (full) {
      const [a, b] = this.aoTargets;
      const u = this.ao.uniforms;
      u.uProj!.value.copy(camera.projectionMatrix);
      u.uProjInv!.value.copy(camera.projectionMatrixInverse);
      u.uRadius!.value = look.aoRadius;
      u.uFar!.value = camera.far;
      this.pass(this.ao, a);
      const blur = this.aoBlur.uniforms;
      blur.uFar!.value = camera.far;
      blur.uSlope!.value = camera instanceof THREE.PerspectiveCamera ? 0.04 : 0;
      blur.tAo!.value = a.texture;
      blur.uStep!.value.set(1 / a.width, 0);
      this.pass(this.aoBlur, b);
      blur.tAo!.value = b.texture;
      blur.uStep!.value.set(0, 1 / a.height);
      this.pass(this.aoBlur, a);
    }

    // Bloom: down the pyramid, then back up, adding each level onto the one above.
    const levels = this.bloomTargets;
    const count = full ? levels.length : Math.min(levels.length, 4);
    let source: THREE.WebGLRenderTarget = this.sceneTarget;
    for (let i = 0; i < count; i++) {
      const material = i === 0 ? this.bloomPrefilter : this.bloomDown;
      const u = material.uniforms;
      u.tSource!.value = source.texture;
      u.uTexel!.value.set(1 / source.width, 1 / source.height);
      u.uThreshold!.value = look.bloomThreshold;
      this.pass(material, levels[i]!);
      source = levels[i]!;
    }
    r.autoClear = false;
    for (let i = count - 2; i >= 0; i--) {
      const from = levels[i + 1]!;
      const u = this.bloomUp.uniforms;
      u.tSource!.value = from.texture;
      u.uTexel!.value.set(1 / from.width, 1 / from.height);
      this.pass(this.bloomUp, levels[i]!);
    }
    r.autoClear = true;

    const c = this.composite.uniforms;
    c.tBloom!.value = levels[0]?.texture ?? null;
    c.uProjInv!.value.copy(camera.projectionMatrixInverse);
    c.uFar!.value = camera.far;
    c.uExposure!.value = look.exposure;
    // Each level adds its share, so the sum is normalised by how many there are.
    c.uBloom!.value = count > 0 ? look.bloom / count : 0;
    c.uAo!.value = look.ao;
    c.uSaturation!.value = look.saturation;
    c.uContrast!.value = look.contrast;
    c.uVignette!.value = look.vignette;
    c.uShadowTint!.value.fromArray(look.shadowTint);
    c.uHighlightTint!.value.fromArray(look.highlightTint);
    c.uTilt!.value = look.tilt * (this.height / 800);
    c.uAberration!.value = look.aberration;
    c.uDanger!.value = danger;
    this.pass(this.composite, this.ldrTarget);

    const f = this.fxaa.uniforms;
    f.uTime!.value = time;
    f.uGrain!.value = look.grain;
    this.pass(this.fxaa, null);
  }

  dispose() {
    this.sceneTarget.depthTexture?.dispose();
    for (const t of [this.sceneTarget, this.ldrTarget, ...this.aoTargets, ...this.bloomTargets]) {
      t.dispose();
    }
    for (const m of [
      this.ao,
      this.aoBlur,
      this.bloomPrefilter,
      this.bloomDown,
      this.bloomUp,
      this.composite,
      this.fxaa,
    ]) {
      m.dispose();
    }
    this.triangle.geometry.dispose();
  }
}
