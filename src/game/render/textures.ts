import { TILE_SIZE } from '@core/content/balance';
import { CHARACTERS } from '@core/content/characters';
import { FIXTURES } from '@core/content/fixtures';
import type Phaser from 'phaser';
import {
  ASSETS,
  characterAsset,
  fixtureAsset,
  TEX_SCALE,
  TILE_FRAME_COUNT,
  TILE_FRAMES,
} from './assetManifest';
import { css, FLOORS, PALETTE } from './palette';

/**
 * Procedural placeholder art. Everything is drawn with Canvas2D at TEX_SCALE× resolution.
 * Replace any of these by giving its manifest entry a `url`.
 */

type Ctx = CanvasRenderingContext2D;
const T = TILE_SIZE * TEX_SCALE; // texture pixels per tile

export const TILESET_MARGIN = 1;
export const TILESET_SPACING = 2;

function canvasTexture(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  draw: (ctx: Ctx) => void,
) {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, w, h);
  if (!tex) return;
  const ctx = tex.getContext();
  draw(ctx);
  tex.refresh();
}

/** Deterministic noise so placeholder textures look the same every run. */
function speckle(
  ctx: Ctx,
  x: number,
  y: number,
  size: number,
  color: number,
  count: number,
  seed: number,
) {
  let s = seed;
  const rand = () => (s = (s * 16807) % 2147483647) / 2147483647;
  ctx.fillStyle = css(color);
  for (let i = 0; i < count; i++) ctx.fillRect(x + rand() * size, y + rand() * size, 2, 2);
}

function roundRect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
}

function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

const shade = (hex: number, amt: number) => {
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c * amt)));
  return (f(hex >> 16) << 16) | (f((hex >> 8) & 0xff) << 8) | f(hex & 0xff);
};

// ---------------------------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------------------------

const TILE_DRAWERS: Record<keyof typeof TILE_FRAMES, (ctx: Ctx, x: number, y: number) => void> = {
  exterior: (ctx, x, y) => {
    const [base, accent] = FLOORS.exterior;
    ctx.fillStyle = css(base);
    ctx.fillRect(x, y, T, T);
    speckle(ctx, x, y, T, accent, 40, 7);
  },
  hallway: (ctx, x, y) => {
    const [base, accent] = FLOORS.hallway;
    const h = T / 2;
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = css(i % 3 === 0 ? base : accent);
      ctx.fillRect(x + (i % 2) * h, y + Math.floor(i / 2) * h, h, h);
    }
  },
  classroom: (ctx, x, y) => {
    const [base, accent] = FLOORS.classroom;
    ctx.fillStyle = css(base);
    ctx.fillRect(x, y, T, T);
    ctx.fillStyle = css(accent);
    for (let i = 0; i < 4; i++) ctx.fillRect(x, y + i * (T / 4), T, 2);
    ctx.fillRect(x + T * 0.3, y, 2, T / 4);
    ctx.fillRect(x + T * 0.7, y + T / 4, 2, T / 4);
    ctx.fillRect(x + T * 0.5, y + T / 2, 2, T / 4);
    ctx.fillRect(x + T * 0.15, y + (3 * T) / 4, 2, T / 4);
  },
  restroom: (ctx, x, y) => {
    const [base, accent] = FLOORS.restroom;
    ctx.fillStyle = css(base);
    ctx.fillRect(x, y, T, T);
    ctx.fillStyle = css(accent);
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(x + i * (T / 4), y, 2, T);
      ctx.fillRect(x, y + i * (T / 4), T, 2);
    }
  },
  closet: (ctx, x, y) => {
    const [base, accent] = FLOORS.closet;
    ctx.fillStyle = css(base);
    ctx.fillRect(x, y, T, T);
    speckle(ctx, x, y, T, accent, 30, 13);
  },
  lounge: (ctx, x, y) => {
    const [base, accent] = FLOORS.lounge;
    ctx.fillStyle = css(base);
    ctx.fillRect(x, y, T, T);
    ctx.fillStyle = css(accent);
    for (let i = 0; i < 4; i++)
      for (let j = 0; j < 4; j++) ctx.fillRect(x + 6 + i * 16, y + 6 + j * 16, 4, 4);
  },
  boiler: (ctx, x, y) => {
    const [base, accent] = FLOORS.boiler;
    ctx.fillStyle = css(base);
    ctx.fillRect(x, y, T, T);
    ctx.strokeStyle = css(accent);
    ctx.lineWidth = 3;
    for (let i = -T; i < T; i += 12) {
      ctx.beginPath();
      ctx.moveTo(x + i, y + T);
      ctx.lineTo(x + i + T, y);
      ctx.stroke();
    }
  },
  doorway: (ctx, x, y) => {
    const [base, accent] = FLOORS.doorway;
    ctx.fillStyle = css(base);
    ctx.fillRect(x, y, T, T);
    ctx.fillStyle = css(accent);
    ctx.fillRect(x, y, T, 4);
    ctx.fillRect(x, y + T - 4, T, 4);
  },
  wall: (ctx, x, y) => {
    ctx.fillStyle = css(PALETTE.wall);
    ctx.fillRect(x, y, T, T);
    ctx.fillStyle = css(PALETTE.wallEdge);
    ctx.fillRect(x, y + T / 2, T, 2);
    ctx.fillRect(x + T / 2, y, 2, T / 2);
  },
  wallFace: (ctx, x, y) => {
    ctx.fillStyle = css(PALETTE.wall);
    ctx.fillRect(x, y, T, T);
    ctx.fillStyle = css(PALETTE.wallFace);
    ctx.fillRect(x, y + T * 0.55, T, T * 0.45);
    ctx.fillStyle = css(PALETTE.wallEdge);
    ctx.fillRect(x, y + T * 0.55, T, 3);
    ctx.fillRect(x + T / 3, y + T * 0.55, 2, T * 0.45);
  },
  parkingStripe: (ctx, x, y) => {
    TILE_DRAWERS.exterior(ctx, x, y);
    ctx.fillStyle = '#e8e8e8';
    ctx.fillRect(x, y + T / 2 - 3, T, 6);
  },
};

