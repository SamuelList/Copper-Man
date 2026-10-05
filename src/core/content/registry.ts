/** Read-only lookup table for data-driven content keyed by `id`. */
export interface Registry<T extends { id: string }> {
  readonly all: readonly T[];
  get(id: string): T;
  find(id: string): T | undefined;
  has(id: string): boolean;
}

export function createRegistry<T extends { id: string }>(
  kind: string,
  items: readonly T[],
): Registry<T> {
  const byId = new Map<string, T>();
  for (const item of items) {
    if (byId.has(item.id)) throw new Error(`Duplicate ${kind} id "${item.id}"`);
    byId.set(item.id, item);
  }
  return {
    all: items,
    get(id) {
      const item = byId.get(id);
      if (!item) throw new Error(`Unknown ${kind} "${id}"`);
      return item;
    },
    find: (id) => byId.get(id),
    has: (id) => byId.has(id),
  };
}
