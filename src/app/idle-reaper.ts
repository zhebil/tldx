/**
 * Idle-TTL reaper for `tldx serve` (tldx-kts). Activity is an event, not
 * an open connection - an abandoned browser tab holds its SSE connection
 * open forever, so "a client is connected" is not a liveness signal. The
 * reaper instead tracks discrete activity events (`bump()`) and fires
 * `onExpire` once `ttlMs` elapses with no bump in between.
 *
 * Callers own what counts as activity (HTTP requests, a successful
 * file-triggered recompile, a visible-tab heartbeat - see `cli/serve.ts`);
 * this module only knows how to re-arm a one-shot `ClockPort.setTimer`,
 * matching the "no `setInterval` on the port" note in `app/ports/clock.ts`.
 *
 * `ttlMs <= 0` disables the reaper entirely - `bump()`/`stop()` remain
 * safe no-ops and `onExpire` never fires.
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
