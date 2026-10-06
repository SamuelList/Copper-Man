import * as THREE from 'three';

/**
 * Map-space lighting shared by every lit material: room light levels (lightMap) and the
 * player's fog of war (fogMap) are both textures laid over the floor plan, sampled by world
 * XZ in the fragment shader. One patch, so walls, props and characters all darken together.
 */
export interface WorldShading {
  uFogMap: { value: THREE.Texture | null };
  uLightMap: { value: THREE.Texture | null };
  uMapSize: { value: THREE.Vector2 };
  uFogOn: { value: number };
}

export function createWorldShading(cols: number, rows: number): WorldShading {
  return {
    uFogMap: { value: null },
    uLightMap: { value: null },
    uMapSize: { value: new THREE.Vector2(cols, rows) },
    uFogOn: { value: 1 },
  };
}

const VERTEX_DECL = /* glsl */ `
varying vec2 vMapPos;
varying vec2 vMapNormal;
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
vMapPos = copperWorld.xz;
vMapNormal = normalize( mat3( modelMatrix ) * copperNormal ).xz;
`;

const FRAGMENT_DECL = /* glsl */ `
uniform sampler2D uFogMap;
uniform sampler2D uLightMap;
uniform vec2 uMapSize;
uniform float uFogOn;
varying vec2 vMapPos;
varying vec2 vMapNormal;
`;

const FRAGMENT_BODY = /* glsl */ `
#include <opaque_fragment>
// Nudge samples off vertical faces into the room they face, so each side of a wall picks up
// its own room's light and visibility.
vec2 copperSample = vMapPos + vMapNormal * 0.55;
vec2 copperUv = vec2( copperSample.x / uMapSize.x, 1.0 - copperSample.y / uMapSize.y );
// Beyond the map edge (the grass verge) is plain daylight, never fogged.
float copperInside = step( 0.0, copperUv.x ) * step( copperUv.x, 1.0 ) * step( 0.0, copperUv.y ) * step( copperUv.y, 1.0 );
float copperLight = mix( 1.0, texture2D( uLightMap, copperUv ).r, copperInside );
float copperSeen = mix( 1.0, texture2D( uFogMap, copperUv ).r, uFogOn * copperInside );
// Out of sight: darker and washed out, like a half-remembered room.
vec3 copperGrey = vec3( dot( gl_FragColor.rgb, vec3( 0.299, 0.587, 0.114 ) ) );
gl_FragColor.rgb = mix( copperGrey, gl_FragColor.rgb, mix( 0.35, 1.0, copperSeen ) );
gl_FragColor.rgb *= mix( 0.16, 1.0, copperLight ) * mix( 0.13, 1.0, copperSeen );
`;

/** Apply map-space light + fog of war to a lit (Standard/Lambert/Phong) material. */
export function shadeWithWorld<T extends THREE.Material>(material: T, shading: WorldShading): T {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, shading);
    shader.vertexShader =
      VERTEX_DECL + shader.vertexShader.replace('#include <project_vertex>', VERTEX_BODY);
    shader.fragmentShader =
      FRAGMENT_DECL + shader.fragmentShader.replace('#include <opaque_fragment>', FRAGMENT_BODY);
  };
  material.customProgramCacheKey = () => 'copper-world-shading';
  return material;
}

export interface MaterialOptions {
  roughness?: number;
  metalness?: number;
  emissive?: number;
  /** Faceted low-poly look (default). Turn off for smooth curved surfaces like porcelain. */
  flat?: boolean;
  /** Below 1 makes the material see-through (glass). */
  opacity?: number;
  /** A texture painted onto the surface (labels, chalkboards, posters). */
  map?: THREE.Texture;
}

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
   * A white material that takes its colour from vertex colours. The static batcher folds every
   * plain kit material with similar roughness/metalness into one of these, so a chunk of the
   * school draws in a handful of calls instead of one per colour.
   */
  vertexColored(roughness: number, metalness: number, flat: boolean) {
    const key = `vc:${roughness}:${metalness}:${flat}`;
    let m = this.cache.get(key);
    if (!m) {
      m = shadeWithWorld(
        new THREE.MeshStandardMaterial({
          color: 0xffffff,
          vertexColors: true,
          roughness,
          metalness,
          flatShading: flat,
        }),
        this.shading,
      );
      this.cache.set(key, m);
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
