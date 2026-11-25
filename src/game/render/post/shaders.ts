/**
 * GLSL for the post-processing chain (see PostFX). Every pass draws one screen-covering
 * triangle; `vUv` runs 0..1 across the target.
 */

export const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4( position.xy, 0.0, 1.0 );
}
`;

/**
 * View-space position from the depth buffer; works for perspective and orthographic cameras.
 * The position is taken at the centre of the depth texel that's actually read, not at `uv`
 * itself: half a texel's slip across a sloping floor is enough to make it shade itself in
 * stripes.
 */
const VIEW_POSITION = /* glsl */ `
uniform sampler2D tDepth;
uniform mat4 uProjInv;
uniform vec2 uDepthTexel;
vec3 viewPosition( vec2 uv ) {
  uv = ( floor( uv / uDepthTexel ) + 0.5 ) * uDepthTexel;
  float depth = texture2D( tDepth, uv ).x;
  vec4 view = uProjInv * vec4( uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0 );
  return view.xyz / view.w;
}
`;

/** Linear depth (0 at the eye, 1 at the far plane) in 16 bits, so blurs can respect edges. */
const DEPTH_PACKING = /* glsl */ `
vec2 packDepth( float z ) {
  float scaled = clamp( z, 0.0, 1.0 ) * 255.0;
  return vec2( floor( scaled ) / 255.0, fract( scaled ) );
}
float unpackDepth( vec2 packed ) {
  return packed.x + packed.y / 255.0;
}
`;

/**
 * Ambient occlusion from depth alone (Scalable Ambient Obscurance, McGuire et al. 2012): the
 * corners where walls meet floors and the gaps under furniture darken, which is most of what
 * makes flat-shaded low-poly geometry read as solid. Normals come from depth, so no extra
 * geometry pass. Output: r = light reaching the point, gb = packed depth.
 */
export const AO_FRAGMENT = /* glsl */ `
#define AO_SAMPLES 10
#define AO_TURNS 7.0
${VIEW_POSITION}
${DEPTH_PACKING}
uniform mat4 uProj;
uniform float uRadius;
uniform float uIntensity;
uniform float uBias;
uniform float uFar;
varying vec2 vUv;

float interleavedGradientNoise( vec2 p ) {
  return fract( 52.9829189 * fract( dot( p, vec2( 0.06711056, 0.00583715 ) ) ) );
}

