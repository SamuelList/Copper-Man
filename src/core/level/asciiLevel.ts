import { BALANCE } from '../content/balance';
import { fixtureByGlyph } from '../content/fixtures';
import { propByGlyph } from '../content/props';
import type { TilePos } from '../model/types';
import { findPath } from '../systems/pathfinding';
import type { LevelDef, LevelDoor, LevelFixture, LevelProp, RoomDef, TileKind } from './types';

/**
 * ASCII level format.
 *
 *   #  wall              .  floor            =  outdoor floor (rendered by room kind)
 *   D  open doorway      L  locked door      V  van (deposit point)
 *   P  player spawn      S  student spawn    Z  sleepy-coworker hiding spot
 *   1-9  boss patrol waypoint markers (ordered by `bossRoute`)
 *   any fixture glyph from FIXTURES (C F H A R T M l k …) — scrappable
 *   any prop glyph from PROPS (O B h t b p …) — furniture: tall blocks sight, low is cover
 */
export interface AsciiLevelSource {
  id: string;
  name: string;
  map: readonly string[];
  rooms: readonly RoomDef[];
  /** Waypoint marker characters in patrol order; the route loops. */
  bossRoute: string;
}

export function parseAsciiLevel(src: AsciiLevelSource): LevelDef {
  const rows = src.map.length;
  const cols = src.map[0]?.length ?? 0;
  src.map.forEach((line, row) => {
    if (line.length !== cols) {
      throw new Error(`Level "${src.id}" row ${row} has length ${line.length}, expected ${cols}`);
    }
  });

  const tiles: TileKind[] = [];
  const fixtures: LevelFixture[] = [];
  const props: LevelProp[] = [];
  const doors: LevelDoor[] = [];
  const vanTiles: TilePos[] = [];
  const studentSpawns: TilePos[] = [];
  const coworkerSpots: TilePos[] = [];
  const markers = new Map<string, TilePos>();
  let playerSpawn: TilePos | null = null;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ch = src.map[row]![col]!;
      const tile = { col, row };
      let kind: TileKind = 'floor';
      if (ch === '#') kind = 'wall';
      else if (ch === 'D') {
        kind = 'door';
        doors.push({ id: `door-${col}-${row}`, tile, locked: false });
      } else if (ch === 'L') {
        kind = 'lockedDoor';
        doors.push({ id: `door-${col}-${row}`, tile, locked: true });
      } else if (ch === 'V') {
        kind = 'van';
        vanTiles.push(tile);
      } else if (ch === 'P') playerSpawn = tile;
      else if (ch === 'S') studentSpawns.push(tile);
      else if (ch === 'Z') coworkerSpots.push(tile);
      else if (/[1-9]/.test(ch)) {
        if (markers.has(ch)) throw new Error(`Level "${src.id}" has duplicate marker "${ch}"`);
        markers.set(ch, tile);
      } else if (ch !== '.' && ch !== '=') {
        const fixture = fixtureByGlyph(ch);
        const prop = fixture ? undefined : propByGlyph(ch);
        if (fixture) {
          kind = 'fixture';
          fixtures.push({ id: `${fixture.id}-${col}-${row}`, defId: fixture.id, tile });
        } else if (prop) {
          kind = 'prop';
          props.push({ id: `${prop.id}-${col}-${row}`, defId: prop.id, tile });
        } else {
          throw new Error(`Level "${src.id}" has unknown glyph "${ch}" at ${col},${row}`);
        }
      }
      tiles.push(kind);
    }
  }

  if (!playerSpawn) throw new Error(`Level "${src.id}" has no player spawn (P)`);
  const bossRoute = [...src.bossRoute].map((ch) => {
    const tile = markers.get(ch);
    if (!tile) throw new Error(`Level "${src.id}" boss route references missing marker "${ch}"`);
    return tile;
  });

  return {
    id: src.id,
    name: src.name,
    cols,
    rows,
    tiles,
    rooms: [...src.rooms],
    fixtures,
    props,
    doors,
    vanTiles,
    playerSpawn,
    bossRoute,
    studentSpawns,
    coworkerSpots,
  };
}

export const tileAt = (level: LevelDef, col: number, row: number): TileKind =>
  col < 0 || row < 0 || col >= level.cols || row >= level.rows
    ? 'wall'
    : level.tiles[row * level.cols + col]!;

/** Where people can stand: floor and doorways. Locked doors are optional (keys / unlocking). */
export const isWalkableTile = (kind: TileKind, throughLocked: boolean) =>
  kind === 'floor' || kind === 'door' || (throughLocked && kind === 'lockedDoor');

export function roomAt(level: LevelDef, col: number, row: number): RoomDef | undefined {
  return level.rooms.find(
    (r) =>
      col >= r.rect.col &&
      row >= r.rect.row &&
      col < r.rect.col + r.rect.w &&
      row < r.rect.row + r.rect.h,
  );
}

/** Light level (0..1) of the room containing a tile. */
export function lightAt(level: LevelDef, col: number, row: number): number {
  const room = roomAt(level, col, row);
  if (!room) return BALANCE.light.fallback;
  return room.light ?? BALANCE.light.byRoomKind[room.kind];
}

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

/** Design-time checks so broken maps fail tests instead of soft-locking a shift. */
export function validateLevel(level: LevelDef): string[] {
  const errors: string[] = [];
  const walkable = (c: number, r: number) => isWalkableTile(tileAt(level, c, r), true);
  const reachable = (from: TilePos, to: TilePos) =>
    findPath(level.cols, level.rows, walkable, from, to) !== null;

  if (level.vanTiles.length === 0) errors.push('Level has no van (V).');
  if (level.coworkerSpots.length === 0) errors.push('Level has no coworker spots (Z).');
  if (level.bossRoute.length < 2) errors.push('Boss route needs at least two waypoints.');

  for (const room of level.rooms) {
    const { col, row, w, h } = room.rect;
    if (col < 0 || row < 0 || col + w > level.cols || row + h > level.rows) {
      errors.push(`Room "${room.id}" is out of bounds.`);
    }
  }

  const standable = (tile: TilePos) =>
    NEIGHBORS.map(([dc, dr]) => ({ col: tile.col + dc, row: tile.row + dr })).filter((n) =>
      walkable(n.col, n.row),
    );

  for (const f of level.fixtures) {
    if (!standable(f.tile).some((n) => reachable(level.playerSpawn, n))) {
      errors.push(`Fixture "${f.id}" cannot be reached from the player spawn.`);
    }
  }
  if (!level.vanTiles.some((v) => standable(v).some((n) => reachable(level.playerSpawn, n)))) {
    errors.push('Van cannot be reached from the player spawn.');
  }
  level.bossRoute.forEach((wp, i) => {
    const next = level.bossRoute[(i + 1) % level.bossRoute.length]!;
    if (!reachable(wp, next)) errors.push(`Boss waypoint ${i} cannot reach waypoint ${i + 1}.`);
  });
  for (const s of level.studentSpawns) {
    if (!roomAt(level, s.col, s.row))
      errors.push(`Student spawn ${s.col},${s.row} is outside any room.`);
  }
  for (const z of level.coworkerSpots) {
    if (!reachable(level.playerSpawn, z))
      errors.push(`Coworker spot ${z.col},${z.row} is unreachable.`);
  }
  return errors;
}
