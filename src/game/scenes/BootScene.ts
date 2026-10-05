import Phaser from 'phaser';
import {
  ALL_CHARACTER_ASSETS,
  ALL_FIXTURE_ASSETS,
  ASSETS,
  type AssetEntry,
} from '../render/assetManifest';
import { generatePlaceholderTextures } from '../render/textures';

export const SCENE_KEYS = { boot: 'boot', shift: 'shift' } as const;

/** Loads any real art from the manifest, then fills every gap with generated placeholders. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENE_KEYS.boot);
  }

  preload() {
    const entries: AssetEntry[] = [
      ...Object.values(ASSETS),
      ...ALL_CHARACTER_ASSETS(),
      ...ALL_FIXTURE_ASSETS(),
    ];
    for (const entry of entries) {
      if (entry.url) this.load.image(entry.key, entry.url);
    }
  }

  create() {
    generatePlaceholderTextures(this);
    this.scene.start(SCENE_KEYS.shift);
  }
}
