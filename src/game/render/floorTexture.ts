import { roomAt, tileAt, lightAt } from '@core/level/asciiLevel';
import type { LevelDef, RoomKind } from '@core/level/types';
import * as THREE from 'three';
import { shadeWithWorld, type WorldShading } from './materials';
import { css, FLOORS } from './palette';

/**
 * The floor. Each kind of room has its own material (linoleum, planks, ceramic tile, carpet,
 * concrete…), painted once into a layer of a texture array that repeats every two tiles, so
 * it stays sharp from a few centimetres away in first person as well as from the diorama
 * camera. A one-texel-per-tile map says which layer each tile uses; a relief layer gives every
 * material its own gloss and grooves; and a low-resolution paint map carries what doesn't
 * repeat: contact shadows along the walls, parking stripes, court lines and room names.
 */

export type FloorKind = RoomKind | 'doorway';

/** Layer order of the texture arrays. */
export const FLOOR_KINDS: readonly FloorKind[] = [
  'exterior',
  'hallway',
  'classroom',
  'restroom',
  'closet',
  'lounge',
  'boiler',
  'office',
  'library',
  'lab',
  'gym',
  'cafeteria',
  'kitchen',
  'mechanical',
  'doorway',
];

/** Pattern units per tile (patterns are drawn in these units). */
const PX = 32;
/** Tiles each layer covers before repeating. */
const LAYER_TILES = 2;
/** Paint map pixels per tile. */
const PAINT_RES = 24;

type Ctx = CanvasRenderingContext2D;

interface Surface {
  /** Base roughness: low is glossy (waxed linoleum, varnish), high is matt (carpet). */
  roughness: number;
  /** How deep the grooves read. */
  bump: number;
  /** Fine grain: speckle in the colour and pitting in the relief. */
  grain: number;
  /** Planks: each board gets its own tint. */
  planks?: boolean;
}

const SURFACES: Record<FloorKind, Surface> = {
  exterior: { roughness: 0.94, bump: 1.2, grain: 0.5 },
  hallway: { roughness: 0.3, bump: 0.7, grain: 0.05 },
  classroom: { roughness: 0.46, bump: 0.9, grain: 0.1, planks: true },
  restroom: { roughness: 0.2, bump: 1.3, grain: 0.03 },
  closet: { roughness: 0.75, bump: 0.9, grain: 0.3 },
  lounge: { roughness: 0.96, bump: 0.6, grain: 0.28 },
  boiler: { roughness: 0.82, bump: 1, grain: 0.22 },
  office: { roughness: 0.96, bump: 0.6, grain: 0.26 },
  library: { roughness: 0.96, bump: 0.6, grain: 0.26 },
  lab: { roughness: 0.3, bump: 1, grain: 0.04 },
  gym: { roughness: 0.2, bump: 0.7, grain: 0.07, planks: true },
  cafeteria: { roughness: 0.32, bump: 1, grain: 0.04 },
  kitchen: { roughness: 0.4, bump: 1.2, grain: 0.08 },
  mechanical: { roughness: 0.8, bump: 1, grain: 0.32 },
  doorway: { roughness: 0.45, bump: 1.2, grain: 0.06 },
};

