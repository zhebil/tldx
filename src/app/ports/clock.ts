/**
 * Clock port. The first concrete consumer is `watchAndServe`'s debounce: a
 * burst of file-save events should collapse into a single recompile, and
 * tests need to drive that timer deterministically. Until that use case
 * lands the port is intentionally narrow - `now()` for timestamps and
 * `setTimer()` for one-shot debounce. No `setInterval`, no date formatting,
 * no monotonic guarantees beyond what the underlying clock provides.
 *
 * The real adapter wraps `Date.now` + `setTimeout`/`clearTimeout`; the
 * colocated `FakeClock` exposes a manual cursor advanced by `advance(ms)`.
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
