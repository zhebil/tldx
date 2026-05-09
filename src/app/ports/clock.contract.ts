/**
 * Contract suite for `ClockPort`. Both `FakeClock` and the real
 * `infra/clock/` adapter run this against their own constructors. The
 * harness owns time-advancement semantics: the fake calls `advance()`
 * directly; the real-adapter harness waits actual wall-clock milliseconds.
 */

import { describe, it, expect } from "vitest";

import type { ClockPort } from "./clock.js";

export interface ClockHarness {
  port: ClockPort;
  /**
   * Move time forward by `ms`. For the fake this calls `advance()`; for the
   * real adapter this waits `ms` milliseconds (plus a small slack so timers
   * actually fire before the assertion).
   */
  advance(ms: number): Promise<void>;
  /** Tear down (cancel any straggler timers, etc.). */
  dispose(): Promise<void>;
}

export function runClockContract(
  label: string,
  make: () => Promise<ClockHarness>,
): void {
  describe(`ClockPort contract: ${label}`, () => {
    it("now() is monotonic non-decreasing across an advance", async () => {
      const h = await make();
      try {
        const t0 = h.port.now();
        await h.advance(20);
        const t1 = h.port.now();
        expect(t1).toBeGreaterThanOrEqual(t0 + 20);
      } finally {
        await h.dispose();
      }
    });

    it("setTimer fires its callback after the requested delay", async () => {
      const h = await make();
      try {
        let fired = 0;
        h.port.setTimer(20, () => {
          fired++;
        });
        expect(fired).toBe(0);
        await h.advance(20);
        expect(fired).toBe(1);
      } finally {
        await h.dispose();
      }
    });

    it("setTimer fires exactly once", async () => {
      const h = await make();
      try {
        let fired = 0;
        h.port.setTimer(10, () => {
          fired++;
        });
        await h.advance(10);
        await h.advance(10);
        expect(fired).toBe(1);
      } finally {
        await h.dispose();
      }
    });

    it("cancel() before the deadline prevents the callback from firing", async () => {
      const h = await make();
      try {
        let fired = 0;
        const handle = h.port.setTimer(20, () => {
          fired++;
        });
        handle.cancel();
        await h.advance(40);
        expect(fired).toBe(0);
      } finally {
        await h.dispose();
      }
    });

    it("cancel() is idempotent", async () => {
      const h = await make();
      try {
        const handle = h.port.setTimer(20, () => undefined);
        handle.cancel();
        expect(() => {
          handle.cancel();
        }).not.toThrow();
      } finally {
        await h.dispose();
      }
    });

    it("multiple timers fire independently in scheduled order", async () => {
      const h = await make();
      try {
        const order: string[] = [];
        h.port.setTimer(10, () => order.push("a"));
        h.port.setTimer(20, () => order.push("b"));
        await h.advance(30);
        expect(order).toEqual(["a", "b"]);
      } finally {
        await h.dispose();
      }
    });
  });
}
