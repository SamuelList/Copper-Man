import { FIXTURES } from '../content/fixtures';
import { PROPS } from '../content/props';
import { isWalkableTile, tileAt } from '../level/asciiLevel';
import type { Grid } from '../level/grid';
import type { LevelDef } from '../level/types';
import type { Vec2 } from '../model/types';

/** Grid over a level whose locked doors can be opened at runtime. */
export class LevelGrid implements Grid {
  readonly cols: number;
  readonly rows: number;
  private readonly lockedDoors = new Set<number>();
  private readonly tallProps = new Set<number>();
  private readonly lowCover = new Set<number>();
  /**
   * Corners of every tile that can block sight (walls, van, tall props, doors). Visibility
   * polygons cast rays at these to get exact, crisp shadow edges.
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
      (def.height === 'tall' ? this.tallProps : this.lowCover).add(
        this.key(p.tile.col, p.tile.row),
      );
    }
    for (const f of level.fixtures) {
      if (FIXTURES.get(f.defId).cover === 'low')
        this.lowCover.add(this.key(f.tile.col, f.tile.row));
    }
    this.sightCorners = this.collectCorners();
  }

  private key(col: number, row: number) {
    return row * this.cols + col;
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
    return kind === 'wall' || kind === 'van' || kind === 'fixture' || kind === 'prop';
  }

  isOpaque(col: number, row: number): boolean {
    const kind = tileAt(this.level, col, row);
    if (kind === 'lockedDoor') return this.isLocked(col, row);
    if (kind === 'prop') return this.tallProps.has(this.key(col, row));
    return kind === 'wall' || kind === 'van';
  }

  isLowCover(col: number, row: number): boolean {
    return this.lowCover.has(this.key(col, row));
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
    const mayBlock = (c: number, r: number) => {
      const kind = tileAt(this.level, c, r);
      return kind === 'lockedDoor' || this.isOpaque(c, r);
    };
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
    return corners;
  }
}
