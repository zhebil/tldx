/**
 * Idle-TTL reaper for `tldx serve`. Activity is an event, not an open
 * connection - an abandoned browser tab holds its SSE connection open
 * forever, so "a client is connected" is not a liveness signal. Callers
 * decide what counts as activity and call `bump()`; `onExpire` fires once
 * `ttlMs` elapses with no bump in between.
 *
 * `ttlMs <= 0` disables the reaper entirely: `bump()`/`stop()` stay safe
 * no-ops and `onExpire` never fires.
 */

import type { ClockPort, TimerHandle } from "./ports/clock.js";

export interface IdleReaperOptions {
  clock: ClockPort;
  /** Idle window in milliseconds. `<= 0` disables the reaper. */
  ttlMs: number;
  /** Called once, when `ttlMs` elapses with no intervening `bump()`. */
  onExpire: () => void;
}

export interface IdleReaper {
  /** Record an activity event, deferring expiry by another `ttlMs`. */
  bump(): void;
  /** Cancel the pending timer. Idempotent; safe after expiry. */
  stop(): void;
}

export function createIdleReaper(options: IdleReaperOptions): IdleReaper {
  const { clock, ttlMs, onExpire } = options;
  const enabled = ttlMs > 0;
  let timer: TimerHandle | undefined;
  let stopped = false;

  function arm(): void {
    timer?.cancel();
    timer = enabled
      ? clock.setTimer(ttlMs, () => {
          timer = undefined;
          onExpire();
        })
      : undefined;
  }

  if (enabled) arm();

  return {
    bump(): void {
      if (stopped || !enabled) return;
      arm();
    },
    stop(): void {
      stopped = true;
      timer?.cancel();
      timer = undefined;
    },
  };
}
