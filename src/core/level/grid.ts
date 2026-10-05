/** Read-only view of the collision/visibility grid. Out-of-bounds tiles are solid and opaque. */
export interface Grid {
  readonly cols: number;
  readonly rows: number;
  readonly tileSize: number;
  /** Blocks movement. */
  isSolid(col: number, row: number): boolean;
  /** Blocks line of sight. */
  isOpaque(col: number, row: number): boolean;
}

export const inBounds = (grid: Pick<Grid, 'cols' | 'rows'>, col: number, row: number) =>
  col >= 0 && row >= 0 && col < grid.cols && row < grid.rows;

export const tileCenter = (tileSize: number, col: number, row: number) => ({
  x: (col + 0.5) * tileSize,
  y: (row + 0.5) * tileSize,
});

export const worldToTile = (tileSize: number, x: number, y: number) => ({
  col: Math.floor(x / tileSize),
  row: Math.floor(y / tileSize),
});
