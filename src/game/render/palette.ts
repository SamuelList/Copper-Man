import type { RoomKind } from '@core/level/types';

export const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

/** Colours for the low-poly diorama. Content colours (characters, metals) live in core/content. */
export const PALETTE = {
  background: 0x15171c,
  slab: 0x2a2622,
  grass: 0x4d6b3c,
  wallSide: 0xe4dccd,
  wallTop: 0x4a4540,
  wallDado: 0x7d9a93,
  baseboard: 0x6b5d50,
  door: 0x8d6e63,
  brass: 0xd4af37,
  skin: 0xf1c27d,
  bossSuit: 0x3f4a52,
  bossTie: 0xd84339,
  shirt: 0xf3f1ea,
  pants: 0x34495e,
  van: 0x43a047,
  vanDark: 0x2e7d32,
  glass: 0x9ec9e8,
  tire: 0x222222,
  steel: 0x9aa4ad,
  steelDark: 0x5f6870,
  wood: 0xa47a52,
  woodDark: 0x7a5636,
  coneBoss: 0xffe082,
  coneSuspicious: 0xffa726,
  coneChase: 0xff4436,
  coneStudent: 0x6fe3ff,
  ghostBoss: 0xff7a6e,
  ghostStudent: 0x8fe9ff,
  focus: 0xffffff,
  focusDisabled: 0x9e9e9e,
  progress: 0xffb74d,
  spark: 0xffb347,
  boilerGlow: 0xff6a2a,
} as const;

/** Floor colours per room kind: [base, accent]. */
export const FLOORS: Record<RoomKind | 'doorway', [number, number]> = {
  exterior: [0x3a3d42, 0x45494f],
  hallway: [0xd8d2c4, 0xc4bcab],
  classroom: [0xb98c5a, 0xa57a4c],
  restroom: [0xe3eaec, 0xbfcbd0],
  closet: [0x8e9196, 0x80838a],
  lounge: [0x6f5d80, 0x655376],
  boiler: [0x55595f, 0x474b50],
  doorway: [0xa1887f, 0x8d6e63],
};

/** Shirt colours for students so the crowd isn't uniform. */
export const STUDENT_SHIRTS = [
  0xffca28, 0xff8a65, 0x4fc3f7, 0x81c784, 0xba68c8, 0xf06292, 0xaed581,
];