/** Colour of one tile of a room kind. */
function tilePattern(ctx: Ctx, kind: FloorKind, x: number, y: number, col: number, row: number) {
  const [base, accent] = FLOORS[kind];
  ctx.fillStyle = css(base);
  ctx.fillRect(x, y, PX, PX);
  ctx.fillStyle = css(accent);
  switch (kind) {
    case 'hallway': {
      // Big checker linoleum.
      if ((col + row) % 2 === 0) ctx.fillRect(x, y, PX, PX);
      break;
    }
    case 'classroom': {
      for (let i = 0; i < 4; i++) ctx.fillRect(x, y + i * 8, PX, 1);
      ctx.fillRect(x + ((col * 7 + row * 3) % 4) * 8, y, 1, 8);
      ctx.fillRect(x + ((col * 5 + row) % 4) * 8, y + 16, 1, 8);
      break;
    }
    case 'restroom': {
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(x + i * 8, y, 1, PX);
        ctx.fillRect(x, y + i * 8, PX, 1);
      }
      break;
    }
    case 'lounge': {
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) ctx.fillRect(x + 3 + i * 8, y + 3 + j * 8, 2, 2);
      break;
    }
    case 'boiler': {
      ctx.fillRect(x, y, PX, 1);
      ctx.fillRect(x, y, 1, PX);
      for (let i = 0; i < 6; i++)
        ctx.fillRect(x + ((i * 11 + col * 3) % PX), y + ((i * 7 + row * 5) % PX), 2, 2);
      break;
    }
    case 'office':
    case 'library': {
      // Carpet: fine flecks.
      for (let i = 0; i < 10; i++)
        ctx.fillRect(x + ((i * 13 + col * 5) % PX), y + ((i * 19 + row * 7) % PX), 1, 1);
      break;
    }
    case 'lab':
    case 'cafeteria': {
      // Checkerboard of small tiles.
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 4; j++) if ((i + j) % 2 === 0) ctx.fillRect(x + i * 8, y + j * 8, 8, 8);
      break;
    }
    case 'gym': {
      // Maple boards (the court lines are in the paint map).
      for (let i = 0; i < 4; i++) ctx.fillRect(x, y + i * 8, PX, 1);
      break;
    }
    case 'kitchen': {
      for (let i = 0; i < 2; i++) {
        ctx.fillRect(x + i * 16, y, 1, PX);
        ctx.fillRect(x, y + i * 16, PX, 1);
      }
      break;
    }
    case 'doorway': {
      ctx.fillRect(x, y + 2, PX, 3);
      ctx.fillRect(x, y + PX - 5, PX, 3);
      break;
    }
  }
}

/** Relief of one tile: mid grey is level, darker is a groove, lighter stands proud. */
function tileRelief(ctx: Ctx, kind: FloorKind, x: number, y: number, col: number, row: number) {
  ctx.fillStyle = '#808080';
  ctx.fillRect(x, y, PX, PX);
  ctx.fillStyle = '#2c2c2c';
  switch (kind) {
    case 'hallway':
    case 'boiler': {
      // Seams between big squares.
      ctx.fillRect(x, y, PX, 0.6);
      ctx.fillRect(x, y, 0.6, PX);
      break;
    }
    case 'classroom': {
      for (let i = 0; i < 4; i++) ctx.fillRect(x, y + i * 8, PX, 0.7);
      ctx.fillRect(x + ((col * 7 + row * 3) % 4) * 8, y, 0.7, 8);
      ctx.fillRect(x + ((col * 5 + row) % 4) * 8, y + 16, 0.7, 8);
      break;
    }
    case 'gym': {
      for (let i = 0; i < 4; i++) ctx.fillRect(x, y + i * 8, PX, 0.5);
      break;
    }
    case 'restroom':
    case 'lab':
    case 'cafeteria': {
      // Grout between small tiles.
      for (let i = 0; i < 4; i++) {
        ctx.fillRect(x + i * 8, y, 0.9, PX);
        ctx.fillRect(x, y + i * 8, PX, 0.9);
      }
      break;
    }
    case 'kitchen': {
      for (let i = 0; i < 2; i++) {
        ctx.fillRect(x + i * 16, y, 1.1, PX);
        ctx.fillRect(x, y + i * 16, PX, 1.1);
      }
      break;
    }
    case 'doorway': {
      // Metal threshold strips stand proud of the floor.
      ctx.fillStyle = '#d0d0d0';
      ctx.fillRect(x, y + 2, PX, 3);
      ctx.fillRect(x, y + PX - 5, PX, 3);
      break;
    }
    default:
      break;
  }
}

