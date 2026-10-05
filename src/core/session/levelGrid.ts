import { isWalkableTile, tileAt } from '../level/asciiLevel';
import type { Grid } from '../level/grid';
import type { LevelDef } from '../level/types';

/** Grid over a level whose locked doors can be opened at runtime. */
export class LevelGrid implements Grid {
  readonly cols: number;
  readonly rows: number;
  private lockedDoors = new Set<number>();

  constructor(
    private readonly level: LevelDef,
    readonly tileSize: number,
  ) {
    this.cols = level.cols;
    this.rows = level.rows;
    for (const door of level.doors) {
      if (door.locked) this.lockedDoors.add(this.key(door.tile.col, door.tile.row));
    }
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
    return kind === 'wall' || kind === 'van' || kind === 'fixture';
  }

  isOpaque(col: number, row: number): boolean {
    const kind = tileAt(this.level, col, row);
    if (kind === 'lockedDoor') return this.isLocked(col, row);
    return kind === 'wall' || kind === 'van';
  }

  /** NPCs path over floors and doorways; the boss carries keys so locked doors don't block the boss. */
  readonly bossPassable = (col: number, row: number) =>
    isWalkableTile(tileAt(this.level, col, row), true);

  readonly studentPassable = (col: number, row: number) =>
    isWalkableTile(tileAt(this.level, col, row), false) ||
    (tileAt(this.level, col, row) === 'lockedDoor' && !this.isLocked(col, row));
}
