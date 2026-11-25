import * as THREE from 'three';

/**
 * Map-space lighting shared by every lit material: baked room light (lightMap) and the
 * player's fog of war (fogMap) are both textures laid over the floor plan, sampled by world
 * XZ in the fragment shader. One patch, so walls, props and characters all darken together.
 */
export interface WorldShading {
  uFogMap: { value: THREE.Texture | null };
  /**
   * Coloured light per point of the floor plan, baked by `LightBaker`. Alpha is how open to
   * the sky that point is (1 outdoors, 0 under the roof).
   */
  uLightMap: { value: THREE.Texture | null };
  /** The light map stores light divided by this, leaving headroom for pools under lamps. */
  uLightScale: { value: number };
  uMapSize: { value: THREE.Vector2 };
  /** 1 in the top-down view; 0 in first person, where what you see is simply what's there. */
  uFogOn: { value: number };
  /**
   * 1 in first person, where the school has its roof on and keeps most of the sun out of the
   * rooms; 0 for the top-down diorama, which is lit through its open top.
   */
  uRoofed: { value: number };
  /** Painted concrete-block relief for walls (see `wallDetailTexture`). */
  uWallDetail: { value: THREE.Texture | null };
}

export function createWorldShading(cols: number, rows: number): WorldShading {
  return {
    uFogMap: { value: null },
    uLightMap: { value: null },
    uLightScale: { value: 1 },
    uMapSize: { value: new THREE.Vector2(cols, rows) },
    uFogOn: { value: 1 },
    uRoofed: { value: 0 },
    uWallDetail: { value: null },
  };
}

/** How a material takes part in the world shading, beyond the defaults. */
export interface SurfaceOptions {
  /**
   * How far (tiles) a vertical face reaches into the room it faces to find its light and
   * visibility. Walls reach past their own tile so each side picks up its own room.
   */
  reach?: number;
  /** Painted concrete blocks on vertical faces. */
  blocks?: boolean;
  /**
   * Tile-sized blocks drawn as instances (the walls). Each instance says in `aJoined` which of
   * its sides are pressed against a neighbour that covers them (1: +x, 2: -x, 4: +z, 8: -z,
   * added up), and those faces aren't drawn.
   */
  joined?: boolean;
  /**
   * The finish comes with each vertex instead of the material: `aSurface` holds roughness,
   * metalness and whether the face is flat-shaded (0 or 1). Things with different finishes
   * can then share one material, and so one draw call (see `batching.ts`).
   */
  mixed?: boolean;
  /**
   * Share of the room's light the surface gives back whichever way it faces: light bounced off
   * the floor, which is all a ceiling ever gets.
   */
  bounce?: number;
  /** Extra uniforms and GLSL for a bespoke surface (the floor). */
  patch?: SurfacePatch;
}

export interface SurfacePatch {
  /** Distinguishes the compiled program from other patches. */
  key: string;
  uniforms: Record<string, THREE.IUniform>;
  /** Fragment shader declarations (uniforms, functions). */
  declarations: string;
  /**
   * Runs once normals are known and before lighting: may change `diffuseColor`,
   * `roughnessFactor` and the view-space `normal`. World position and normal are in
   * `vCopperPos` and `vCopperNormal`.
   */
  surface: string;
  /**
   * Runs after the room's light has been applied: may add to `outgoingLight` things that
   * arrive already lit (reflections).
   */
  light?: string;
}

const VERTEX_DECL = /* glsl */ `
varying vec3 vCopperPos;
varying vec3 vCopperNormal;
#ifdef COPPER_JOINED
  attribute float aJoined;
#endif
#ifdef COPPER_MIXED
  attribute vec4 aSurface;
  varying vec3 vCopperSurface;
#endif
`;

