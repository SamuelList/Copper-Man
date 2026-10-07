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
  coneTeacher: 0xd59cff,
  coneCustodian: 0x9ccc65,
  ghostBoss: 0xff7a6e,
  ghostStudent: 0x8fe9ff,
  ghostTeacher: 0xe1b8ff,
  ghostCustodian: 0xc5e1a5,
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
  office: [0x5d6b7a, 0x536170],
  library: [0x7a3b3b, 0x6e3434],
  lab: [0xcfd6d8, 0x37474f],
  gym: [0xd9a866, 0xc8955a],
  cafeteria: [0xe8e2d0, 0xc9442f],
  kitchen: [0xb33a2e, 0x9e3328],
  mechanical: [0x6b6f73, 0x5c6064],
  doorway: [0xa1887f, 0x8d6e63],
};

/** Shirt colours for students so the crowd isn't uniform. */
export const STUDENT_SHIRTS = [
  0xffca28, 0xff8a65, 0x4fc3f7, 0x81c784, 0xba68c8, 0xf06292, 0xaed581,
];
