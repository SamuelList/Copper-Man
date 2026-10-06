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
float copperLight = texture2D( uLightMap, copperUv ).r;
float copperSeen = mix( 1.0, texture2D( uFogMap, copperUv ).r, uFogOn );
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

/**
 * Cache of flat-shaded low-poly materials keyed by colour, all wired to the world shading.
 * Sharing materials keeps draw state small and lets the whole scene dispose in one pass.
 */
export class MaterialKit {
  private cache = new Map<string, THREE.MeshStandardMaterial>();

  constructor(readonly shading: WorldShading) {}

  get(color: number, opts: { roughness?: number; metalness?: number; emissive?: number } = {}) {
    const key = `${color}:${opts.roughness ?? 0.85}:${opts.metalness ?? 0}:${opts.emissive ?? 0}`;
    let m = this.cache.get(key);
    if (!m) {
      m = shadeWithWorld(
        new THREE.MeshStandardMaterial({
          color,
          roughness: opts.roughness ?? 0.85,
          metalness: opts.metalness ?? 0,
          emissive: opts.emissive ?? 0x000000,
          flatShading: true,
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
