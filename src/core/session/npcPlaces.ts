import type { GuardSpot, PatrolPoint } from '../ai/bossBrain';
import type { Post } from '../ai/teacherBrain';
import { isWalkableTile, roomAt, tileAt } from '../level/asciiLevel';
import type { LevelDef, RoomDef } from '../level/types';
import type { TilePos } from '../model/types';

/**
 * Places the NPCs care about, worked out once per level: where Mr. Gravy can drop in, where
 * he'd stake out the exits, where someone could be hiding, and where teachers stand.
 */

type Passable = (col: number, row: number) => boolean;

const walkable = (level: LevelDef) => (c: number, r: number) =>
  isWalkableTile(tileAt(level, c, r), true);

/** The passable tile nearest a point inside a rect (or null if the rect has none). */
function nearestPassable(
  passable: Passable,
  rect: RoomDef['rect'],
  col: number,
  row: number,
): TilePos | null {
  let best: TilePos | null = null;
  let bestD = Infinity;
  for (let r = rect.row; r < rect.row + rect.h; r++) {
    for (let c = rect.col; c < rect.col + rect.w; c++) {
      if (!passable(c, r)) continue;
      const d = Math.hypot(c - col, r - row);
      if (d < bestD) {
        bestD = d;
        best = { col: c, row: r };
      }
    }
  }
  return best;
}

/**
 * Points Mr. Gravy plans his rounds from: every room's middle (two for big rooms), stops along
 * every hallway, and the designer's patrol markers.
 */
export function patrolPoints(level: LevelDef): PatrolPoint[] {
  const passable = walkable(level);
  const out: PatrolPoint[] = [];
  const add = (room: RoomDef, col: number, row: number) => {
    const tile = nearestPassable(passable, room.rect, Math.round(col), Math.round(row));
    if (tile && !out.some((p) => p.tile.col === tile.col && p.tile.row === tile.row)) {
      out.push({ tile, roomId: room.id, look: null });
    }
  };
  for (const room of level.rooms) {
    if (room.kind === 'exterior') continue;
    const { col, row, w, h } = room.rect;
    const long = Math.max(w, h);
    // Hallways get a stop every ~9 tiles; big rooms two; the rest one.
    const stops = room.kind === 'hallway' ? Math.max(2, Math.round(long / 9)) : w * h > 120 ? 2 : 1;
    for (let i = 0; i < stops; i++) {
      const t = (i + 0.5) / stops;
      if (w >= h) add(room, col + w * t - 0.5, row + h / 2 - 0.5);
      else add(room, col + w / 2 - 0.5, row + h * t - 0.5);
    }
  }
  for (const tile of level.bossRoute) {
    const room = roomAt(level, tile.col, tile.row);
    if (!out.some((p) => p.tile.col === tile.col && p.tile.row === tile.row)) {
      out.push({ tile, roomId: room?.id ?? null, look: null });
    }
  }
  return out;
}

const DIRS = [
  { dc: 1, dr: 0, angle: 0 },
  { dc: 0, dr: 1, angle: Math.PI / 2 },
  { dc: -1, dr: 0, angle: Math.PI },
  { dc: 0, dr: -1, angle: -Math.PI / 2 },
] as const;

/**
 * Just inside each door between the building and the outside: where he'd wait for someone
 * heading back to their van, facing into the school.
 */
export function guardSpots(level: LevelDef): GuardSpot[] {
  const passable = walkable(level);
  const outside = (c: number, r: number) => roomAt(level, c, r)?.kind === 'exterior';
  const out: GuardSpot[] = [];
  for (const door of level.doors) {
    const { col, row } = door.tile;
    for (const d of DIRS) {
      // Door with the outside on one side: stand two steps in on the other side.
      if (!outside(col - d.dc, row - d.dr) || outside(col + d.dc, row + d.dr)) continue;
      const tile = { col: col + d.dc * 2, row: row + d.dr * 2 };
      if (passable(tile.col, tile.row)) out.push({ tile, look: d.angle });
    }
  }
  return out;
}

/** Walkable tiles beside cover (desks, stalls, lockers, boilers…) where someone could hide. */
export function hideSpots(level: LevelDef): TilePos[] {
  const passable = walkable(level);
  const occupied = new Set(
    [...level.fixtures, ...level.props].map((o) => `${o.tile.col},${o.tile.row}`),
  );
  const out: TilePos[] = [];
  for (let row = 0; row < level.rows; row++) {
    for (let col = 0; col < level.cols; col++) {
      if (!passable(col, row) || tileAt(level, col, row) === 'door') continue;
      if (DIRS.some((d) => occupied.has(`${col + d.dc},${row + d.dr}`))) out.push({ col, row });
    }
  }
  return out;
}

/**
 * A teacher's posts: the front of their room facing the class, the hall outside their door,
 * and the teachers' lounge (if there is one).
 */
export function teacherPosts(
  level: LevelDef,
  spawn: TilePos,
): { front: Post; hall: Post | null; lounge: Post | null } {
  const passable = walkable(level);
  const room = roomAt(level, spawn.col, spawn.row);
  const front: Post = { tile: spawn, look: Math.PI / 2 };
  if (room) {
    const cx = room.rect.col + room.rect.w / 2;
    const cy = room.rect.row + room.rect.h / 2;
    front.look = Math.atan2(cy - spawn.row, cx - spawn.col);
  }

  let hall: Post | null = null;
  if (room) {
    const { col, row, w, h } = room.rect;
    // Doors in the room's walls; stand one step outside, looking along the hall.
    outer: for (const door of level.doors) {
      const { col: dc, row: dr } = door.tile;
      const onEdge =
        ((dr === row - 1 || dr === row + h) && dc >= col && dc < col + w) ||
        ((dc === col - 1 || dc === col + w) && dr >= row && dr < row + h);
      if (!onEdge) continue;
      for (const d of DIRS) {
        const tile = { col: dc + d.dc, row: dr + d.dr };
        if (!passable(tile.col, tile.row)) continue;
        if (roomAt(level, tile.col, tile.row)?.id === room.id) continue;
        hall = { tile, look: d.angle + Math.PI / 2 };
        break outer;
      }
    }
  }

  const loungeRoom = level.rooms.find((r) => r.kind === 'lounge');
  let lounge: Post | null = null;
  if (loungeRoom) {
    const tile = nearestPassable(
      passable,
      loungeRoom.rect,
      loungeRoom.rect.col + loungeRoom.rect.w / 2,
      loungeRoom.rect.row + loungeRoom.rect.h / 2,
    );
    if (tile) lounge = { tile, look: Math.PI / 2 };
  }
  return { front, hall, lounge };
}
