import type { Timers } from '../../src/core/scheduler.js';

interface Pending {
  readonly id: number;
  readonly at: number;
  readonly callback: () => void;
}

/**
 * A clock the test moves by hand. Unlike fake timers it waits for real IO
 * (the buffer's files) after each callback, through `settle`.
 */
export class VirtualTimers implements Timers {
  now = 0;
  private nextId = 0;
  private pending: Pending[] = [];

  setTimeout(callback: () => void, ms: number): unknown {
    this.nextId += 1;
    this.pending.push({ id: this.nextId, at: this.now + ms, callback });
    return this.nextId;
  }

  clearTimeout(handle: unknown): void {
    this.pending = this.pending.filter((entry) => entry.id !== handle);
  }

  /** The delays still armed, relative to now. */
  get armedDelays(): number[] {
    return this.pending.map((entry) => entry.at - this.now);
  }

  /** Fires every callback due up to `time`, in order, awaiting `settle` after each. */
  async advanceTo(time: number, settle: () => Promise<void>): Promise<void> {
    for (;;) {
      const due = this.pending
        .filter((entry) => entry.at <= time)
        .sort((a, b) => a.at - b.at || a.id - b.id)[0];
      if (due === undefined) {
        break;
      }
      this.pending = this.pending.filter((entry) => entry !== due);
      this.now = due.at;
      due.callback();
      await settle();
    }
    this.now = time;
  }
}
