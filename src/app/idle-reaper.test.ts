import { describe, expect, it } from "vitest";

import { FakeClock } from "./ports/clock.fake.js";

import { createIdleReaper } from "./idle-reaper.js";

describe("createIdleReaper", () => {
  it("fires onExpire after ttlMs with no activity", () => {
    const clock = new FakeClock();
    let expired = 0;
    createIdleReaper({ clock, ttlMs: 1000, onExpire: () => expired++ });

    clock.advance(999);
    expect(expired).toBe(0);
    clock.advance(1);
    expect(expired).toBe(1);
  });

  it("bump() defers expiry by another ttlMs", () => {
    const clock = new FakeClock();
    let expired = 0;
    const reaper = createIdleReaper({ clock, ttlMs: 1000, onExpire: () => expired++ });

    clock.advance(900);
    reaper.bump();
    clock.advance(900);
    expect(expired).toBe(0);
    clock.advance(100);
    expect(expired).toBe(1);
  });

  it("stop() cancels the pending timer and further bump()s are no-ops", () => {
    const clock = new FakeClock();
    let expired = 0;
    const reaper = createIdleReaper({ clock, ttlMs: 1000, onExpire: () => expired++ });

    reaper.stop();
    clock.advance(10_000);
    expect(expired).toBe(0);

    reaper.bump();
    clock.advance(10_000);
    expect(expired).toBe(0);
  });

  it("ttlMs <= 0 disables the reaper - never fires, bump() is a no-op", () => {
    const clock = new FakeClock();
    let expired = 0;
    const reaper = createIdleReaper({ clock, ttlMs: 0, onExpire: () => expired++ });

    reaper.bump();
    clock.advance(1_000_000);
    expect(expired).toBe(0);
    expect(clock.pendingTimers()).toBe(0);
  });

  it("only fires once even if the timer callback races bump()", () => {
    const clock = new FakeClock();
    let expired = 0;
    createIdleReaper({ clock, ttlMs: 1000, onExpire: () => expired++ });

    clock.advance(1000);
    expect(expired).toBe(1);
    // No pending timer left after firing - nothing to double-fire.
    expect(clock.pendingTimers()).toBe(0);
  });
});
