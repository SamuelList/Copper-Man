import { lightAt, roomAt, tileAt } from '@core/level/asciiLevel';
import type { LevelDef, RoomDef, RoomKind } from '@core/level/types';

/**
 * Where the school's light comes from, worked out from the level. Pure layout (no Three.js):
 * `LightBaker` turns it into the light map every material samples, and the ceiling hangs a
 * fitting at each lamp.
 *
 * The rules stay in core: a room's `light` level decides how visible you are. This only decides
 * how that level is drawn, as pools under lamps instead of one flat brightness, so a room's
 * average still matches what the HUD's light gem says.
 */

/** Linear RGB. */
export type RGB = readonly [number, number, number];

export interface LightSource {
  /** Position in tiles (map x, map y). */
  x: number;
  y: number;
  /** Light added right at the source. */
  color: RGB;
  /** How far its pool reaches, in tiles. */
  radius: number;
  /** Shine only into a cone (light spilling through a doorway): heading and full angle. */
  cone?: { facing: number; fov: number };
}

export interface Lamp extends LightSource {
  roomId: string;
  /** What hangs from the ceiling: a recessed fluorescent panel or a bare bulb. */
  fitting: 'panel' | 'bulb';
}

interface LampStyle {
  tint: RGB;
  /** Distance between lamps, tiles. */
  spacing: number;
  /** A pool's radius as a multiple of the spacing: below 1 leaves a rhythm of light and dark. */
  spread: number;
  fitting: Lamp['fitting'] | 'none';
  /** Share of the room's light that arrives as pools under the lamps (the rest is even fill). */
  pooled: number;
}

const STYLE: Record<RoomKind, LampStyle> = {
  exterior: { tint: [1, 1, 1], spacing: 0, spread: 0, fitting: 'none', pooled: 0 },
  hallway: { tint: [1, 0.96, 0.88], spacing: 4.6, spread: 0.72, fitting: 'panel', pooled: 0.6 },
  classroom: { tint: [1, 0.95, 0.86], spacing: 3.3, spread: 0.9, fitting: 'panel', pooled: 0.5 },
  restroom: { tint: [0.9, 0.97, 1], spacing: 3.2, spread: 0.9, fitting: 'panel', pooled: 0.5 },
  closet: { tint: [1, 0.78, 0.52], spacing: 6, spread: 0.6, fitting: 'bulb', pooled: 0.6 },
  lounge: { tint: [1, 0.82, 0.62], spacing: 3.8, spread: 0.7, fitting: 'bulb', pooled: 0.65 },
  boiler: { tint: [1, 0.5, 0.2], spacing: 0, spread: 0, fitting: 'none', pooled: 0 },
  office: { tint: [1, 0.92, 0.8], spacing: 3.3, spread: 0.85, fitting: 'panel', pooled: 0.5 },
  library: { tint: [1, 0.86, 0.68], spacing: 3.4, spread: 0.72, fitting: 'bulb', pooled: 0.6 },
  lab: { tint: [0.9, 1, 0.96], spacing: 3.3, spread: 0.9, fitting: 'panel', pooled: 0.5 },
  gym: { tint: [1, 0.98, 0.93], spacing: 4.6, spread: 0.85, fitting: 'panel', pooled: 0.5 },
  cafeteria: { tint: [1, 0.95, 0.86], spacing: 3.8, spread: 0.85, fitting: 'panel', pooled: 0.5 },
  kitchen: { tint: [0.93, 0.98, 1], spacing: 3.3, spread: 0.9, fitting: 'panel', pooled: 0.5 },
  mechanical: { tint: [0.5, 0.8, 1], spacing: 5, spread: 0.6, fitting: 'bulb', pooled: 0.55 },
};

/** Even fill is a little cooler than the lamps, so pools read warm against their shadows. */
const FILL_TINT: RGB = [0.86, 0.93, 1];
/** Brightest any spot of a room may be, as a multiple of the room's level… */
const MAX_PEAK = 1.4;
/** …though in a dim room a lamp may still make a pool this bright. */
const BRIGHT_SPOT = 0.95;
/** Overall brightness of the baked light. */
const LEVEL = 0.88;

/** Fixtures and furniture that give off light of their own. */
const GLOWING: Record<string, { color: RGB; radius: number }> = {
  boiler: { color: [0.62, 0.24, 0.07], radius: 2.8 },
  lamp: { color: [0.5, 0.36, 0.18], radius: 2.3 },
  'server-rack': { color: [0.05, 0.2, 0.17], radius: 1.8 },
  'trophy-case': { color: [0.24, 0.2, 0.11], radius: 1.8 },
};

const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

/**
 * How bright a core light level (0 dark .. 1 lit) is drawn. Even pitch dark keeps a little, so
 * you can still find your way around the boiler room.
 */
export const shownLevel = (light: number) => LEVEL * (0.16 + 0.84 * light);

const brightness = (c: RGB) => (c[0] + c[1] + c[2]) / 3;

/** A pool's brightness at `d` tiles from its source. */
export const poolFalloff = (d: number, radius: number) => {
  const t = Math.max(0, 1 - (d / radius) ** 2);
  return t * t;
};

interface RoomLight {
  fill: RGB;
  lamps: Lamp[];
}

const planned = new WeakMap<LevelDef, Map<string, RoomLight>>();

/**
 * How one room is lit: an even fill plus pools under a grid of lamps, balanced so that between
 * them the floor averages exactly the level core gives the room.
 */
