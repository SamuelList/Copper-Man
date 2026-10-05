import type { RoomKind } from '@core/level/types';

export const css = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;

export const PALETTE = {
  background: 0x14161a,
  wall: 0x3b3f4a,
  wallFace: 0x565c6b,
  wallEdge: 0x2a2d35,
  door: 0x8d6e63,
  doorDark: 0x5d4037,
  brass: 0xd4af37,
  skin: 0xf1c27d,
  boss: 0x37474f,
  bossTie: 0xe53935,
  student: 0xffca28,
  backpack: 0x5c6bc0,
  van: 0x43a047,
  vanDark: 0x2e7d32,
  glass: 0xa5d6f7,
  coneBoss: 0xfff59d,
  coneBossAlert: 0xff5252,
  coneStudent: 0x80deea,
  highlight: 0xffffff,
  progress: 0xffb74d,
} as const;

/** Floor colours per room kind: [base, accent]. */
export const FLOORS: Record<RoomKind | 'doorway', [number, number]> = {
  exterior: [0x2f3236, 0x3a3e43],
  hallway: [0xc9c3b6, 0xbdb6a8],
  classroom: [0xb08a5a, 0xa27d50],
  restroom: [0xdfe7ea, 0xb7c4c9],
  closet: [0x8a8d91, 0x7d8085],
  lounge: [0x6d5a7a, 0x645271],
  boiler: [0x4a4f55, 0x3e4247],
  doorway: [0xa1887f, 0x8d6e63],
};