const VERTEX_BODY = /* glsl */ `
#include <project_vertex>
vec4 copperWorld = vec4( transformed, 1.0 );
vec3 copperNormal = objectNormal;
#ifdef USE_INSTANCING
  copperWorld = instanceMatrix * copperWorld;
  copperNormal = mat3( instanceMatrix ) * copperNormal;
#endif
copperWorld = modelMatrix * copperWorld;
vCopperPos = copperWorld.xyz;
vCopperNormal = normalize( mat3( modelMatrix ) * copperNormal );
#ifdef COPPER_MIXED
  vCopperSurface = aSurface.xyz;
#endif
#ifdef COPPER_JOINED
  // A side pressed against a neighbour can't be seen, but drawn it glints through the joint
  // wherever a pixel lands exactly on the seam. Collapse it off screen instead.
  float copperSide = normal.x > 0.5 ? 1.0 : normal.x < -0.5 ? 2.0 : normal.z > 0.5 ? 4.0 : normal.z < -0.5 ? 8.0 : 0.0;
  if ( copperSide > 0.0 && mod( floor( aJoined / copperSide ), 2.0 ) > 0.5 ) {
    gl_Position = vec4( 2.0, 2.0, 2.0, 1.0 );
  }
#endif
`;

const FRAGMENT_DECL = /* glsl */ `
uniform sampler2D uFogMap;
uniform sampler2D uLightMap;
uniform float uLightScale;
uniform vec2 uMapSize;
uniform float uFogOn;
uniform float uRoofed;
varying vec3 vCopperPos;
varying vec3 vCopperNormal;
#ifdef COPPER_BLOCKS
  uniform sampler2D uWallDetail;
#endif
#ifdef COPPER_MIXED
  varying vec3 vCopperSurface;
#endif
`;

/** Surface detail: runs after `normal_fragment_maps`, before the lighting is accumulated. */
const SURFACE_BODY = /* glsl */ `
#include <normal_fragment_maps>
#ifdef COPPER_MIXED
  // Each vertex brings its own finish (the material's own roughness and metalness are 1).
  roughnessFactor *= vCopperSurface.x;
  metalnessFactor *= vCopperSurface.y;
  // Faceted pieces take the true normal of the triangle, as three's flat shading does. (Both
  // of them: the unperturbed one is what highlights are widened by where a surface curves, and
  // a flat face doesn't.)
  if ( vCopperSurface.z > 0.5 ) {
    normal = normalize( cross( dFdx( vViewPosition ), dFdy( vViewPosition ) ) );
    nonPerturbedNormal = normal;
  }
#endif
#ifdef COPPER_BLOCKS
  // Painted concrete blocks, laid out in world space so they hold still while a wall sinks.
  if ( abs( vCopperNormal.y ) < 0.5 ) {
    vec3 copperAlong = abs( vCopperNormal.x ) > 0.5 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 1.0, 0.0, 0.0 );
    vec4 copperBlock = texture2D( uWallDetail, vec2( dot( vCopperPos, copperAlong ), vCopperPos.y ) * vec2( 2.0, 1.875 ) );
    diffuseColor.rgb *= copperBlock.r;
    roughnessFactor = clamp( roughnessFactor + ( copperBlock.a - 0.5 ) * 0.5, 0.05, 1.0 );
    vec2 copperSlope = ( copperBlock.gb * 2.0 - 1.0 ) * 0.9;
    normal = normalize( normal + ( viewMatrix * vec4( copperAlong * copperSlope.x + vec3( 0.0, copperSlope.y, 0.0 ), 0.0 ) ).xyz );
  }
#endif
COPPER_SURFACE
`;