/** Repeatable noise, 0..1, from integer coordinates. */
function hash(x: number, y: number, seed: number) {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth noise, 0..1, that repeats every `period` cells (so textures tile). */
function valueNoise(x: number, y: number, period: number, seed: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const corner = (cx: number, cy: number) => hash(cx % period, cy % period, seed);
  const top = corner(x0, y0) * (1 - sx) + corner(x0 + 1, y0) * sx;
  const bottom = corner(x0, y0 + 1) * (1 - sx) + corner(x0 + 1, y0 + 1) * sx;
  return top * (1 - sy) + bottom * sy;
}

function paintLayer(size: number, draw: (ctx: Ctx, col: number, row: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.scale(size / (LAYER_TILES * PX), size / (LAYER_TILES * PX));
  for (let row = 0; row < LAYER_TILES; row++)
    for (let col = 0; col < LAYER_TILES; col++) draw(ctx, col, row);
  return ctx.getImageData(0, 0, size, size).data;
}

export interface FloorLayers {
  /** Colour per floor kind. */
  albedo: THREE.DataArrayTexture;
  /** r: roughness, gb: surface slope (normal map), a: unused. */
  detail: THREE.DataArrayTexture;
}

/**
 * Paint every floor kind into its layer. `size` is pixels per layer (a layer spans two tiles):
 * 512 on desktops, 256 where memory is tight.
 */
export function createFloorLayers(size: number, anisotropy: number): FloorLayers {
  const count = FLOOR_KINDS.length;
  const albedo = new Uint8Array(size * size * 4 * count);
  const detail = new Uint8Array(size * size * 4 * count);
  const height = new Float32Array(size * size);
  const perTile = size / LAYER_TILES;

  FLOOR_KINDS.forEach((kind, layer) => {
    const surface = SURFACES[kind];
    const colour = paintLayer(size, (ctx, col, row) =>
      tilePattern(ctx, kind, col * PX, row * PX, col, row),
    );
    const relief = paintLayer(size, (ctx, col, row) =>
      tileRelief(ctx, kind, col * PX, row * PX, col, row),
    );
    const offset = layer * size * size * 4;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        // Grain: per-pixel speckle, plus a soft mottle so big areas aren't uniform.
        const fine = hash(x, y, layer) - 0.5;
        const mottle = valueNoise((x / size) * 12, (y / size) * 12, 12, layer + 31) - 0.5;
        let tint = 1 + fine * surface.grain * 0.35 + mottle * surface.grain * 0.3;
        if (surface.planks) {
          // Each board (a quarter of a tile wide) has its own shade.
          const board = Math.floor((y / perTile) * 4);
          tint *= 0.93 + hash(board, 0, layer + 7) * 0.14;
        }
        for (let c = 0; c < 3; c++) {
          albedo[offset + i * 4 + c] = Math.max(
            0,
            Math.min(255, Math.round(colour[i * 4 + c]! * tint)),
          );
        }
        albedo[offset + i * 4 + 3] = 255;
        height[i] = relief[i * 4]! / 255 + fine * surface.grain * 0.5;
      }
    }

    // Slopes of the relief (wrapping, so layers tile seamlessly) become the normal map.
    const wrap = (v: number) => (v + size) % size;
    const at = (x: number, y: number) => height[wrap(y) * size + wrap(x)]!;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        const dx = (at(x + 1, y) - at(x - 1, y)) * surface.bump;
        const dy = (at(x, y + 1) - at(x, y - 1)) * surface.bump;
        const h = height[i]!;
        // Grooves hold dirt (rougher); raised metal strips are polished.
        const rough = surface.roughness + (0.5 - h) * 0.7 + (hash(x, y, layer + 3) - 0.5) * 0.08;
        detail[offset + i * 4] = Math.round(Math.max(0.04, Math.min(1, rough)) * 255);
        detail[offset + i * 4 + 1] = Math.round(Math.max(0, Math.min(1, 0.5 - dx)) * 255);
        detail[offset + i * 4 + 2] = Math.round(Math.max(0, Math.min(1, 0.5 - dy)) * 255);
        detail[offset + i * 4 + 3] = 255;
      }
    }
  });

  const array = (data: Uint8Array, colorSpace: THREE.ColorSpace) => {
    const texture = new THREE.DataArrayTexture(data, size, size, count);
    texture.format = THREE.RGBAFormat;
    texture.colorSpace = colorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = anisotropy;
    texture.needsUpdate = true;
    return texture;
  };
  return {
    albedo: array(albedo, THREE.SRGBColorSpace),
    detail: array(detail, THREE.NoColorSpace),
  };
}

