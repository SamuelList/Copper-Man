import { roomAt } from '@core/level/asciiLevel';
import type { ShiftSession } from '@core/session/ShiftSession';
import * as THREE from 'three';
import {
  doorSpill,
  glowSources,
  lampLayout,
  tileFill,
  type Lamp,
  type LightSource,
} from './lighting';
import { FULLSCREEN_VERTEX } from './post/shaders';

/** Light map texels per tile. */
const RES = 8;

/** Which tiles stop light, shared by the pool and bleed shaders. */
const SOLID_TILES = /* glsl */ `
uniform sampler2D tSolid;
uniform vec2 uMapSize;
bool solid( vec2 tile ) {
  if ( tile.x < 0.0 || tile.y < 0.0 || tile.x >= uMapSize.x || tile.y >= uMapSize.y ) return true;
  return texture2D( tSolid, ( tile + 0.5 ) / uMapSize ).r > 0.5;
}
`;

const POOL_VERTEX = /* glsl */ `
attribute vec2 aCenter;
attribute vec3 aColor;
attribute float aRadius;
attribute vec3 aCone;
uniform vec2 uMapSize;
varying vec2 vPos;
varying vec2 vCenter;
varying vec3 vColor;
varying float vRadius;
varying vec3 vCone;
void main() {
  vPos = position.xy;
  vCenter = aCenter;
  vColor = aColor;
  vRadius = aRadius;
  vCone = aCone;
  gl_Position = vec4( position.xy / uMapSize * 2.0 - 1.0, 0.0, 1.0 );
}
`;

/**
 * One light's pool: brightest at the source, easing to nothing at its radius, and only where
 * the source can be seen. Sight is tested per texel by walking the tile grid from the texel to
 * the source (a grid traversal, as core's ray casts do), four times to points spread around
 * the source, so shadows have a soft edge like those of a real lamp.
 */
const POOL_FRAGMENT = /* glsl */ `
${SOLID_TILES}
uniform float uInvScale;
varying vec2 vPos;
varying vec2 vCenter;
varying vec3 vColor;
varying float vRadius;
varying vec3 vCone;

float visible( vec2 from, vec2 to ) {
  vec2 delta = to - from;
  float len = length( delta );
  if ( len < 1e-4 ) return 1.0;
  vec2 dir = delta / len;
  vec2 safe = vec2( abs( dir.x ) < 1e-6 ? 1e-6 : dir.x, abs( dir.y ) < 1e-6 ? 1e-6 : dir.y );
  vec2 tile = floor( from );
  vec2 stride = sign( safe );
  vec2 tDelta = abs( 1.0 / safe );
  vec2 tMax = ( tile + max( stride, 0.0 ) - from ) / safe;
  for ( int i = 0; i < 20; i ++ ) {
    if ( min( tMax.x, tMax.y ) >= len ) return 1.0;
    if ( tMax.x < tMax.y ) {
      tile.x += stride.x;
      tMax.x += tDelta.x;
    } else {
      tile.y += stride.y;
      tMax.y += tDelta.y;
    }
    if ( solid( tile ) ) return 0.0;
  }
  return 1.0;
}

void main() {
  vec2 toTexel = vPos - vCenter;
  float d = length( toTexel ) / vRadius;
  float falloff = max( 1.0 - d * d, 0.0 );
  falloff *= falloff;
  // A cone (light through a doorway): fades out toward its edges.
  if ( vCone.z > -1.5 ) {
    float along = dot( toTexel / max( length( toTexel ), 1e-4 ), vCone.xy );
    falloff *= smoothstep( vCone.z, vCone.z + 0.35, along );
  }
  if ( falloff <= 0.0 ) discard;
  float spread = min( 0.3, vRadius * 0.08 );
  float lit = visible( vPos, vCenter + vec2( spread, spread * 0.4 ) )
    + visible( vPos, vCenter + vec2( -spread * 0.4, spread ) )
    + visible( vPos, vCenter + vec2( -spread, -spread * 0.4 ) )
    + visible( vPos, vCenter + vec2( spread * 0.4, -spread ) );
  // Alpha is left alone: it holds how open to the sky each tile is (see the fill).
  gl_FragColor = vec4( vColor * falloff * lit * 0.25 * uInvScale, 0.0 );
}
`;

/**
 * The even part of each room's light: one texel of `tFill` per tile. Its alpha says whether the
 * tile is open to the sky.
 */
