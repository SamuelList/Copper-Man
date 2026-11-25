import { BALANCE, TILE_SIZE } from '@core/content/balance';
import type { ShiftSession } from '@core/session/ShiftSession';
import type { ExploredMap } from '@core/systems/exploration';
import { visibilityOutline } from '@core/systems/vision';
import type { Vec2 } from '@core/model/types';
import * as THREE from 'three';
import { toWorld } from './coords';

/** Fog texture resolution, in texels per tile (linear filtering softens the edge). */
const RES = 6;
/** Remembered-but-out-of-sight is drawn at this level; unexplored is 0, in sight is 1. */
const REMEMBERED = 0.5;
/** Moving less than this (a quarter of a fog texel) can't change the picture. */
const MOVED = TILE_SIZE / RES / 4;

/**
 * The player's fog of war, in three states: never seen (pitch black), seen before (greyed
 * memory) and in sight right now. A memory canvas starts from the explored map saved with the
 * career and gains every visibility outline; each frame the fog texture is the memory at half
 * brightness with the current view painted on top.
 */
export class FogOfWar {
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;
  private readonly memory: HTMLCanvasElement;
  private readonly memoryCtx: CanvasRenderingContext2D;
  /** Where the player stood when the fog was last drawn; null means draw it whatever. */
  private from: Vec2 | null = null;

  constructor(cols: number, rows: number, explored: ExploredMap) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = cols * RES;
    this.canvas.height = rows * RES;
    this.ctx = this.canvas.getContext('2d')!;
    this.memory = document.createElement('canvas');
    this.memory.width = this.canvas.width;
    this.memory.height = this.canvas.height;
    this.memoryCtx = this.memory.getContext('2d')!;
    this.memoryCtx.fillStyle = '#000';
    this.memoryCtx.fillRect(0, 0, this.memory.width, this.memory.height);
    this.memoryCtx.fillStyle = '#fff';
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (explored.has(col, row)) this.memoryCtx.fillRect(col * RES, row * RES, RES, RES);
      }
    }
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
  }

  /** What the player can see has changed without them moving (a door came open). */
  invalidate() {
    this.from = null;
  }

  /**
   * Bring the fog up to date. Most frames of a stealth game are spent standing still (waiting
   * for someone to pass, working on a fixture), and then there is nothing to do: the view is
   * only worked out, painted and sent to the graphics card again when it could have changed.
   */
  update(session: ShiftSession) {
    const { ctx, canvas } = this;
    const fresh = session.explored.takeFresh();
    const at = session.player.pos;
    const still = this.from !== null && Math.hypot(at.x - this.from.x, at.y - this.from.y) < MOVED;
    if (still && fresh.length === 0) return;
    this.from = { x: at.x, y: at.y };
    const outline = visibilityOutline(
      session.grid,
      session.grid.sightCorners,
      session.player.pos,
      BALANCE.player.sightRange,
    );
    if (outline.length >= 3) this.paint(this.memoryCtx, outline);
    // Also whatever core counts as seen: the blockers bordering your view (walls, the van…),
    // whose tops lie outside the outline itself.
    const cols = session.explored.cols;
    this.memoryCtx.fillStyle = '#fff';
    for (const i of fresh) {
      this.memoryCtx.fillRect((i % cols) * RES, Math.floor(i / cols) * RES, RES, RES);
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = REMEMBERED;
    ctx.drawImage(this.memory, 0, 0);
    ctx.globalAlpha = 1;
    if (outline.length >= 3) this.paint(ctx, outline);
    this.texture.needsUpdate = true;
  }

  /** Fill a visibility outline in white, dilated a little so bounding wall faces stay lit. */
  private paint(ctx: CanvasRenderingContext2D, outline: readonly Vec2[]) {
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineJoin = 'round';
    ctx.lineWidth = RES * 1.1;
    ctx.beginPath();
    outline.forEach((p, i) => {
      const x = toWorld(p.x) * RES;
      const y = toWorld(p.y) * RES;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  dispose() {
    this.texture.dispose();
  }
}