void main() {
  float rawDepth = texture2D( tDepth, vUv ).x;
  if ( rawDepth >= 1.0 ) {
    gl_FragColor = vec4( 1.0, 1.0, 1.0, 1.0 );
    return;
  }
  vec3 p = viewPosition( vUv );

  // Face normal from neighbouring depths, taking whichever neighbour is on the same surface.
  vec3 right = viewPosition( vUv + vec2( uDepthTexel.x, 0.0 ) );
  vec3 left = viewPosition( vUv - vec2( uDepthTexel.x, 0.0 ) );
  vec3 up = viewPosition( vUv + vec2( 0.0, uDepthTexel.y ) );
  vec3 down = viewPosition( vUv - vec2( 0.0, uDepthTexel.y ) );
  vec3 dx = abs( right.z - p.z ) < abs( p.z - left.z ) ? right - p : p - left;
  vec3 dy = abs( up.z - p.z ) < abs( p.z - down.z ) ? up - p : p - down;
  vec3 n = normalize( cross( dx, dy ) );

  // The sampling disc's size on screen: fixed for an orthographic camera, shrinking with
  // distance for a perspective one. Up close it would cover half the screen, so it's capped,
  // and the world-space radius shrinks with it to keep the estimate consistent.
  float w = mix( -p.z, 1.0, uProj[ 3 ][ 3 ] );
  vec2 disc = uRadius * 0.5 * vec2( uProj[ 0 ][ 0 ], uProj[ 1 ][ 1 ] ) / max( w, 0.05 );
  float fit = min( 1.0, 0.06 / disc.x );
  disc *= fit;
  float radius = uRadius * fit;
  // Depth gets coarser with distance; allow for it so far floors don't shade themselves.
  float bias = uBias * ( 1.0 + w * 0.35 * ( 1.0 - uProj[ 3 ][ 3 ] ) );

  float spin = interleavedGradientNoise( gl_FragCoord.xy );
  float radius2 = radius * radius;
  float sum = 0.0;
  for ( int i = 0; i < AO_SAMPLES; i ++ ) {
    float t = ( float( i ) + 0.5 ) / float( AO_SAMPLES );
    float angle = 6.2831853 * ( spin + t * AO_TURNS );
    vec2 offset = vec2( cos( angle ), sin( angle ) ) * t * disc;
    vec3 v = viewPosition( vUv + offset ) - p;
    float vv = dot( v, v );
    float vn = dot( v, n );
    float falloff = max( radius2 - vv, 0.0 );
    sum += falloff * falloff * falloff * max( ( vn - bias ) / ( 0.01 + vv ), 0.0 );
  }
  // The estimate grows as the radius shrinks; scaling by the radius keeps its strength steady.
  float ao = max( 0.0, 1.0 - sum * uIntensity * radius * 5.0 / ( radius2 * radius2 * radius2 * float( AO_SAMPLES ) ) );
  gl_FragColor = vec4( ao, packDepth( -p.z / uFar ), 1.0 );
}
`;

/** One direction of a blur that stops at depth edges, smoothing the AO's sampling noise. */
export const AO_BLUR_FRAGMENT = /* glsl */ `
${DEPTH_PACKING}
uniform sampler2D tAo;
uniform vec2 uStep;
uniform float uFar;
/** Extra depth tolerance per unit of distance (0 for an orthographic camera). */
uniform float uSlope;
varying vec2 vUv;

void main() {
  vec4 center = texture2D( tAo, vUv );
  float z = unpackDepth( center.gb );
  float tolerance = ( 0.12 + uSlope * z * uFar ) / uFar;
  float sum = center.r * 0.227;
  float weight = 0.227;
  for ( int i = 1; i <= 4; i ++ ) {
    float g = i == 1 ? 0.194 : i == 2 ? 0.122 : i == 3 ? 0.054 : 0.016;
    for ( int side = -1; side <= 1; side += 2 ) {
      vec4 s = texture2D( tAo, vUv + uStep * float( i * side ) );
      float wz = max( 0.0, 1.0 - abs( unpackDepth( s.gb ) - z ) / tolerance );
      sum += s.r * g * wz;
      weight += g * wz;
    }
  }
  gl_FragColor = vec4( sum / weight, center.gb, 1.0 );
}
`;

/**
 * Bloom, first step: keep what's brighter than the threshold (with a soft knee) while halving
 * the resolution. The 13-tap filter (Jimenez, SIGGRAPH 2014) doesn't shimmer when small bright
 * things move, and weighting each tap by its brightness stops single hot pixels from flaring.
 */
export const BLOOM_DOWN_FRAGMENT = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uTexel;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;

vec3 tap( vec2 offset ) {
  vec3 c = min( texture2D( tSource, vUv + offset * uTexel ).rgb, vec3( 48.0 ) );
  #ifdef PREFILTER
    float brightness = max( c.r, max( c.g, c.b ) );
    float soft = clamp( brightness - uThreshold + uKnee, 0.0, 2.0 * uKnee );
    soft = soft * soft / ( 4.0 * uKnee + 1e-4 );
    c *= max( soft, brightness - uThreshold ) / max( brightness, 1e-4 );
  #endif
  return c;
}

#ifdef PREFILTER
  /** Average of four taps, each weighted down by its own brightness (Karis). */
  vec3 box( vec3 a, vec3 b, vec3 c, vec3 d ) {
    vec4 w = 1.0 / ( 1.0 + vec4( dot( a, vec3( 0.3 ) ), dot( b, vec3( 0.3 ) ), dot( c, vec3( 0.3 ) ), dot( d, vec3( 0.3 ) ) ) );
    return ( a * w.x + b * w.y + c * w.z + d * w.w ) / ( w.x + w.y + w.z + w.w );
  }
#else
  vec3 box( vec3 a, vec3 b, vec3 c, vec3 d ) {
    return ( a + b + c + d ) * 0.25;
  }
#endif

void main() {
  vec3 a = tap( vec2( -2.0, 2.0 ) );
  vec3 b = tap( vec2( 0.0, 2.0 ) );
  vec3 c = tap( vec2( 2.0, 2.0 ) );
  vec3 d = tap( vec2( -2.0, 0.0 ) );
  vec3 e = tap( vec2( 0.0, 0.0 ) );
  vec3 f = tap( vec2( 2.0, 0.0 ) );
  vec3 g = tap( vec2( -2.0, -2.0 ) );
  vec3 h = tap( vec2( 0.0, -2.0 ) );
  vec3 i = tap( vec2( 2.0, -2.0 ) );
  vec3 j = tap( vec2( -1.0, 1.0 ) );
  vec3 k = tap( vec2( 1.0, 1.0 ) );
  vec3 l = tap( vec2( -1.0, -1.0 ) );
  vec3 m = tap( vec2( 1.0, -1.0 ) );
  vec3 color = box( j, k, l, m ) * 0.5;
  color += ( box( a, b, d, e ) + box( b, c, e, f ) + box( d, e, g, h ) + box( e, f, h, i ) ) * 0.125;
  gl_FragColor = vec4( color, 1.0 );
}
`;