/** One texel per tile: which floor layer it uses. */
export function createKindMap(level: LevelDef): THREE.DataTexture {
  const data = new Uint8Array(level.cols * level.rows);
  for (let row = 0; row < level.rows; row++) {
    for (let col = 0; col < level.cols; col++) {
      const tile = tileAt(level, col, row);
      const kind: FloorKind =
        tile === 'door' || tile === 'lockedDoor'
          ? 'doorway'
          : (roomAt(level, col, row)?.kind ?? 'hallway');
      data[row * level.cols + col] = FLOOR_KINDS.indexOf(kind);
    }
  }
  const texture = new THREE.DataTexture(data, level.cols, level.rows, THREE.RedFormat);
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}

/**
 * What's painted on the floor and doesn't repeat, as three masks: red is the soft shadow where
 * floor meets wall, green is light paint (parking stripes, court lines, room names on dark
 * floors) and blue is dark stencilling (room names on light floors).
 */
export function createFloorPaint(level: LevelDef): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = level.cols * PAINT_RES;
  canvas.height = level.rows * PAINT_RES;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(PAINT_RES / PX, PAINT_RES / PX);
  ctx.globalCompositeOperation = 'lighter';

  wallShadows(ctx, level);

  // Parking stripes either side of the van.
  ctx.fillStyle = '#00ff00';
  if (level.vanTiles.length) {
    const cols = level.vanTiles.map((t) => t.col);
    const rows = level.vanTiles.map((t) => t.row);
    const c0 = Math.min(...cols) - 1;
    const c1 = Math.max(...cols) + 2;
    for (const r of [Math.min(...rows) - 1, Math.max(...rows) + 2])
      ctx.fillRect(c0 * PX, r * PX - 2, (c1 - c0) * PX, 4);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const room of level.rooms) {
    const { col, row, w, h } = room.rect;
    if (room.kind === 'gym') {
      // Court lines across the boards.
      ctx.fillStyle = 'rgb(0,235,0)';
      for (let r = row; r < row + h; r++)
        if (r % 9 === 4) ctx.fillRect(col * PX, r * PX + 14, w * PX, 3);
    }
    // Room names, painted faintly like floor stencils.
    if (room.kind === 'hallway' || room.kind === 'exterior') continue;
    ctx.font = `bold ${Math.min(30, ((w * PX) / room.name.length) * 1.3)}px system-ui, sans-serif`;
    ctx.fillStyle = lightAt(level, col, row) < 0.5 ? 'rgb(0,34,0)' : 'rgb(0,0,36)';
    ctx.fillText(room.name.toUpperCase(), (col + w / 2) * PX, (row + h / 2) * PX);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

/**
 * Soft contact shadow where the floor meets a wall (ambient occlusion, painted once). Darkest
 * at the wall, fading out over about a third of a tile.
 */
function wallShadows(ctx: Ctx, level: LevelDef) {
  const reach = PX * 0.32;
  const isWall = (c: number, r: number) => tileAt(level, c, r) === 'wall';
  const shade = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number) => {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, 'rgb(86,0,0)');
    g.addColorStop(1, 'rgb(0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(rx, ry, Math.abs(x1 - x0) || PX, Math.abs(y1 - y0) || PX);
  };
  for (let row = 0; row < level.rows; row++) {
    for (let col = 0; col < level.cols; col++) {
      if (isWall(col, row)) continue;
      const x = col * PX;
      const y = row * PX;
      if (isWall(col, row - 1)) shade(x, y, x, y + reach, x, y);
      if (isWall(col, row + 1)) shade(x, y + PX, x, y + PX - reach, x, y + PX - reach);
      if (isWall(col - 1, row)) shade(x, y, x + reach, y, x, y);
      if (isWall(col + 1, row)) shade(x + PX, y, x + PX - reach, y, x + PX - reach, y);
    }
  }
}

