import type { TilePos } from '../model/types';

/** Base tile kinds. Fixtures, props, doors and the van are tracked separately but also occupy tiles. */
export type TileKind = 'wall' | 'floor' | 'door' | 'lockedDoor' | 'van' | 'fixture' | 'prop';

export type RoomKind =
  'exterior' | 'hallway' | 'classroom' | 'restroom' | 'closet' | 'lounge' | 'boiler';

export interface TileRect {
  col: number;
  row: number;
  w: number;
  h: number;
}

export interface RoomDef {
  id: string;
  name: string;
  kind: RoomKind;
  rect: TileRect;
  /** 0..1 light level; defaults to BALANCE.light.byRoomKind[kind]. */
  light?: number;
}

export interface LevelFixture {
  id: string;
  defId: string;
  tile: TilePos;
}

export interface LevelProp {
  id: string;
  defId: string;
  tile: TilePos;
}

export interface LevelDoor {
  id: string;
  tile: TilePos;
  locked: boolean;
}

/**
 * Renderer- and source-agnostic level description. Produced today by the ASCII parser;
 * a Tiled JSON loader can produce the same shape later.
 */
export interface LevelDef {
  id: string;
  name: string;
  cols: number;
  rows: number;
  /** Row-major, length cols * rows. */
  tiles: TileKind[];
  rooms: RoomDef[];
  fixtures: LevelFixture[];
  props: LevelProp[];
  doors: LevelDoor[];
  vanTiles: TilePos[];
  playerSpawn: TilePos;
  bossRoute: TilePos[];
  studentSpawns: TilePos[];
  coworkerSpots: TilePos[];
}
