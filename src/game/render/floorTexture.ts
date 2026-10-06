import { roomAt, tileAt, lightAt } from '@core/level/asciiLevel';
import type { LevelDef, RoomKind } from '@core/level/types';
import * as THREE from 'three';
import { css, FLOORS } from './palette';

/** Pattern units per tile (patterns are drawn in these units). */
const PX = 32;
/** Texture pixels per tile: sharper than the pattern grid now the camera sits closer. */
const RES = 48;

type Ctx = CanvasRenderingContext2D;

function tilePattern(
  ctx: Ctx,
  kind: RoomKind | 'doorway',
  x: number,
  y: number,
  col: number,
  row: number,
) {
  const [base, accent] = FLOORS[kind];
  ctx.fillStyle = css(base);
  ctx.fillRect(x, y, PX, PX);
  ctx.fillStyle = css(accent);
  switch (kind) {
    case 'hallway': {
      // Big 2x2 checker linoleum.
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
    case 'closet':
    case 'exterior': {
      for (let i = 0; i < 8; i++)
        ctx.fillRect(x + ((i * 13 + col * 7) % PX), y + ((i * 17 + row * 11) % PX), 2, 2);
      break;
    }
    case 'doorway': {
      ctx.fillRect(x, y + 2, PX, 3);
      ctx.fillRect(x, y + PX - 5, PX, 3);
      break;
    }
  }
}

/** Painted floor plan for the whole level: per-room materials, parking stripes, room names. */
export function createFloorTexture(level: LevelDef): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = level.cols * RES;
  canvas.height = level.rows * RES;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(RES / PX, RES / PX);

  for (let row = 0; row < level.rows; row++) {
    for (let col = 0; col < level.cols; col++) {
      const kind = tileAt(level, col, row);
      const room = roomAt(level, col, row);
      const pattern =
        kind === 'door' || kind === 'lockedDoor' ? 'doorway' : (room?.kind ?? 'hallway');
      tilePattern(ctx, pattern, col * PX, row * PX, col, row);
    }
  }

  wallShadows(ctx, level);

  // Parking stripes either side of the van.
  if (level.vanTiles.length) {
    const cols = level.vanTiles.map((t) => t.col);
    const rows = level.vanTiles.map((t) => t.row);
    const c0 = Math.min(...cols) - 1;
    const c1 = Math.max(...cols) + 2;
    ctx.fillStyle = '#e8e4d8';
    for (const r of [Math.min(...rows) - 1, Math.max(...rows) + 2])
      ctx.fillRect(c0 * PX, r * PX - 2, (c1 - c0) * PX, 4);
  }

  // Room names, painted faintly like floor stencils.
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const room of level.rooms) {
    if (room.kind === 'hallway' || room.kind === 'exterior') continue;
    const cx = (room.rect.col + room.rect.w / 2) * PX;
    const cy = (room.rect.row + room.rect.h / 2) * PX;
    ctx.font = `bold ${Math.min(30, ((room.rect.w * PX) / room.name.length) * 1.3)}px system-ui, sans-serif`;
    ctx.fillStyle =
      lightAt(level, room.rect.col, room.rect.row) < 0.5
        ? 'rgba(255,255,255,0.12)'
        : 'rgba(0,0,0,0.13)';
    ctx.fillText(room.name.toUpperCase(), cx, cy);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
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
    g.addColorStop(0, 'rgba(0,0,0,0.34)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
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

/** One texel per tile holding the room light level, sampled by the world shading patch. */
export function createLightMap(level: LevelDef): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = level.cols;
  canvas.height = level.rows;
  const ctx = canvas.getContext('2d')!;
  for (let row = 0; row < level.rows; row++) {
    for (let col = 0; col < level.cols; col++) {
      const v = Math.round(lightAt(level, col, row) * 255);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(col, row, 1, 1);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  // Nearest: each wall face picks up exactly the room it faces.
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  return texture;
}
