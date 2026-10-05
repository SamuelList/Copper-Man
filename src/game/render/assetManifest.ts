import { CHARACTERS } from '@core/content/characters';
import { FIXTURES } from '@core/content/fixtures';

/**
 * Textures are rendered at TEX_SCALE× and displayed at 1/TEX_SCALE so placeholders stay crisp
 * under camera zoom.
 */
export const TEX_SCALE = 2;

/**
 * Logical asset keys. Every visual the game uses goes through this table so placeholder
 * art can be swapped for real sprites by adding a `url` — no game code changes needed.
 */
export interface AssetEntry {
  key: string;
  /** When set, BootScene loads this image instead of generating a placeholder. */
  url?: string;
}

export const ASSETS = {
  tiles: { key: 'tiles' },
  boss: { key: 'boss' },
  student: { key: 'student' },
  coworker: { key: 'coworker' },
  van: { key: 'van' },
  lockedDoor: { key: 'door-locked' },
  scrapBag: { key: 'scrap-bag' },
} satisfies Record<string, AssetEntry>;

export const characterAsset = (id: string): AssetEntry => ({ key: `char-${id}` });
export const fixtureAsset = (id: string): AssetEntry => ({ key: `fixture-${id}` });

export const ALL_CHARACTER_ASSETS = () => CHARACTERS.all.map((c) => characterAsset(c.id));
export const ALL_FIXTURE_ASSETS = () => FIXTURES.all.map((f) => fixtureAsset(f.id));

/** Frame indices in the generated tileset. */
export const TILE_FRAMES = {
  exterior: 0,
  hallway: 1,
  classroom: 2,
  restroom: 3,
  closet: 4,
  lounge: 5,
  boiler: 6,
  doorway: 7,
  wall: 8,
  wallFace: 9,
  parkingStripe: 10,
} as const;

export const TILE_FRAME_COUNT = Object.keys(TILE_FRAMES).length;