const FILL_FRAGMENT = /* glsl */ `
uniform sampler2D tFill;
uniform float uInvScale;
varying vec2 vUv;
void main() {
  vec4 fill = texture2D( tFill, vUv );
  gl_FragColor = vec4( fill.rgb * uInvScale, fill.a );
}
`;

/**
 * Tiles light can't enter (walls, the van, locked doors) take the light of the open tiles
 * beside them, so wall tops and the faces of doors aren't left black.
 */
const BLEED_FRAGMENT = /* glsl */ `
${SOLID_TILES}
uniform sampler2D tLight;
uniform float uScale;
varying vec2 vUv;

/** Where pools pile up (hallway crossings), ease off instead of burning out. */
vec3 rollOff( vec3 light ) {
  float peak = max( light.r, max( light.g, light.b ) ) * uScale;
  if ( peak <= 1.0 ) return light;
  float over = peak - 1.0;
  return light * ( 1.0 + over / ( 1.0 + over * 1.6 ) ) / peak;
}

void main() {
  vec2 pos = vUv * uMapSize;
  vec2 tile = floor( pos );
  if ( ! solid( tile ) ) {
    vec4 light = texture2D( tLight, vUv );
    gl_FragColor = vec4( rollOff( light.rgb ), light.a );
    return;
  }
  vec4 sum = vec4( 0.0 );
  float weight = 0.0;
  for ( int j = -1; j <= 1; j ++ ) {
    for ( int i = -1; i <= 1; i ++ ) {
      vec2 neighbour = tile + vec2( float( i ), float( j ) );
      if ( ( i == 0 && j == 0 ) || solid( neighbour ) ) continue;
      // The nearest point of that tile, so light varies smoothly along the wall.
      vec2 nearest = clamp( pos, neighbour + 0.07, neighbour + 0.93 );
      float w = ( i == 0 || j == 0 ) ? 1.0 : 0.3;
      sum += texture2D( tLight, nearest / uMapSize ) * w;
      weight += w;
    }
  }
  gl_FragColor = weight > 0.0 ? vec4( rollOff( sum.rgb / weight ), sum.a / weight ) : vec4( 0.0 );
}
`;

/**
 * Bakes the school's light into a texture over the floor plan. Every room's even fill, then
 * every lamp, glowing prop and lit doorway as a pool that stops at walls, are added together
 * on the GPU. It's baked once per shift and again whenever a door is unlocked, so opening a
 * door lets the hallway's light in.
 */
