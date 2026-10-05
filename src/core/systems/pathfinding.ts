import type { TilePos } from '../model/types';

export type Passable = (col: number, row: number) => boolean;

interface Node {
  idx: number;
  f: number;
}

/** Binary min-heap keyed on `f`. */
class Heap {
  private items: Node[] = [];
  get size() {
    return this.items.length;
  }
  push(node: Node) {
    const a = this.items;
    a.push(node);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]!.f <= a[i]!.f) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop(): Node | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0 && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]!.f < a[m]!.f) m = l;
        if (r < a.length && a[r]!.f < a[m]!.f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}

const DIRS = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
] as const;

/**
 * A* over a tile grid with 8-way movement and no corner cutting.
 * Returns the tiles to walk through (excluding `start`, including `goal`), or null.
 */
export function findPath(
  cols: number,
  rows: number,
  passable: Passable,
  start: TilePos,
  goal: TilePos,
): TilePos[] | null {
  const ok = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows && passable(c, r);
  if (!ok(goal.col, goal.row)) return null;
  if (start.col === goal.col && start.row === goal.row) return [];

  const size = cols * rows;
  const g = new Float64Array(size).fill(Infinity);
  const parent = new Int32Array(size).fill(-1);
  const closed = new Uint8Array(size);
  const startIdx = start.row * cols + start.col;
  const goalIdx = goal.row * cols + goal.col;
  const h = (c: number, r: number) => {
    const dx = Math.abs(c - goal.col);
    const dy = Math.abs(r - goal.row);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };

  const open = new Heap();
  g[startIdx] = 0;
  open.push({ idx: startIdx, f: h(start.col, start.row) });

  while (open.size > 0) {
    const { idx } = open.pop()!;
    if (closed[idx]) continue;
    if (idx === goalIdx) break;
    closed[idx] = 1;
    const c = idx % cols;
    const r = (idx - c) / cols;
    for (const [dc, dr, cost] of DIRS) {
      const nc = c + dc;
      const nr = r + dr;
      if (!ok(nc, nr)) continue;
      if (dc !== 0 && dr !== 0 && (!ok(c + dc, r) || !ok(c, r + dr))) continue;
      const nIdx = nr * cols + nc;
      if (closed[nIdx]) continue;
      const ng = g[idx]! + cost;
      if (ng < g[nIdx]!) {
        g[nIdx] = ng;
        parent[nIdx] = idx;
        open.push({ idx: nIdx, f: ng + h(nc, nr) });
      }
    }
  }

  if (parent[goalIdx] === -1) return null;
  const path: TilePos[] = [];
  for (let i = goalIdx; i !== startIdx; i = parent[i]!) {
    path.push({ col: i % cols, row: Math.floor(i / cols) });
  }
  return path.reverse();
}
