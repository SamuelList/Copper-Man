import { roomAt, tileAt } from '@core/level/asciiLevel';
import type { LevelDef } from '@core/level/types';
import { TILE_FRAMES } from './assetManifest';

/** Map a level to tileset frame indices (row-major 2D array for Phaser's tilemap factory). */
export function buildTileData(level: LevelDef): number[][] {
  const vanCols = level.vanTiles.map((t) => t.col);
  const vanRows = level.vanTiles.map((t) => t.row);
  const stripeRows = vanRows.length ? [Math.min(...vanRows) - 2, Math.max(...vanRows) + 2] : [];
  const stripeCols = vanCols.length
    ? [Math.min(...vanCols) - 1, Math.max(...vanCols) + 1]
    : [0, -1];

  const data: number[][] = [];
  for (let row = 0; row < level.rows; row++) {
    const line: number[] = [];
    for (let col = 0; col < level.cols; col++) {
      const kind = tileAt(level, col, row);
      if (kind === 'wall') {
        const below = tileAt(level, col, row + 1);
        line.push(
          row + 1 < level.rows && below !== 'wall' ? TILE_FRAMES.wallFace : TILE_FRAMES.wall,
        );
        continue;
      }
      if (kind === 'door' || kind === 'lockedDoor') {
        line.push(TILE_FRAMES.doorway);
        continue;
      }
      const room = roomAt(level, col, row);
      const roomKind = room?.kind ?? 'hallway';
      if (
        roomKind === 'exterior' &&
        stripeRows.includes(row) &&
        col >= stripeCols[0]! &&
        col <= stripeCols[1]!
      ) {
        line.push(TILE_FRAMES.parkingStripe);
        continue;
      }
      line.push(TILE_FRAMES[roomKind]);
    }
    data.push(line);
  }
  return data;
}
