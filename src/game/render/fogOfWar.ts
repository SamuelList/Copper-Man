import { BALANCE } from '@core/content/balance';
import type { ShiftSession } from '@core/session/ShiftSession';
import { visibilityOutline } from '@core/systems/vision';
import * as THREE from 'three';
import { toWorld } from './coords';

/** Fog texture resolution, in texels per tile (linear filtering softens the edge). */
const RES = 6;

/**
 * The player's fog of war. Each frame the exact visibility outline (from core) is painted into a
 * floor-plan texture; the world shading darkens everything outside it.
 */
export class FogOfWar {
  readonly texture: THREE.CanvasTexture;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly canvas: HTMLCanvasElement;

  constructor(cols: number, rows: number) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = cols * RES;
    this.canvas.height = rows * RES;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
  }

  update(session: ShiftSession) {
    const { ctx, canvas } = this;
    const origin = session.player.pos;
    const outline = visibilityOutline(
      session.grid,
      session.grid.sightCorners,
      origin,
      BALANCE.player.sightRange,
    );
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (outline.length < 3) return;

    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#fff';
    ctx.lineJoin = 'round';
    // Dilate a little so the faces of walls bounding the visible area stay lit.
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
    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}
