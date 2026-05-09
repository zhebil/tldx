import { describe, it, expect } from "vitest";

import { runClockContract, type ClockHarness } from "./clock.contract.js";
import { FakeClock } from "./clock.fake.js";

runClockContract("FakeClock", async (): Promise<ClockHarness> => {
  const clock = new FakeClock();
  return {
    port: clock,
    advance: async (ms) => {
      clock.advance(ms);
    },
    dispose: async () => undefined,
  };
});

describe("FakeClock (fake-specific affordances)", () => {
  it("constructor seeds the time cursor", () => {
    const clock = new FakeClock(1000);
    expect(clock.now()).toBe(1000);
    clock.advance(50);
    expect(clock.now()).toBe(1050);
  });

  it("pendingTimers reflects schedule + fire + cancel lifecycle", () => {
    const clock = new FakeClock();
    expect(clock.pendingTimers()).toBe(0);
    const a = clock.setTimer(10, () => undefined);
    clock.setTimer(20, () => undefined);
    expect(clock.pendingTimers()).toBe(2);
    a.cancel();
    expect(clock.pendingTimers()).toBe(1);
    clock.advance(20);
    expect(clock.pendingTimers()).toBe(0);
  });

  it("advance rejects negative deltas", () => {
    const clock = new FakeClock();
    expect(() => {
      clock.advance(-1);
    }).toThrow();
  });

  it("a timer scheduled inside a callback uses the cursor at scheduling time as its base", () => {
    const clock = new FakeClock();
    const order: string[] = [];
    clock.setTimer(10, () => {
      order.push("outer");
      // At this point cursor is 10 (the outer's deadline). The inner timer's
      // deadline is therefore 15, so a 20-step advance includes it.
      clock.setTimer(5, () => order.push("inner"));
    });
    clock.advance(20);
    expect(order).toEqual(["outer", "inner"]);
  });
});