const FRAGMENT_BODY = /* glsl */ `
// Nudge samples off vertical faces into the room they face, so each side of a wall picks up
// its own room's light and visibility.
vec2 copperSample = vCopperPos.xz + vCopperNormal.xz * COPPER_REACH;
vec2 copperUv = copperSample / uMapSize;
// Beyond the map edge (the grass verge) is plain daylight, never fogged.
float copperInside = step( 0.0, copperUv.x ) * step( copperUv.x, 1.0 ) * step( 0.0, copperUv.y ) * step( copperUv.y, 1.0 );
vec4 copperBaked = texture2D( uLightMap, copperUv );
vec3 copperLight = mix( vec3( 1.0 ), copperBaked.rgb * uLightScale, copperInside );
// Under a roof, most of the sun (and its shadows) stays outside.
float copperShade = uRoofed * copperInside * ( 1.0 - copperBaked.a ) * 0.62;
outgoingLight -= ( reflectedLight.directDiffuse + reflectedLight.directSpecular ) * copperShade;
// Room light dims what a surface reflects, never what it gives off: screens, fire and lamps
// keep glowing in the dark.
outgoingLight = ( outgoingLight - totalEmissiveRadiance ) * copperLight + totalEmissiveRadiance;
#ifdef COPPER_BOUNCE
  outgoingLight += diffuseColor.rgb * copperLight * COPPER_BOUNCE;
#endif
COPPER_LIGHT
#include <opaque_fragment>
// Fog: 0 never seen, 0.5 remembered, 1 in sight right now.
float copperFog = mix( 1.0, texture2D( uFogMap, vec2( copperUv.x, 1.0 - copperUv.y ) ).r, uFogOn * copperInside );
float copperSeen = smoothstep( 0.55, 0.95, copperFog );
float copperKnown = smoothstep( 0.05, 0.4, copperFog );
// Out of sight: darker and washed out, like a half-remembered room. Never seen: black.
vec3 copperGrey = vec3( dot( gl_FragColor.rgb, vec3( 0.299, 0.587, 0.114 ) ) );
gl_FragColor.rgb = mix( copperGrey, gl_FragColor.rgb, mix( 0.35, 1.0, copperSeen ) );
gl_FragColor.rgb *= mix( 0.13, 1.0, copperSeen ) * copperKnown;
`;

const glslFloat = (v: number) => (Number.isInteger(v) ? `${v}.0` : `${v}`);

/** Apply map-space light + fog of war to a lit (Standard/Lambert/Phong) material. */
export function shadeWithWorld<T extends THREE.Material>(
  material: T,
  shading: WorldShading,
  options: SurfaceOptions = {},
): T {
  const reach = options.reach ?? 0.25;
  const defines = [
    `#define COPPER_REACH ${glslFloat(reach)}`,
    options.blocks ? '#define COPPER_BLOCKS' : '',
    options.bounce ? `#define COPPER_BOUNCE ${glslFloat(options.bounce)}` : '',
    options.mixed ? '#define COPPER_MIXED' : '',
  ].join('\n');
  const patch = options.patch;
  const vertexDefines =
    (options.joined ? '#define COPPER_JOINED\n' : '') +
    (options.mixed ? '#define COPPER_MIXED\n' : '');
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shading, patch?.uniforms);
    shader.vertexShader =
      vertexDefines +
      VERTEX_DECL +
      shader.vertexShader.replace('#include <project_vertex>', VERTEX_BODY);
    shader.fragmentShader =
      `${defines}\n${FRAGMENT_DECL}\n${patch?.declarations ?? ''}\n` +
      shader.fragmentShader
        .replace(
          '#include <normal_fragment_maps>',
          SURFACE_BODY.replace('COPPER_SURFACE', patch?.surface ?? ''),
        )
        .replace(
          '#include <opaque_fragment>',
          FRAGMENT_BODY.replace('COPPER_LIGHT', patch?.light ?? ''),
        );
  };
  const flags = `${options.blocks ? 1 : 0}${options.joined ? 1 : 0}${options.mixed ? 1 : 0}`;
  const key = `copper:${reach}:${flags}:${options.bounce ?? 0}:${patch?.key ?? ''}`;
  material.customProgramCacheKey = () => key;
  return material;
}

/**
 * Markers drawn over the world (speech bubbles, vision cones, floor rings) clear the alpha
 * they cover; the post-processing reads alpha as "ambient occlusion applies here", so screen
 * shading never smudges them.
 */
