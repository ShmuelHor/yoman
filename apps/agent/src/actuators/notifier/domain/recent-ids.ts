/**
 * The ids of notifications this agent showed, so an action on someone
 * else's notification is never ours to handle. Bounded: a notification the
 * server never reports closed must not leak memory, and the oldest id is the
 * one least likely to still be on screen.
 */
export class RecentIds {
  private readonly ids = new Set<number>();

  constructor(private readonly capacity: number) {}

  add(id: number): void {
    this.ids.delete(id);
    this.ids.add(id);
    for (const oldest of this.ids) {
      if (this.ids.size <= this.capacity) {
        return;
      }
      this.ids.delete(oldest);
    }
  }

  has(id: number): boolean {
    return this.ids.has(id);
  }

  /** Forgets `id`; returns whether it was known. */
  delete(id: number): boolean {
    return this.ids.delete(id);
  }

  get size(): number {
    return this.ids.size;
  }
}
