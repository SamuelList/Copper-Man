type Handler<T> = (payload: T) => void;

/** Minimal strongly-typed event emitter. `E` maps event names to payload types. */
export class Emitter<E extends object> {
  private handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(type, handler);
  }

  off<K extends keyof E>(type: K, handler: Handler<E[K]>): void {
    this.handlers.get(type)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    this.handlers.get(type)?.forEach((h) => (h as Handler<E[K]>)(payload));
  }

  clear(): void {
    this.handlers.clear();
  }
}