/** Bloom, second step: a 3x3 tent filter, added onto the next larger level. */
export const BLOOM_UP_FRAGMENT = /* glsl */ `
uniform sampler2D tSource;
uniform vec2 uTexel;
uniform float uSpread;
varying vec2 vUv;

void main() {
  vec2 d = uTexel * uSpread;
  vec3 color = texture2D( tSource, vUv ).rgb * 4.0;
  color += ( texture2D( tSource, vUv + vec2( d.x, 0.0 ) ).rgb + texture2D( tSource, vUv - vec2( d.x, 0.0 ) ).rgb
    + texture2D( tSource, vUv + vec2( 0.0, d.y ) ).rgb + texture2D( tSource, vUv - vec2( 0.0, d.y ) ).rgb ) * 2.0;
  color += texture2D( tSource, vUv + d ).rgb + texture2D( tSource, vUv - d ).rgb
    + texture2D( tSource, vUv + vec2( d.x, -d.y ) ).rgb + texture2D( tSource, vUv + vec2( -d.x, d.y ) ).rgb;
  gl_FragColor = vec4( color / 16.0, 1.0 );
}
`;

/**
 * Brings it together: the lit scene (optionally defocused toward the top and bottom of the
 * screen, the "miniature" look), darkened by AO where no marker covers it, plus bloom; then
 * exposure, filmic tone mapping, a colour grade and a vignette. Writes display-ready sRGB.
 */
