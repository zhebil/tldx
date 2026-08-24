/**
 * Real `ClockPort` adapter on `Date.now` and the global `setTimeout`. Tests
 * use the port's `FakeClock` instead.
 */

import type { ClockPort, TimerHandle } from "../../app/ports/clock.js";

export function createSystemClock(): ClockPort {
  return {
    now(): number {
      return Date.now();
    },
    setTimer(ms: number, cb: () => void): TimerHandle {
      const id = setTimeout(cb, ms);
      return {
        cancel: () => {
          clearTimeout(id);
        },
      };
    },
  };
}
