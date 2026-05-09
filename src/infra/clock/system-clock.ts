/**
 * Real `ClockPort` adapter on top of `Date.now` and the global
 * `setTimeout`/`clearTimeout`. The CLI wires this into `watchAndServe`
 * so debounce reflects real time; tests use the colocated `FakeClock`.
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