const FLOOR_DECLARATIONS = /* glsl */ `
uniform sampler2D uKindMap;
uniform sampler2D uFloorPaint;
uniform mediump sampler2DArray uFloorAlbedo;
uniform mediump sampler2DArray uFloorDetail;
uniform sampler2D uMirror;
uniform mat4 uMirrorMatrix;
uniform float uMirrorStrength;
vec2 copperFloorSlope;
`;

const FLOOR_SURFACE = /* glsl */ `
{
  vec2 copperTile = vCopperPos.xz;
  float copperKind = floor( texture2D( uKindMap, copperTile / uMapSize ).r * 255.0 + 0.5 );
  vec3 copperLayer = vec3( copperTile / ${LAYER_TILES}.0, copperKind );
  vec4 copperDetail = texture( uFloorDetail, copperLayer );
  diffuseColor.rgb = texture( uFloorAlbedo, copperLayer ).rgb;
  roughnessFactor = copperDetail.r;
  vec3 copperPaint = texture2D( uFloorPaint, vec2( copperTile.x / uMapSize.x, 1.0 - copperTile.y / uMapSize.y ) ).rgb;
  diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.8, 0.76, 0.64 ), copperPaint.g );
  diffuseColor.rgb *= ( 1.0 - copperPaint.r ) * ( 1.0 - copperPaint.b );
  roughnessFactor = mix( roughnessFactor, 0.6, copperPaint.g );
  copperFloorSlope = copperDetail.gb * 2.0 - 1.0;
  normal = normalize( normal + ( viewMatrix * vec4( copperFloorSlope.x, 0.0, copperFloorSlope.y, 0.0 ) ).xyz * 1.3 );
}
`;

/**
 * The reflection: what the mirrored camera drew, where this bit of floor sees it. Glossier
 * floors reflect more and more sharply (duller ones read blurrier mip levels), grooves bend
 * it, and like any polished floor it's strongest at a glancing angle.
 */
const FLOOR_REFLECTION = /* glsl */ `
if ( uMirrorStrength > 0.0 ) {
  float copperGloss = 1.0 - roughnessFactor;
  copperGloss *= copperGloss;
  if ( copperGloss > 0.01 ) {
    vec4 copperMirrorAt = uMirrorMatrix * vec4( vCopperPos, 1.0 );
    vec2 copperMirrorUv = copperMirrorAt.xy / copperMirrorAt.w + copperFloorSlope * 0.012;
    vec3 copperReflected = textureLod( uMirror, copperMirrorUv, roughnessFactor * 6.0 ).rgb;
    float copperGlance = 1.0 - saturate( dot( geometryViewDir, normal ) );
    float copperFresnel = 0.07 + 0.93 * pow( copperGlance, 5.0 );
    outgoingLight += min( copperReflected, vec3( 6.0 ) ) * copperFresnel * copperGloss * uMirrorStrength;
  }
}
`;

export interface FloorMaterial {
  material: THREE.MeshPhysicalMaterial;
  /**
   * Show a reflection (see FloorMirror): its picture, the matrix that finds a point in it, and
   * how strong. Zero strength turns it off.
   */
  reflect(texture: THREE.Texture | null, matrix: THREE.Matrix4, strength: number): void;
  dispose(): void;
}