export function asOverlay<T extends THREE.Material>(material: T): T {
  if (material.blending !== THREE.NormalBlending) return material;
  material.blending = THREE.CustomBlending;
  material.blendSrc = THREE.SrcAlphaFactor;
  material.blendDst = THREE.OneMinusSrcAlphaFactor;
  material.blendSrcAlpha = THREE.ZeroFactor;
  material.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  return material;
}

export interface MaterialOptions {
  roughness?: number;
  metalness?: number;
  /** Glow colour. Rendered brighter than white, so it blooms. */
  emissive?: number;
  /** Faceted low-poly look (default). Turn off for smooth curved surfaces like porcelain. */
  flat?: boolean;
  /** Below 1 makes the material see-through (glass). */
  opacity?: number;
  /** A texture painted onto the surface (labels, chalkboards, posters). */
  map?: THREE.Texture;
}

/** How much brighter than its colour a glowing material is drawn (it blooms above 1). */
export const GLOW = 2.4;

/**
 * Cache of low-poly materials keyed by their options, all wired to the world shading. Sharing
 * materials keeps draw state small, lets the world batch geometry per material, and lets the
 * whole scene dispose in one pass.
 */
export class MaterialKit {
  private cache = new Map<string, THREE.MeshStandardMaterial>();

  constructor(readonly shading: WorldShading) {}

  get(color: number, opts: MaterialOptions = {}) {
    const key = [
      color,
      opts.roughness ?? 0.85,
      opts.metalness ?? 0,
      opts.emissive ?? 0,
      opts.flat ?? true,
      opts.opacity ?? 1,
      opts.map?.uuid ?? '',
    ].join(':');
    let m = this.cache.get(key);
    if (!m) {
      const opacity = opts.opacity ?? 1;
      m = shadeWithWorld(
        new THREE.MeshStandardMaterial({
          color,
          roughness: opts.roughness ?? 0.85,
          metalness: opts.metalness ?? 0,
          emissive: opts.emissive ?? 0x000000,
          emissiveIntensity: GLOW,
          flatShading: opts.flat ?? true,
          transparent: opacity < 1,
          opacity,
          depthWrite: opacity >= 1,
          map: opts.map ?? null,
        }),
        this.shading,
      );
      m.userData.kit = { opacity, emissive: opts.emissive ?? 0, map: !!opts.map };
      this.cache.set(key, m);
    }
    return m;
  }

  /**
   * Painted block wall. Each face takes its light from the room it looks into, and carries the
   * block relief (which stays put in world space as walls sink out of the way). `joined` is for
   * instanced wall blocks that say which of their sides are covered (see `SurfaceOptions`).
   */
  wall(color: number, roughness: number, joined = false) {
    const key = `wall:${color}:${roughness}:${joined}`;
    let m = this.cache.get(key);
    if (!m) {
      m = shadeWithWorld(
        new THREE.MeshStandardMaterial({ color, roughness, flatShading: true }),
        this.shading,
        { reach: 0.55, blocks: true, joined },
      );
      this.cache.set(key, m);
    }
    return m;
  }

  /**
   * A white material that takes its colour and its finish from each vertex (`color` and
   * `aSurface`). The static batcher folds every plain kit material into this one, so a room's
   * worth of desks, lockers and pipes draws in a single call however they are painted.
   */
  mixed() {
    let m = this.cache.get('mixed');
    if (!m) {
      m = shadeWithWorld(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          vertexColors: true,
          roughness: 1,
          metalness: 1,
        }),
        this.shading,
        { mixed: true },
      );
      this.cache.set('mixed', m);
    }
    return m;
  }

  /** A private copy (for per-object opacity or tint changes). */
  unique(color: number, opts: { roughness?: number; metalness?: number } = {}) {
    return shadeWithWorld(
      new THREE.MeshStandardMaterial({
        color,
        roughness: opts.roughness ?? 0.85,
        metalness: opts.metalness ?? 0,
        flatShading: true,
      }),
      this.shading,
    );
  }

  dispose() {
    this.cache.forEach((m) => m.dispose());
    this.cache.clear();
  }
}
