import type { LevelDef } from '@core/level/types';
import * as THREE from 'three';
import { batchStatic } from './batching';
import type { MaterialKit } from './materials';
import { buildTree } from './models';
import { PALETTE } from './palette';

/**
 * What lies beyond the school when you're standing in it: a sky, ground out to the horizon and
 * trees. The top-down view is a tabletop diorama that ends at its verge, so this is only shown
 * in first person.
 */

/** The haze the far ground fades into (also the fog colour). */
export const HORIZON = new THREE.Color(0.62, 0.72, 0.82);

const SKY_VERTEX = /* glsl */ `
varying vec3 vDirection;
void main() {
  vDirection = position;
  // Turn with the camera but never move: the sky is infinitely far away.
  vec4 clip = projectionMatrix * vec4( mat3( viewMatrix ) * position, 1.0 );
  gl_Position = clip.xyww;
}
`;

/**
 * An afternoon sky: a gradient from haze at the horizon to deep blue overhead, a sun with a
 * warm glow around it, and slow drifting clouds made from layered noise.
 */
const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uSun;
uniform vec3 uHorizon;
uniform float uTime;
varying vec3 vDirection;

float hash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}
float noise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( hash( i ), hash( i + vec2( 1.0, 0.0 ) ), f.x ),
    mix( hash( i + vec2( 0.0, 1.0 ) ), hash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
float fbm( vec2 p ) {
  float sum = 0.0;
  float amplitude = 0.5;
  for ( int i = 0; i < 5; i ++ ) {
    sum += noise( p ) * amplitude;
    p = p * 2.03 + vec2( 17.0, 9.0 );
    amplitude *= 0.5;
  }
  return sum;
}

void main() {
  vec3 dir = normalize( vDirection );
  float up = max( dir.y, 0.0 );
  vec3 zenith = vec3( 0.13, 0.31, 0.68 );
  vec3 color = mix( uHorizon, zenith, pow( up, 0.5 ) );

  float toSun = max( dot( dir, uSun ), 0.0 );
  color += vec3( 1.0, 0.72, 0.42 ) * pow( toSun, 6.0 ) * 0.28;
  color += vec3( 1.0, 0.9, 0.72 ) * pow( toSun, 90.0 ) * 0.9;

  // Clouds on a flat layer overhead, thinning out toward the horizon.
  vec2 plane = dir.xz / ( dir.y + 0.16 );
  float cover = fbm( plane * 1.1 + uTime * vec2( 0.008, 0.003 ) );
  float cloud = smoothstep( 0.46, 0.74, cover ) * smoothstep( 0.02, 0.22, dir.y );
  float lit = fbm( plane * 1.1 + uSun.xz * 0.25 + uTime * vec2( 0.008, 0.003 ) );
  vec3 cloudColor = mix( vec3( 0.62, 0.68, 0.78 ), vec3( 1.25, 1.18, 1.08 ), smoothstep( 0.35, 0.7, cover - lit + 0.5 ) );
  color = mix( color, cloudColor, cloud * 0.88 );

  // The sun itself: far brighter than the sky, so it blooms.
  color += vec3( 1.0, 0.93, 0.78 ) * smoothstep( 0.9994, 0.9998, dot( dir, uSun ) ) * 14.0 * ( 1.0 - cloud );
  // Below the horizon is haze.
  color = mix( uHorizon * 0.92, color, smoothstep( -0.06, 0.03, dir.y ) );
  gl_FragColor = vec4( color, 1.0 );
}
`;

export interface Outdoors {
  group: THREE.Group;
  /** The land out to the horizon (it lies just under the floor's level). */
  ground: THREE.Object3D;
  /** Drift the clouds. */
  update(time: number): void;
  dispose(): void;
}

export function buildOutdoors(
  level: LevelDef,
  kit: MaterialKit,
  sunDirection: THREE.Vector3,
): Outdoors {
  const group = new THREE.Group();
  group.name = 'outdoors';

  const skyMaterial = new THREE.ShaderMaterial({
    vertexShader: SKY_VERTEX,
    fragmentShader: SKY_FRAGMENT,
    uniforms: {
      uSun: { value: sunDirection.clone().normalize() },
      uHorizon: { value: HORIZON },
      uTime: { value: 0 },
    },
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), skyMaterial);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  group.add(sky);

  // Ground to the horizon, just under the diorama's verge.
  const { cols, rows } = level;
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    kit.get(PALETTE.grass, { roughness: 1 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(cols / 2, -0.035, rows / 2);
  ground.receiveShadow = true;
  group.add(ground);

  // Trees scattered around the grounds, denser further out where they hide the horizon.
  const trees: THREE.Object3D[] = [];
  const random = (i: number, salt: number) => {
    const v = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const spread = 55;
  const clear = 5;
  for (let i = 0; i < 150; i++) {
    const x = -spread + random(i, 1) * (cols + spread * 2);
    const z = -spread + random(i, 2) * (rows + spread * 2);
    // Not on the school or its grounds.
    if (x > -clear && x < cols + clear && z > -clear && z < rows + clear) continue;
    const tree = buildTree(kit, 1.6 + random(i, 3) * 2.2, random(i, 4));
    tree.position.set(x, 0, z);
    trees.push(tree);
  }
  group.add(batchStatic(trees, kit, 40));

  return {
    group,
    ground,
    update(time) {
      skyMaterial.uniforms.uTime!.value = time;
    },
    dispose() {
      skyMaterial.dispose();
      sky.geometry.dispose();
    },
  };
}