/** The floor's material: world shading plus the layered surface above. */
export function createFloorMaterial(
  level: LevelDef,
  shading: WorldShading,
  layerSize: number,
  anisotropy: number,
): FloorMaterial {
  const layers = createFloorLayers(layerSize, anisotropy);
  const kindMap = createKindMap(level);
  const paint = createFloorPaint(level);
  const mirror = {
    uMirror: { value: null as THREE.Texture | null },
    uMirrorMatrix: { value: new THREE.Matrix4() },
    uMirrorStrength: { value: 0 },
  };
  // Physical, for `specularIntensity`: a waxed floor seen at a glancing angle would otherwise
  // mirror the whole (very bright) studio environment and wash out.
  const material = shadeWithWorld(
    new THREE.MeshPhysicalMaterial({ roughness: 0.8, specularIntensity: 0.55 }),
    shading,
    {
      patch: {
        key: 'floor',
        uniforms: {
          uKindMap: { value: kindMap },
          uFloorPaint: { value: paint },
          uFloorAlbedo: { value: layers.albedo },
          uFloorDetail: { value: layers.detail },
          ...mirror,
        },
        declarations: FLOOR_DECLARATIONS,
        surface: FLOOR_SURFACE,
        light: FLOOR_REFLECTION,
      },
    },
  );
  return {
    material,
    reflect(texture, matrix, strength) {
      mirror.uMirror.value = texture;
      mirror.uMirrorMatrix.value.copy(matrix);
      mirror.uMirrorStrength.value = texture ? strength : 0;
      // With a true reflection, the studio environment has less to add.
      material.specularIntensity = texture && strength > 0 ? 0.3 : 0.55;
    },
    dispose() {
      layers.albedo.dispose();
      layers.detail.dispose();
      kindMap.dispose();
      paint.dispose();
      material.dispose();
    },
  };
}

/**
 * Painted concrete blocks for the walls, generated rather than drawn: r is a slight darkening
 * in the mortar lines, gb the slope of the relief, a the roughness (0.5 = the material's own).
 * One repeat is two blocks by four courses, laid in running bond.
 */
export function wallDetailTexture(anisotropy: number): THREE.DataTexture {
  const size = 256;
  const blockW = size / 2;
  const courseH = size / 4;
  const mortar = 4;
  const height = new Float32Array(size * size);
  const edge = (d: number) => Math.min(1, Math.max(0, d / mortar));
  for (let y = 0; y < size; y++) {
    const course = Math.floor(y / courseH);
    const fy = y % courseH;
    for (let x = 0; x < size; x++) {
      const fx = (x + (course % 2) * (blockW / 2)) % blockW;
      // 1 on the face of a block, easing to 0 in the mortar joints around it.
      const face = Math.min(
        edge(Math.min(fx, blockW - 1 - fx)),
        edge(Math.min(fy, courseH - 1 - fy)),
      );
      const pores = (hash(x, y, 91) - 0.5) * 0.16 + (hash(x >> 2, y >> 2, 92) - 0.5) * 0.1;
      height[y * size + x] = face * face * (3 - 2 * face) * 0.5 + pores * face;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const wrap = (v: number) => (v + size) % size;
  const at = (x: number, y: number) => height[wrap(y) * size + wrap(x)]!;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const h = at(x, y);
      data[i] = Math.round(Math.min(1, 0.86 + h * 0.28) * 255);
      data[i + 1] = Math.round(Math.max(0, Math.min(1, 0.5 - (at(x + 1, y) - at(x - 1, y)))) * 255);
      data[i + 2] = Math.round(Math.max(0, Math.min(1, 0.5 - (at(x, y + 1) - at(x, y - 1)))) * 255);
      data[i + 3] = Math.round(Math.max(0, Math.min(1, 0.75 - h * 0.5)) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = anisotropy;
  texture.needsUpdate = true;
  return texture;
}