function generateTileset(scene: Phaser.Scene) {
  const cell = T + TILESET_SPACING;
  const w = TILESET_MARGIN * 2 + TILE_FRAME_COUNT * cell - TILESET_SPACING;
  const h = TILESET_MARGIN * 2 + T;
  canvasTexture(scene, ASSETS.tiles.key, w, h, (ctx) => {
    for (const [name, frame] of Object.entries(TILE_FRAMES)) {
      const x = TILESET_MARGIN + frame * cell;
      const y = TILESET_MARGIN;
      // Draw once oversized to extrude edges into the padding (prevents seams when zoomed)…
      const tmp = document.createElement('canvas');
      tmp.width = T;
      tmp.height = T;
      const tctx = tmp.getContext('2d')!;
      TILE_DRAWERS[name as keyof typeof TILE_FRAMES](tctx, 0, 0);
      ctx.drawImage(tmp, x - 1, y - 1, T + 2, T + 2);
      // …then crisp at the exact cell.
      ctx.drawImage(tmp, x, y);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// People (all face right, i.e. angle 0; sprites are rotated to face their heading)
// ---------------------------------------------------------------------------------------------

function drawWorker(ctx: Ctx, color: number) {
  const c = T / 2;
  ctx.lineWidth = 3;
  ctx.strokeStyle = css(shade(color, 0.45));
  // tool belt / shoulders
  ellipse(ctx, c - 2, c, 18, 25);
  ctx.fillStyle = css(color);
  ctx.fill();
  ctx.stroke();
  // reflective stripe
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(c - 8, c - 22, 4, 44);
  // head
  circle(ctx, c + 2, c, 11);
  ctx.fillStyle = css(PALETTE.skin);
  ctx.fill();
  // cap with brim pointing forward
  ctx.fillStyle = css(shade(color, 0.7));
  ctx.beginPath();
  ctx.arc(c + 1, c, 11, Math.PI * 0.5, Math.PI * 1.5);
  ctx.fill();
  roundRect(ctx, c + 6, c - 8, 10, 16, 4);
  ctx.fill();
}

function drawBoss(ctx: Ctx) {
  const c = T / 2;
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#1c2429';
  ellipse(ctx, c - 2, c, 21, 28);
  ctx.fillStyle = css(PALETTE.boss);
  ctx.fill();
  ctx.stroke();
  // shirt + tie
  ctx.fillStyle = '#eceff1';
  ctx.beginPath();
  ctx.moveTo(c + 6, c - 10);
  ctx.lineTo(c + 18, c);
  ctx.lineTo(c + 6, c + 10);
  ctx.fill();
  ctx.fillStyle = css(PALETTE.bossTie);
  ctx.beginPath();
  ctx.moveTo(c + 9, c - 4);
  ctx.lineTo(c + 22, c);
  ctx.lineTo(c + 9, c + 4);
  ctx.fill();
  // bald head with comb-over
  circle(ctx, c + 1, c, 13);
  ctx.fillStyle = '#e8b48a';
  ctx.fill();
  ctx.strokeStyle = '#5d4037';
  ctx.lineWidth = 2;
  for (let i = -6; i <= 6; i += 4) {
    ctx.beginPath();
    ctx.moveTo(c - 8, c + i);
    ctx.lineTo(c + 6, c + i * 0.8);
    ctx.stroke();
  }
}

function drawStudent(ctx: Ctx) {
  const c = T / 2;
  // backpack
  roundRect(ctx, c - 20, c - 11, 12, 22, 4);
  ctx.fillStyle = css(PALETTE.backpack);
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#7a6a2a';
  ellipse(ctx, c - 2, c, 13, 18);
  ctx.fillStyle = css(PALETTE.student);
  ctx.fill();
  ctx.stroke();
  circle(ctx, c + 2, c, 9);
  ctx.fillStyle = css(PALETTE.skin);
  ctx.fill();
  ctx.fillStyle = '#4e342e';
  ctx.beginPath();
  ctx.arc(c + 1, c, 9, Math.PI * 0.55, Math.PI * 1.45);
  ctx.fill();
}

function drawCoworker(ctx: Ctx) {
  // lying on a blanket, head to the left
  roundRect(ctx, 4, 14, T - 8, T - 28, 8);
  ctx.fillStyle = '#7e57c2';
  ctx.fill();
  ctx.fillStyle = '#9575cd';
  for (let x = 10; x < T - 10; x += 12) ctx.fillRect(x, 16, 4, T - 32);
  circle(ctx, 16, T / 2, 10);
  ctx.fillStyle = css(PALETTE.skin);
  ctx.fill();
  ctx.strokeStyle = '#3e2723';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(12, T / 2 - 3);
  ctx.lineTo(16, T / 2 - 2);
  ctx.moveTo(12, T / 2 + 3);
  ctx.lineTo(16, T / 2 + 2);
  ctx.stroke();
}

// ---------------------------------------------------------------------------------------------
// Fixtures & props
// ---------------------------------------------------------------------------------------------

const FIXTURE_DRAWERS: Record<string, (ctx: Ctx, color: number) => void> = {
  'copper-pile': (ctx, color) => {
    for (let i = 0; i < 6; i++) {
      roundRect(ctx, 8 + (i % 3) * 14, 16 + Math.floor(i / 3) * 16 + (i % 2) * 4, 26, 10, 5);
      ctx.fillStyle = css(shade(color, 0.8 + (i % 3) * 0.15));
      ctx.fill();
      ctx.strokeStyle = css(shade(color, 0.5));
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    circle(ctx, 40, 46, 9);
    ctx.lineWidth = 4;
    ctx.strokeStyle = css(shade(color, 1.1));
    ctx.stroke();
  },
  'drinking-fountain': (ctx) => {
    roundRect(ctx, 10, 10, 44, 44, 8);
    ctx.fillStyle = '#b0bec5';
    ctx.fill();
    ctx.strokeStyle = '#607d8b';
    ctx.lineWidth = 3;
    ctx.stroke();
    ellipse(ctx, 32, 34, 14, 12);
    ctx.fillStyle = '#78909c';
    ctx.fill();
    circle(ctx, 32, 34, 5);
    ctx.fillStyle = '#4fc3f7';
    ctx.fill();
    ctx.fillStyle = css(PALETTE.brass);
    ctx.fillRect(29, 14, 6, 12);
  },
  'wall-heater': (ctx, color) => {
    roundRect(ctx, 6, 14, 52, 36, 6);
    ctx.fillStyle = css(color);
    ctx.fill();
    ctx.strokeStyle = css(shade(color, 0.5));
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = css(shade(color, 0.6));
    for (let x = 12; x < 54; x += 7) ctx.fillRect(x, 20, 3, 24);
  },
  'air-line': (ctx, color) => {
    ctx.strokeStyle = css(color);
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(4, 22);
    ctx.lineTo(60, 22);
    ctx.moveTo(4, 42);
    ctx.lineTo(60, 42);
    ctx.stroke();
    circle(ctx, 32, 32, 13);
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#e53935';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(19, 32);
    ctx.lineTo(45, 32);
    ctx.moveTo(32, 19);
    ctx.lineTo(32, 45);
    ctx.stroke();
  },
  radiator: (ctx, color) => {
    roundRect(ctx, 6, 18, 52, 28, 4);
    ctx.fillStyle = css(color);
    ctx.fill();
    ctx.fillStyle = css(shade(color, 0.7));
    for (let x = 10; x < 56; x += 6) ctx.fillRect(x, 18, 3, 28);
  },
  toilet: (ctx) => {
    roundRect(ctx, 14, 6, 36, 14, 4);
    ctx.fillStyle = '#eceff1';
    ctx.fill();
    ctx.strokeStyle = '#90a4ae';
    ctx.lineWidth = 3;
    ctx.stroke();
    ellipse(ctx, 32, 38, 15, 19);
    ctx.fillStyle = '#fafafa';
    ctx.fill();
    ctx.stroke();
    ellipse(ctx, 32, 40, 8, 11);
    ctx.fillStyle = '#b3e5fc';
    ctx.fill();
  },
  'mop-sink': (ctx) => {
    roundRect(ctx, 8, 8, 48, 48, 4);
    ctx.fillStyle = '#90a4ae';
    ctx.fill();
    roundRect(ctx, 14, 14, 36, 36, 3);
    ctx.fillStyle = '#607d8b';
    ctx.fill();
    ctx.strokeStyle = '#a1887f';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(18, 46);
    ctx.lineTo(50, 10);
    ctx.stroke();
  },
  lamp: (ctx, color) => {
    circle(ctx, 32, 32, 22);
    ctx.fillStyle = 'rgba(255, 241, 118, 0.25)';
    ctx.fill();
    circle(ctx, 32, 32, 12);
    ctx.fillStyle = css(color);
    ctx.fill();
    ctx.strokeStyle = '#8d6e63';
    ctx.lineWidth = 3;
    ctx.stroke();
    circle(ctx, 32, 32, 4);
    ctx.fillStyle = '#d9822b';
    ctx.fill();
  },
  desk: (ctx, color) => {
    roundRect(ctx, 8, 10, 48, 30, 4);
    ctx.fillStyle = css(color);
    ctx.fill();
    ctx.strokeStyle = css(shade(color, 0.6));
    ctx.lineWidth = 3;
    ctx.stroke();
    roundRect(ctx, 20, 44, 24, 14, 4);
    ctx.fillStyle = '#78909c';
    ctx.fill();
  },
};

function drawVan(ctx: Ctx, w: number, h: number) {
  roundRect(ctx, 4, 6, w - 8, h - 12, 18);
  ctx.fillStyle = css(PALETTE.van);
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = css(PALETTE.vanDark);
  ctx.stroke();
  // windshield (front faces the school, to the right)
  roundRect(ctx, w - 46, 16, 26, h - 32, 8);
  ctx.fillStyle = css(PALETTE.glass);
  ctx.fill();
  // roof rack
  ctx.fillStyle = css(PALETTE.vanDark);
  for (let x = 24; x < w - 60; x += 18) ctx.fillRect(x, 14, 4, h - 28);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('COPPER CO.', (w - 50) / 2 + 4, h / 2);
}

function drawLockedDoor(ctx: Ctx) {
  ctx.fillStyle = css(PALETTE.door);
  ctx.fillRect(0, 0, T, T);
  ctx.fillStyle = css(PALETTE.doorDark);
  ctx.fillRect(4, 4, T - 8, 4);
  ctx.fillRect(4, T - 8, T - 8, 4);
  // padlock
  ctx.strokeStyle = css(PALETTE.brass);
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(T / 2, T / 2 - 4, 8, Math.PI, 0);
  ctx.stroke();
  roundRect(ctx, T / 2 - 12, T / 2 - 4, 24, 18, 3);
  ctx.fillStyle = css(PALETTE.brass);
  ctx.fill();
  ctx.fillStyle = '#3e2723';
  ctx.fillRect(T / 2 - 2, T / 2 + 1, 4, 8);
}

function drawScrapBag(ctx: Ctx) {
  const s = 40;
  ellipse(ctx, s / 2, s / 2 + 4, 15, 14);
  ctx.fillStyle = '#8d6e63';
  ctx.fill();
  ctx.strokeStyle = '#4e342e';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#d9822b';
  ctx.fillRect(s / 2 - 6, 4, 4, 12);
  ctx.fillRect(s / 2 + 2, 2, 4, 14);
}

/** Generate every placeholder texture that doesn't already exist (loaded art wins). */
export function generatePlaceholderTextures(scene: Phaser.Scene) {
  generateTileset(scene);
  for (const c of CHARACTERS.all) {
    canvasTexture(scene, characterAsset(c.id).key, T, T, (ctx) => drawWorker(ctx, c.color));
  }
  canvasTexture(scene, ASSETS.boss.key, T, T, drawBoss);
  canvasTexture(scene, ASSETS.student.key, T, T, drawStudent);
  canvasTexture(scene, ASSETS.coworker.key, T, T, drawCoworker);
  for (const f of FIXTURES.all) {
    const draw =
      FIXTURE_DRAWERS[f.id] ??
      ((ctx: Ctx, color: number) => {
        roundRect(ctx, 10, 10, 44, 44, 8);
        ctx.fillStyle = css(color);
        ctx.fill();
      });
    canvasTexture(scene, fixtureAsset(f.id).key, T, T, (ctx) => draw(ctx, f.color));
  }
  canvasTexture(scene, ASSETS.van.key, T * 3, T * 2, (ctx) => drawVan(ctx, T * 3, T * 2));
  canvasTexture(scene, ASSETS.lockedDoor.key, T, T, drawLockedDoor);
  canvasTexture(scene, ASSETS.scrapBag.key, 40, 40, drawScrapBag);
}
