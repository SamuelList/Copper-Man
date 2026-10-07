import { FIXTURES } from '../content/fixtures';
import { PROPS } from '../content/props';
import { isWalkableTile, tileAt } from '../level/asciiLevel';
import { footprintBox, mountSide } from '../level/footprint';
import type { Grid } from '../level/grid';
import type { LevelDef } from '../level/types';
import type { Box, Vec2 } from '../model/types';

const NONE: readonly Box[] = [];

/**
 * Grid over a level whose locked doors can be opened at runtime.
 *
 * Walls, the van and locked doors block their whole tile. Fixtures and furniture only block the
 * floor they really cover (their `footprint`), so you can walk right up to a drinking fountain
 * or slip past the end of a row of lockers.
 */
export class LevelGrid implements Grid {
  readonly cols: number;
  readonly rows: number;
  private readonly lockedDoors = new Set<number>();
  private readonly solidBoxes = new Map<number, Box[]>();
  private readonly opaqueBoxes = new Map<number, Box[]>();
  /** Hitbox of every fixture and prop, by level object id. */
  readonly objectBoxes = new Map<string, Box>();
  /**
   * Corners of everything that can block sight (wall tiles, the van, doors, tall furniture).
   * Visibility outlines cast rays at these for exact, crisp shadow edges.
   */
  readonly sightCorners: readonly Vec2[];

  constructor(
    private readonly level: LevelDef,
    readonly tileSize: number,
  ) {
    this.cols = level.cols;
    this.rows = level.rows;
    for (const door of level.doors) {
      if (door.locked) this.lockedDoors.add(this.key(door.tile.col, door.tile.row));
    }
    for (const p of level.props) {
      const def = PROPS.get(p.defId);
      const box = this.place(p.id, def.footprint, p.tile.col, p.tile.row);
      if (def.height === 'tall') this.push(this.opaqueBoxes, p.tile.col, p.tile.row, box);
    }
    for (const f of level.fixtures) {
      this.place(f.id, FIXTURES.get(f.defId).footprint, f.tile.col, f.tile.row);
    }
    this.sightCorners = this.collectCorners();
  }

  private key(col: number, row: number) {
    return row * this.cols + col;
  }

  private push(map: Map<number, Box[]>, col: number, row: number, box: Box) {
    const k = this.key(col, row);
    const list = map.get(k);
    if (list) list.push(box);
    else map.set(k, [box]);
  }

  private place(id: string, fp: Parameters<typeof footprintBox>[0], col: number, row: number) {
    const box = footprintBox(fp, col, row, mountSide(this.level, col, row), this.tileSize);
    this.objectBoxes.set(id, box);
    this.push(this.solidBoxes, col, row, box);
    return box;
  }

  isLocked(col: number, row: number) {
    return this.lockedDoors.has(this.key(col, row));
  }

  unlock(col: number, row: number) {
    this.lockedDoors.delete(this.key(col, row));
  }

  isSolid(col: number, row: number): boolean {
    const kind = tileAt(this.level, col, row);
    if (kind === 'lockedDoor') return this.isLocked(col, row);
    return kind === 'wall' || kind === 'van';
  }

  isOpaque(col: number, row: number): boolean {
    const kind = tileAt(this.level, col, row);
    if (kind === 'lockedDoor') return this.isLocked(col, row);
    return kind === 'wall' || kind === 'van';
  }

  solidBoxesAt(col: number, row: number): readonly Box[] {
    return this.solidBoxes.get(this.key(col, row)) ?? NONE;
  }

  opaqueBoxesAt(col: number, row: number): readonly Box[] {
    return this.opaqueBoxes.get(this.key(col, row)) ?? NONE;
  }

  /** NPCs path over floors and doorways; the boss carries keys so locked doors don't block the boss. */
  readonly bossPassable = (col: number, row: number) =>
    isWalkableTile(tileAt(this.level, col, row), true);

  readonly studentPassable = (col: number, row: number) =>
    isWalkableTile(tileAt(this.level, col, row), false) ||
    (tileAt(this.level, col, row) === 'lockedDoor' && !this.isLocked(col, row));

  private collectCorners(): Vec2[] {
    const ts = this.tileSize;
    const seen = new Set<number>();
    const corners: Vec2[] = [];
    const mayBlock = (c: number, r: number) =>
      tileAt(this.level, c, r) === 'lockedDoor' || this.isOpaque(c, r);
    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        if (!mayBlock(col, row)) continue;
        for (const [dc, dr] of [
          [0, 0],
          [1, 0],
          [0, 1],
          [1, 1],
        ] as const) {
          const cc = col + dc;
          const cr = row + dr;
          // Only corners touching open space can shape a shadow edge.
          const touchesOpen =
            !mayBlock(cc - 1, cr - 1) ||
            !mayBlock(cc, cr - 1) ||
            !mayBlock(cc - 1, cr) ||
            !mayBlock(cc, cr);
          const k = cr * (this.cols + 1) + cc;
          if (!touchesOpen || seen.has(k)) continue;
          seen.add(k);
          corners.push({ x: cc * ts, y: cr * ts });
        }
      }
    }
    for (const boxes of this.opaqueBoxes.values()) {
      for (const b of boxes) {
        corners.push(
          { x: b.minX, y: b.minY },
          { x: b.maxX, y: b.minY },
          { x: b.minX, y: b.maxY },
          { x: b.maxX, y: b.maxY },
        );
      }
    }
    return corners;
  }
}
