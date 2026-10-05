import type { ShiftSession } from '@core/session/ShiftSession';
import { bagTotal } from '@core/systems/bag';
import type Phaser from 'phaser';
import { ASSETS, characterAsset, TEX_SCALE } from '../render/assetManifest';
import { DEPTH } from '../render/depth';

export class PlayerView {
  readonly sprite: Phaser.GameObjects.Image;
  private readonly bag: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, characterId: string) {
    this.sprite = scene.add
      .image(0, 0, characterAsset(characterId).key)
      .setScale(1 / TEX_SCALE)
      .setDepth(DEPTH.player);
    this.bag = scene.add
      .image(0, 0, ASSETS.scrapBag.key)
      .setScale(1 / TEX_SCALE)
      .setDepth(DEPTH.player + 0.1);
  }

  sync(session: ShiftSession, time: number) {
    const p = session.player;
    this.sprite.setPosition(p.pos.x, p.pos.y).setRotation(p.facing);

    let alpha = 1;
    if (p.grace > 0) alpha = Math.floor(time / 120) % 2 === 0 ? 0.35 : 0.9;
    else if (p.abilityActive > 0) alpha = 0.5;
    this.sprite.setAlpha(alpha);

    const carrying = bagTotal(session.bag) > 0;
    this.bag
      .setVisible(carrying)
      .setAlpha(alpha)
      .setPosition(p.pos.x - Math.cos(p.facing) * 11, p.pos.y - Math.sin(p.facing) * 11);
  }
}
