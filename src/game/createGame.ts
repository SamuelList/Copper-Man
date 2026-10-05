import Phaser from 'phaser';
import { PALETTE } from './render/palette';
import { BootScene } from './scenes/BootScene';
import { PARAMS_KEY, ShiftScene, type ShiftSceneParams } from './scenes/ShiftScene';

export function createGame(parent: HTMLElement, params: ShiftSceneParams): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    backgroundColor: PALETTE.background,
    banner: false,
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth || 1280,
      height: parent.clientHeight || 720,
    },
    render: { antialias: true },
    callbacks: {
      preBoot: (game) => {
        game.registry.set(PARAMS_KEY, params);
      },
    },
    scene: [BootScene, ShiftScene],
  });
}