export const COMPOSITE_FRAGMENT = /* glsl */ `
${DEPTH_PACKING}
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform vec2 uSceneTexel;
uniform float uExposure;
uniform float uBloom;
uniform float uSaturation;
uniform float uContrast;
uniform float uVignette;
uniform vec3 uShadowTint;
uniform vec3 uHighlightTint;
uniform float uAberration;
/** Red pulse at the screen edge while you're being chased. */
uniform float uDanger;
uniform float uTime;
uniform float uGrain;
varying vec2 vUv;

#ifdef USE_AO
  uniform sampler2D tAo;
  uniform sampler2D tDepth;
  uniform mat4 uProjInv;
  uniform vec2 uAoSize;
  uniform float uAo;
  uniform float uFar;
  /** Screen-space AO at half resolution, upsampled without bleeding across depth edges. */
  float ambientOcclusion() {
    float ndc = texture2D( tDepth, vUv ).x * 2.0 - 1.0;
    float viewZ = ( uProjInv[ 2 ][ 2 ] * ndc + uProjInv[ 3 ][ 2 ] ) / ( uProjInv[ 2 ][ 3 ] * ndc + uProjInv[ 3 ][ 3 ] );
    float z = -viewZ / uFar;
    vec2 p = vUv * uAoSize - 0.5;
    vec2 f = fract( p );
    vec2 base = ( floor( p ) + 0.5 ) / uAoSize;
    float sum = 0.0;
    float weight = 0.0;
    for ( int j = 0; j <= 1; j ++ ) {
      for ( int i = 0; i <= 1; i ++ ) {
        vec4 s = texture2D( tAo, base + vec2( float( i ), float( j ) ) / uAoSize );
        float wb = ( i == 0 ? 1.0 - f.x : f.x ) * ( j == 0 ? 1.0 - f.y : f.y );
        float w = ( wb + 1e-3 ) / ( 2e-4 + abs( unpackDepth( s.gb ) - z ) );
        sum += s.r * w;
        weight += w;
      }
    }
    return sum / weight;
  }
#endif

#ifdef USE_TILT_SHIFT
  uniform float uTilt;
  uniform float uFocusBand;
  /** Blur radius in pixels: sharp across the middle of the screen, soft toward top and bottom. */
  float defocus() {
    return uTilt * smoothstep( uFocusBand, 0.5, abs( vUv.y - 0.5 ) );
  }
  vec4 sceneColor() {
    float radius = defocus();
    vec4 center = texture2D( tScene, vUv );
    if ( radius < 0.35 ) return center;
    vec3 sum = center.rgb;
    // Golden-angle spiral: an even disc from few taps.
    for ( int i = 1; i <= 10; i ++ ) {
      float r = sqrt( float( i ) / 10.0 ) * radius;
      float a = float( i ) * 2.39996323;
      sum += texture2D( tScene, vUv + vec2( cos( a ), sin( a ) ) * r * uSceneTexel ).rgb;
    }
    return vec4( sum / 11.0, center.a );
  }
#else
  vec4 sceneColor() {
    return texture2D( tScene, vUv );
  }
#endif

// ACES filmic curve (Stephen Hill's fit), as three.js uses for ACESFilmicToneMapping.
vec3 RRTAndODTFit( vec3 v ) {
  vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
  vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
  return a / b;
}
vec3 toneMap( vec3 color ) {
  const mat3 ACESInputMat = mat3(
    vec3( 0.59719, 0.07600, 0.02840 ),
    vec3( 0.35458, 0.90834, 0.13383 ),
    vec3( 0.04823, 0.01566, 0.83777 )
  );
  const mat3 ACESOutputMat = mat3(
    vec3( 1.60475, -0.10208, -0.00327 ),
    vec3( -0.53108, 1.10813, -0.07276 ),
    vec3( -0.07367, -0.00605, 1.07602 )
  );
  color = ACESInputMat * ( color * uExposure / 0.6 );
  color = ACESOutputMat * RRTAndODTFit( color );
  return clamp( color, 0.0, 1.0 );
}

vec3 linearToSRGB( vec3 c ) {
  return mix( c * 12.92, 1.055 * pow( c, vec3( 1.0 / 2.4 ) ) - 0.055, step( 0.0031308, c ) );
}

float hash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}

void main() {
  vec4 scene = sceneColor();
  vec3 color = scene.rgb;

  #ifdef USE_ABERRATION
    // Lens fringing: red and blue part ways toward the corners.
    vec2 fringe = ( vUv - 0.5 ) * dot( vUv - 0.5, vUv - 0.5 ) * uAberration;
    color.r = texture2D( tScene, vUv - fringe ).r;
    color.b = texture2D( tScene, vUv + fringe ).b;
  #endif

  #ifdef USE_AO
    // Markers (speech bubbles, vision cones) lower the alpha they draw over, so they stay clean.
    color *= mix( 1.0, ambientOcclusion(), uAo * clamp( scene.a, 0.0, 1.0 ) );
  #endif

  color += texture2D( tBloom, vUv ).rgb * uBloom;
  color = toneMap( color );

  // Grade: saturation, contrast, cool shadows and warm highlights. Contrast is a power curve
  // about a low pivot: it deepens the shadows without ever clipping them to black, so a dark
  // room keeps its detail.
  float luma = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
  color = mix( vec3( luma ), color, uSaturation );
  color = 0.36 * pow( max( color, 0.0 ) / 0.36, vec3( uContrast ) );
  color *= mix( uShadowTint, uHighlightTint, smoothstep( 0.0, 1.0, luma ) );

  vec2 fromCenter = vUv - 0.5;
  float edge = dot( fromCenter, fromCenter );
  color *= 1.0 - uVignette * smoothstep( 0.08, 0.6, edge );
  color = mix( color, vec3( 0.85, 0.05, 0.03 ), uDanger * smoothstep( 0.12, 0.5, edge ) );

  color = linearToSRGB( clamp( color, 0.0, 1.0 ) );
  #ifndef USE_FXAA
    color += ( hash( gl_FragCoord.xy + fract( uTime ) * 61.0 ) - 0.5 ) * uGrain;
  #endif
  gl_FragColor = vec4( color, 1.0 );
}
`;