export class LightBaker {
  /** Ceiling lamps, for hanging fittings. */
  readonly lamps: Lamp[];
  /** What the light map's values must be multiplied by (see `WorldShading.uLightScale`). */
  readonly scale: number;
  private readonly accumulate: THREE.WebGLRenderTarget;
  private readonly baked: THREE.WebGLRenderTarget;
  private readonly solid: THREE.DataTexture;
  private readonly fill: THREE.DataTexture;
  private readonly fillMaterial: THREE.ShaderMaterial;
  private readonly poolMaterial: THREE.ShaderMaterial;
  private readonly bleedMaterial: THREE.ShaderMaterial;
  private readonly pools = new THREE.Mesh();
  private readonly screen: THREE.Mesh;
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly fixed: LightSource[];

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly session: ShiftSession,
  ) {
    const { level } = session;
    const size = new THREE.Vector2(level.cols, level.rows);
    // Half-float where the device can render to it; otherwise 8 bits with headroom.
    const float =
      renderer.extensions.has('EXT_color_buffer_float') ||
      renderer.extensions.has('EXT_color_buffer_half_float');
    this.scale = float ? 1 : 2;
    const target = () =>
      new THREE.WebGLRenderTarget(level.cols * RES, level.rows * RES, {
        type: float ? THREE.HalfFloatType : THREE.UnsignedByteType,
        depthBuffer: false,
      });
    this.accumulate = target();
    this.baked = target();

    const perTile = (format: THREE.PixelFormat, channels: number) => {
      const texture = new THREE.DataTexture(
        new Uint8Array(level.cols * level.rows * channels),
        level.cols,
        level.rows,
        format,
      );
      texture.unpackAlignment = 1;
      return texture;
    };
    this.solid = perTile(THREE.RedFormat, 1);
    this.fill = perTile(THREE.RGBAFormat, 4);

    const invScale = { value: 1 / this.scale };
    const tiles = { tSolid: { value: this.solid }, uMapSize: { value: size } };
    const flat = { depthTest: false, depthWrite: false };
    this.fillMaterial = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: FILL_FRAGMENT,
      uniforms: { tFill: { value: this.fill }, uInvScale: invScale },
      ...flat,
    });
    this.poolMaterial = new THREE.ShaderMaterial({
      vertexShader: POOL_VERTEX,
      fragmentShader: POOL_FRAGMENT,
      uniforms: { ...tiles, uInvScale: invScale },
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      transparent: true,
      side: THREE.DoubleSide,
      ...flat,
    });
    this.bleedMaterial = new THREE.ShaderMaterial({
      vertexShader: FULLSCREEN_VERTEX,
      fragmentShader: BLEED_FRAGMENT,
      uniforms: {
        ...tiles,
        tLight: { value: this.accumulate.texture },
        uScale: { value: this.scale },
      },
      ...flat,
    });
    this.pools.material = this.poolMaterial;
    this.pools.frustumCulled = false;
    const triangle = new THREE.BufferGeometry();
    triangle.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3),
    );
    this.screen = new THREE.Mesh(triangle);
    this.screen.frustumCulled = false;

    this.lamps = lampLayout(level);
    this.fixed = [...this.lamps, ...glowSources(level)];
    this.bake();
  }

  get texture(): THREE.Texture {
    return this.baked.texture;
  }

  /** Redraw the light map for the school as it is now (which doors are open). */
  bake() {
    const { level, grid } = this.session;
    const solid = this.solid.image.data as Uint8Array;
    const fill = this.fill.image.data as Uint8Array;
    for (let row = 0; row < level.rows; row++) {
      for (let col = 0; col < level.cols; col++) {
        const i = row * level.cols + col;
        const blocked = grid.isOpaque(col, row);
        solid[i] = blocked ? 255 : 0;
        const colour = blocked ? [0, 0, 0] : tileFill(level, col, row);
        for (let c = 0; c < 3; c++) fill[i * 4 + c] = Math.round(Math.min(1, colour[c]!) * 255);
        // Open to the sky, or under the roof.
        fill[i * 4 + 3] = roomAt(level, col, row)?.kind === 'exterior' ? 255 : 0;
      }
    }
    this.solid.needsUpdate = true;
    this.fill.needsUpdate = true;

    // One square per light, big enough for its pool.
    const sources = [...this.fixed, ...doorSpill(level, (col, row) => !grid.isOpaque(col, row))];
    const positions: number[] = [];
    const centers: number[] = [];
    const colors: number[] = [];
    const radii: number[] = [];
    const cones: number[] = [];
    for (const s of sources) {
      const cone = s.cone
        ? [Math.cos(s.cone.facing), Math.sin(s.cone.facing), Math.cos(s.cone.fov / 2)]
        : [0, 0, -2];
      for (const [dx, dy] of [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, -1],
        [1, 1],
        [-1, 1],
      ] as const) {
        positions.push(s.x + dx * s.radius, s.y + dy * s.radius, 0);
        centers.push(s.x, s.y);
        colors.push(s.color[0], s.color[1], s.color[2]);
        radii.push(s.radius);
        cones.push(cone[0]!, cone[1]!, cone[2]!);
      }
    }
    this.pools.geometry.dispose();
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('aCenter', new THREE.Float32BufferAttribute(centers, 2));
    geometry.setAttribute('aColor', new THREE.Float32BufferAttribute(colors, 3));
    geometry.setAttribute('aRadius', new THREE.Float32BufferAttribute(radii, 1));
    geometry.setAttribute('aCone', new THREE.Float32BufferAttribute(cones, 3));
    this.pools.geometry = geometry;

    const r = this.renderer;
    const target = r.getRenderTarget();
    const autoClear = r.autoClear;
    r.setRenderTarget(this.accumulate);
    r.autoClear = true;
    this.screen.material = this.fillMaterial;
    r.render(this.screen, this.camera);
    r.autoClear = false;
    r.render(this.pools, this.camera);
    r.autoClear = true;
    r.setRenderTarget(this.baked);
    this.screen.material = this.bleedMaterial;
    r.render(this.screen, this.camera);
    r.autoClear = autoClear;
    r.setRenderTarget(target);
  }

  dispose() {
    this.accumulate.dispose();
    this.baked.dispose();
    this.solid.dispose();
    this.fill.dispose();
    this.fillMaterial.dispose();
    this.poolMaterial.dispose();
    this.bleedMaterial.dispose();
    this.pools.geometry.dispose();
    this.screen.geometry.dispose();
  }
}