function roomLight(level: LevelDef, room: RoomDef): RoomLight {
  let rooms = planned.get(level);
  if (!rooms) planned.set(level, (rooms = new Map()));
  const known = rooms.get(room.id);
  if (known) return known;

  const style = STYLE[room.kind];
  const { col, row, w, h } = room.rect;
  const shown = shownLevel(lightAt(level, col, row));
  let plan: RoomLight;
  if (room.kind === 'exterior') plan = { fill: scale([1, 1, 1], shown), lamps: [] };
  else if (style.fitting === 'none') {
    // No lamps of its own (the boiler room): mostly fill; what glows there adds the rest.
    plan = { fill: scale(FILL_TINT, (shown * 0.8) / brightness(FILL_TINT)), lamps: [] };
  } else {
    const nx = Math.max(1, Math.round(w / style.spacing));
    const ny = Math.max(1, Math.round(h / style.spacing));
    const sx = w / nx;
    const sy = h / ny;
    const radius = Math.max(2, Math.min(4.2, style.spread * Math.max(sx, sy)));
    const spots: { x: number; y: number }[] = [];
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) spots.push({ x: col + (i + 0.5) * sx, y: row + (j + 0.5) * sy });

    // Measure the pattern the pools make over the floor: its average and its brightest spot.
    let sum = 0;
    let max = 0;
    let n = 0;
    for (let y = row + 0.25; y < row + h; y += 0.5) {
      for (let x = col + 0.25; x < col + w; x += 0.5) {
        let here = 0;
        for (const s of spots) here += poolFalloff(Math.hypot(x - s.x, y - s.y), radius);
        sum += here;
        max = Math.max(max, here);
        n++;
      }
    }
    const mean = sum / n;
    // Give the pools their share of the room's light, short of burning out under a lamp; the
    // fill makes up whatever they can't.
    const limit = Math.max(MAX_PEAK * shown, BRIGHT_SPOT);
    const pool = Math.min(
      (shown * style.pooled) / mean,
      (limit - shown) / Math.max(1e-6, max - mean),
    );
    plan = {
      fill: scale(FILL_TINT, (shown - pool * mean) / brightness(FILL_TINT)),
      lamps: spots.map((s) => ({
        ...s,
        color: scale(style.tint, pool / brightness(style.tint)),
        radius,
        roomId: room.id,
        fitting: style.fitting as Lamp['fitting'],
      })),
    };
  }
  rooms.set(room.id, plan);
  return plan;
}

/** The even part of a room's light. */
export const roomFill = (level: LevelDef, room: RoomDef): RGB => roomLight(level, room).fill;

/** Fill for any tile: its room's, or for a doorway between rooms the average of its sides. */
export function tileFill(level: LevelDef, col: number, row: number): RGB {
  const room = roomAt(level, col, row);
  if (room) return roomFill(level, room);
  const sum = [0, 0, 0];
  let n = 0;
  for (const [dc, dr] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ] as const) {
    const neighbour = roomAt(level, col + dc, row + dr);
    if (!neighbour || tileAt(level, col + dc, row + dr) === 'wall') continue;
    const fill = roomFill(level, neighbour);
    for (let i = 0; i < 3; i++) sum[i]! += fill[i]!;
    n++;
  }
  if (n === 0) return scale(FILL_TINT, shownLevel(lightAt(level, col, row)) * 0.6);
  return [sum[0]! / n, sum[1]! / n, sum[2]! / n];
}

/** Ceiling lamps: an even grid in every lit room, brighter where core says the room is. */
export const lampLayout = (level: LevelDef): Lamp[] =>
  level.rooms.flatMap((room) => roomLight(level, room).lamps);

/** Light from things that glow: boiler fires, desk lamps, server racks, the trophy case. */
export function glowSources(level: LevelDef): LightSource[] {
  const out: LightSource[] = [];
  for (const item of [...level.props, ...level.fixtures]) {
    const glow = GLOWING[item.defId];
    if (glow) out.push({ x: item.tile.col + 0.5, y: item.tile.row + 0.5, ...glow });
  }
  return out;
}

/**
 * Light spilling through open doorways from the brighter side into the darker one. `isOpen`
 * says whether a door tile can be seen through right now (a locked door lets nothing by).
 */
export function doorSpill(
  level: LevelDef,
  isOpen: (col: number, row: number) => boolean,
): LightSource[] {
  const out: LightSource[] = [];
  const side = (col: number, row: number) => {
    if (tileAt(level, col, row) === 'wall') return null;
    const room = roomAt(level, col, row);
    return room ? { room, shown: shownLevel(lightAt(level, col, row)) } : null;
  };
  for (const door of level.doors) {
    const { col, row } = door.tile;
    if (!isOpen(col, row)) continue;
    for (const [dc, dr] of [
      [1, 0],
      [0, 1],
    ] as const) {
      const a = side(col - dc, row - dr);
      const b = side(col + dc, row + dr);
      if (!a || !b) continue;
      const difference = Math.abs(a.shown - b.shown);
      if (difference < 0.08) continue;
      // From the bright side's edge of the doorway, fanning into the dark side.
      const toDark = a.shown > b.shown ? 1 : -1;
      const bright = a.shown > b.shown ? a : b;
      out.push({
        x: col + 0.5 - dc * toDark * 0.45,
        y: row + 0.5 - dr * toDark * 0.45,
        color: scale(STYLE[bright.room.kind].tint, difference * 0.85),
        radius: 4.2,
        cone: { facing: Math.atan2(dr * toDark, dc * toDark), fov: (150 * Math.PI) / 180 },
      });
    }
  }
  return out;
}
