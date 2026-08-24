import { runClockContract, type ClockHarness } from "../../app/ports/clock.contract.js";

import { createSystemClock } from "./system-clock.js";

runClockContract("createSystemClock", async (): Promise<ClockHarness> => {
  const port = createSystemClock();
  return {
    port,
    advance: async (ms) => {
      // Real-time slack: setTimeout schedules "no sooner than ms"; we need
      // a few extra ms so the timer's callback has actually fired before
      // the assertion runs.
      await new Promise((r) => setTimeout(r, ms + 15));
    },
    dispose: async () => undefined,
  };
});
