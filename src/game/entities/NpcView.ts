import type { Vec2 } from '@core/model/types';
import type Phaser from 'phaser';
import { TEX_SCALE } from '../render/assetManifest';
import { DEPTH } from '../render/depth';

export interface NpcVisual {
  pos: Vec2;
  facing: number;
  /** '' hides the status icon. */
  icon: string;
  iconColor?: string;
}

/** Sprite + status icon ("?" / "!") for the boss and students. */
export class NpcView {
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly icon: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, textureKey: string, tint?: number) {
    this.sprite = scene.add
      .image(0, 0, textureKey)
      .setScale(1 / TEX_SCALE)
      .setDepth(DEPTH.npc);
    if (tint !== undefined) this.sprite.setTint(tint);
    this.icon = scene.add
      .text(0, 0, '', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '28px',
        fontStyle: 'bold',
        color: '#ffeb3b',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5, 1)
      .setScale(0.5)
      .setDepth(DEPTH.icons);
  }

  sync(v: NpcVisual, time: number) {
    this.sprite.setPosition(v.pos.x, v.pos.y).setRotation(v.facing);
    const bob = Math.sin(time / 120) * 1.5;
    this.icon
      .setText(v.icon)
      .setColor(v.iconColor ?? '#ffeb3b')
      .setPosition(v.pos.x, v.pos.y - 16 + bob);
  }
}
