/**
 * `FakeClock` - canonical fake for `ClockPort`. Time is a manual cursor;
 * `advance(ms)` moves it forward and fires every timer whose deadline has
 * elapsed, in the order they were scheduled. Used by app integration tests
 * for `watchAndServe`'s debounce window.
 */

import type { ClockPort, TimerHandle } from "./clock.js";

interface PendingTimer {
  id: number;
  fireAt: number;
  cb: () => void;
  cancelled: boolean;
}

export class FakeClock implements ClockPort {
  private cursor: number;
  private nextId = 1;
  private readonly timers: PendingTimer[] = [];

  constructor(initialNow = 0) {
    this.cursor = initialNow;
  }

  now(): number {
    return this.cursor;
  }

  setTimer(ms: number, cb: () => void): TimerHandle {
    const timer: PendingTimer = {
      id: this.nextId++,
      fireAt: this.cursor + ms,
      cb,
      cancelled: false,
    };
    this.timers.push(timer);
    return {
      cancel: () => {
        timer.cancelled = true;
      },
    };
  }

  /**
   * Move the cursor forward by `ms`, firing each pending timer at its own
   * deadline (cursor is set to `fireAt` before the callback runs). Timers
   * scheduled inside callbacks therefore see the deadline, not the final
   * cursor, as their base - matching real `setTimeout` semantics.
   */
  advance(ms: number): void {
    if (ms < 0) throw new Error("FakeClock.advance: ms must be non-negative");
    const target = this.cursor + ms;
    for (let next = this.nextDue(target); next !== undefined; next = this.nextDue(target)) {
      this.cursor = next.fireAt;
      next.cancelled = true; // mark fired before invoking, so re-entrant cancels are safe
      next.cb();
    }
    this.cursor = target;
  }

  private nextDue(target: number): PendingTimer | undefined {
    let chosen: PendingTimer | undefined;
    for (const t of this.timers) {
      if (t.cancelled) continue;
      if (t.fireAt > target) continue;
      if (chosen === undefined) {
        chosen = t;
        continue;
      }
      if (t.fireAt < chosen.fireAt) chosen = t;
      // ties broken by insertion order (lower id wins) - kept implicit by `<` not `<=`.
    }
    return chosen;
  }

  /** Test helper - count timers that are still scheduled (not fired or cancelled). */
  pendingTimers(): number {
    return this.timers.filter((t) => !t.cancelled).length;
  }
}
