import { TILE_SIZE } from '@core/content/balance';
import type { ShiftSession } from '@core/session/ShiftSession';
import type { CoworkerState, DoorState, FixtureState } from '@core/session/types';
import type Phaser from 'phaser';
import { ASSETS, fixtureAsset, TEX_SCALE } from '../render/assetManifest';
import { DEPTH } from '../render/depth';

export class FixtureView {
  private readonly image: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    readonly state: FixtureState,
  ) {
    this.image = scene.add
      .image(state.pos.x, state.pos.y, fixtureAsset(state.def.id).key)
      .setScale(1 / TEX_SCALE)
      .setDepth(DEPTH.props);
  }

  sync() {
    this.image.setAlpha(this.state.rechargeLeft > 0 ? 0.35 : 1);
  }
}

export class DoorView {
  private readonly image: Phaser.GameObjects.Image;

  constructor(
    scene: Phaser.Scene,
    readonly state: DoorState,
  ) {
    this.image = scene.add
      .image(
        (state.tile.col + 0.5) * TILE_SIZE,
        (state.tile.row + 0.5) * TILE_SIZE,
        ASSETS.lockedDoor.key,
      )
      .setScale(1 / TEX_SCALE)
      .setDepth(DEPTH.props);
  }

  sync() {
    this.image.setVisible(this.state.locked);
  }
}

export function createVanView(scene: Phaser.Scene, session: ShiftSession) {
  const tiles = session.level.vanTiles;
  if (tiles.length === 0) return;
  const minCol = Math.min(...tiles.map((t) => t.col));
  const maxCol = Math.max(...tiles.map((t) => t.col));
  const minRow = Math.min(...tiles.map((t) => t.row));
  const maxRow = Math.max(...tiles.map((t) => t.row));
  scene.add
    .image(minCol * TILE_SIZE, minRow * TILE_SIZE, ASSETS.van.key)
    .setOrigin(0, 0)
    .setDisplaySize((maxCol - minCol + 1) * TILE_SIZE, (maxRow - minRow + 1) * TILE_SIZE)
    .setDepth(DEPTH.props);
}

export class CoworkerView {
  private readonly image: Phaser.GameObjects.Image;
  private readonly zzz: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    readonly state: CoworkerState,
  ) {
    this.image = scene.add
      .image(state.pos.x, state.pos.y, ASSETS.coworker.key)
      .setScale(1 / TEX_SCALE)
      .setDepth(DEPTH.coworker);
    this.zzz = scene.add
      .text(state.pos.x, state.pos.y, 'z Z z', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        fontStyle: 'bold',
        color: '#d1c4e9',
        stroke: '#311b92',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setScale(0.5)
      .setDepth(DEPTH.icons);
  }

  sync(time: number) {
    this.image.setAlpha(this.state.found ? 0.6 : 1);
    this.zzz
      .setText(this.state.found ? '♥' : 'z Z z')
      .setColor(this.state.found ? '#ff8a80' : '#d1c4e9')
      .setPosition(this.state.pos.x + 6, this.state.pos.y - 10 + Math.sin(time / 400) * 3);
  }
}
