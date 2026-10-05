import type { BossMode } from '@core/ai/bossBrain';
import { TILE_SIZE } from '@core/content/balance';
import type { ShiftSession } from '@core/session/ShiftSession';
import { visionPolygon, type ViewCone } from '@core/systems/vision';
import type Phaser from 'phaser';
import { DEPTH } from '../render/depth';
import { PALETTE } from '../render/palette';

const BOSS_CONE: Record<BossMode, [number, number]> = {
  patrol: [PALETTE.coneBoss, 0.16],
  return: [PALETTE.coneBoss, 0.16],
  suspicious: [0xffb74d, 0.26],
  investigate: [0xffb74d, 0.22],
  search: [0xffb74d, 0.22],
  chase: [PALETTE.coneBossAlert, 0.3],
};

/** Wall-occluded vision cones, recomputed every frame from the simulation. */
export class VisionLayer {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.cones);
  }

  private cone(cone: ViewCone, session: ShiftSession, color: number, alpha: number) {
    const pts = visionPolygon(session.grid, cone, 28);
    const g = this.g;
    g.fillStyle(color, alpha);
    g.beginPath();
    g.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
    g.closePath();
    g.fillPath();
  }

  sync(session: ShiftSession) {
    this.g.clear();
    for (const s of session.students) {
      const alarmed = s.mode === 'alarmed';
      this.cone(
        session.studentCone(s),
        session,
        alarmed ? PALETTE.coneBossAlert : PALETTE.coneStudent,
        alarmed ? 0.22 : 0.1 + s.detection * 0.15,
      );
    }
    const [color, alpha] = BOSS_CONE[session.boss.mode];
    this.cone(session.bossCone(), session, color, alpha + session.boss.detection * 0.1);
  }
}

/** Focus highlight, hold-to-interact progress ring, and fixture recharge pies. */
export class InteractionOverlay {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(DEPTH.overlay);
  }

  sync(session: ShiftSession, time: number) {
    const g = this.g;
    g.clear();

    for (const f of session.fixtures) {
      if (f.rechargeLeft <= 0) continue;
      const frac = f.rechargeLeft / f.rechargeTotal;
      g.fillStyle(0x000000, 0.45);
      g.slice(f.pos.x, f.pos.y, 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
      g.fillPath();
    }

    const target = session.currentTarget;
    if (target) {
      const pulse = 0.55 + Math.sin(time / 160) * 0.25;
      const half = TILE_SIZE / 2 + 1;
      g.lineStyle(2, target.enabled ? PALETTE.highlight : 0x9e9e9e, target.enabled ? pulse : 0.5);
      g.strokeRoundedRect(target.pos.x - half, target.pos.y - half, half * 2, half * 2, 5);
    }

    const active = session.interaction;
    if (active) {
      const p = session.player.pos;
      const frac = Math.min(1, active.elapsed / active.target.duration);
      g.lineStyle(4, 0x000000, 0.5);
      g.strokeCircle(p.x, p.y - 22, 8);
      g.lineStyle(4, PALETTE.progress, 1);
      g.beginPath();
      g.arc(p.x, p.y - 22, 8, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac, false);
      g.strokePath();
    }
  }
}