/**
 * FXAA 3.11 (Timothy Lottes), the "quality" variant trimmed to a short edge search. Runs on
 * the display-ready image, then adds a little animated film grain, which also dithers away
 * banding in the dark rooms' gradients.
 */
export const FXAA_FRAGMENT = /* glsl */ `
uniform sampler2D tColor;
uniform vec2 uTexel;
uniform float uTime;
uniform float uGrain;
varying vec2 vUv;

#define EDGE_THRESHOLD 0.125
#define EDGE_THRESHOLD_MIN 0.0312
#define SUBPIXEL 0.75
#define SEARCH_STEPS 8

float luma( vec3 c ) {
  return dot( c, vec3( 0.299, 0.587, 0.114 ) );
}
float lumaAt( vec2 uv ) {
  return luma( texture2D( tColor, uv ).rgb );
}
float hash( vec2 p ) {
  vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
  p3 += dot( p3, p3.yzx + 33.33 );
  return fract( ( p3.x + p3.y ) * p3.z );
}

vec3 fxaa() {
  vec3 colorM = texture2D( tColor, vUv ).rgb;
  float lumaM = luma( colorM );
  float lumaN = lumaAt( vUv + vec2( 0.0, uTexel.y ) );
  float lumaS = lumaAt( vUv - vec2( 0.0, uTexel.y ) );
  float lumaE = lumaAt( vUv + vec2( uTexel.x, 0.0 ) );
  float lumaW = lumaAt( vUv - vec2( uTexel.x, 0.0 ) );
  float lumaMax = max( lumaM, max( max( lumaN, lumaS ), max( lumaE, lumaW ) ) );
  float lumaMin = min( lumaM, min( min( lumaN, lumaS ), min( lumaE, lumaW ) ) );
  float range = lumaMax - lumaMin;
  if ( range < max( EDGE_THRESHOLD_MIN, lumaMax * EDGE_THRESHOLD ) ) return colorM;

  float lumaNE = lumaAt( vUv + uTexel );
  float lumaSW = lumaAt( vUv - uTexel );
  float lumaNW = lumaAt( vUv + vec2( -uTexel.x, uTexel.y ) );
  float lumaSE = lumaAt( vUv + vec2( uTexel.x, -uTexel.y ) );

  float lumaNS = lumaN + lumaS;
  float lumaWE = lumaW + lumaE;
  float edgeH = abs( lumaNW + lumaSW - 2.0 * lumaW ) + 2.0 * abs( lumaNS - 2.0 * lumaM ) + abs( lumaNE + lumaSE - 2.0 * lumaE );
  float edgeV = abs( lumaNW + lumaNE - 2.0 * lumaN ) + 2.0 * abs( lumaWE - 2.0 * lumaM ) + abs( lumaSW + lumaSE - 2.0 * lumaS );
  bool horizontal = edgeH >= edgeV;

  // Which side of this pixel the edge is on, and how steep it is there.
  float luma1 = horizontal ? lumaS : lumaW;
  float luma2 = horizontal ? lumaN : lumaE;
  float gradient1 = luma1 - lumaM;
  float gradient2 = luma2 - lumaM;
  bool steepest1 = abs( gradient1 ) >= abs( gradient2 );
  float gradient = 0.25 * max( abs( gradient1 ), abs( gradient2 ) );
  float stepLength = horizontal ? uTexel.y : uTexel.x;
  float lumaLocalAverage;
  if ( steepest1 ) {
    stepLength = -stepLength;
    lumaLocalAverage = 0.5 * ( luma1 + lumaM );
  } else {
    lumaLocalAverage = 0.5 * ( luma2 + lumaM );
  }

  // Walk along the edge both ways to find where it ends.
  vec2 edgeUv = vUv;
  if ( horizontal ) edgeUv.y += stepLength * 0.5;
  else edgeUv.x += stepLength * 0.5;
  vec2 along = horizontal ? vec2( uTexel.x, 0.0 ) : vec2( 0.0, uTexel.y );
  vec2 uv1 = edgeUv - along;
  vec2 uv2 = edgeUv + along;
  float lumaEnd1 = lumaAt( uv1 ) - lumaLocalAverage;
  float lumaEnd2 = lumaAt( uv2 ) - lumaLocalAverage;
  bool reached1 = abs( lumaEnd1 ) >= gradient;
  bool reached2 = abs( lumaEnd2 ) >= gradient;
  for ( int i = 2; i < SEARCH_STEPS; i ++ ) {
    if ( reached1 && reached2 ) break;
    float stride = i < 4 ? 1.0 : i < 6 ? 2.0 : 4.0;
    if ( ! reached1 ) {
      uv1 -= along * stride;
      lumaEnd1 = lumaAt( uv1 ) - lumaLocalAverage;
      reached1 = abs( lumaEnd1 ) >= gradient;
    }
    if ( ! reached2 ) {
      uv2 += along * stride;
      lumaEnd2 = lumaAt( uv2 ) - lumaLocalAverage;
      reached2 = abs( lumaEnd2 ) >= gradient;
    }
  }
  float distance1 = horizontal ? vUv.x - uv1.x : vUv.y - uv1.y;
  float distance2 = horizontal ? uv2.x - vUv.x : uv2.y - vUv.y;
  bool closer1 = distance1 < distance2;
  float edgeLength = distance1 + distance2;
  float pixelOffset = -min( distance1, distance2 ) / edgeLength + 0.5;
  // Only blend if the end of the edge agrees with the side we're on.
  bool centerBelowAverage = lumaM < lumaLocalAverage;
  bool correctVariation = ( ( closer1 ? lumaEnd1 : lumaEnd2 ) < 0.0 ) != centerBelowAverage;
  float edgeOffset = correctVariation ? pixelOffset : 0.0;

  // Sub-pixel smoothing for lone bright or dark pixels.
  float lumaAverage = ( 2.0 * ( lumaNS + lumaWE ) + lumaNW + lumaNE + lumaSW + lumaSE ) / 12.0;
  float subPixel = clamp( abs( lumaAverage - lumaM ) / range, 0.0, 1.0 );
  subPixel = ( -2.0 * subPixel + 3.0 ) * subPixel * subPixel;
  float offset = max( edgeOffset, subPixel * subPixel * SUBPIXEL );

  vec2 uv = vUv;
  if ( horizontal ) uv.y += offset * stepLength;
  else uv.x += offset * stepLength;
  return texture2D( tColor, uv ).rgb;
}

void main() {
  vec3 color = fxaa();
  color += ( hash( gl_FragCoord.xy + fract( uTime ) * 61.0 ) - 0.5 ) * uGrain;
  gl_FragColor = vec4( color, 1.0 );
}
`;
