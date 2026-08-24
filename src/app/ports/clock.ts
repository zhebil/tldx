/**
 * Clock port, deliberately narrow: `now()` for timestamps and `setTimer()`
 * for one-shot delays. No `setInterval`, no date formatting, no monotonic
 * guarantees beyond what the underlying clock provides.
 */

export interface TimerHandle {
  /** Cancel a pending timer. Idempotent - cancelling twice is a no-op. */
  cancel(): void;
}

export interface ClockPort {
  /** Current wall-clock reading in milliseconds since the Unix epoch. */
  now(): number;
  /**
   * Schedule `cb` to fire once after `ms` milliseconds. The handle's
   * `cancel()` prevents the callback from firing if called before the
   * timer elapses; cancelling after fire is a no-op.
   */
  setTimer(ms: number, cb: () => void): TimerHandle;
}
