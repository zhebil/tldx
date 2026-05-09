import { describe, it, expect } from "vitest";

import { FakeWatch } from "./watch.fake.js";
import { runWatchContract, type WatchHarness } from "./watch.contract.js";

runWatchContract("FakeWatch", async (): Promise<WatchHarness> => {
  const watcher = new FakeWatch();
  return {
    port: watcher,
    writeFile: async (relPath) => relPath,
    triggerChange: async (absPath) => {
      watcher.emitChange(absPath);
    },
    deleteFile: async (absPath) => {
      watcher.emitChange(absPath);
    },
    dispose: async () => undefined,
  };
});

describe("FakeWatch (fake-specific affordances)", () => {
  it("activeSubscribers reflects subscribe + close lifecycle", async () => {
    const w = new FakeWatch();
    expect(w.activeSubscribers("/a")).toBe(0);
    const h1 = w.watch("/a", { onChange: () => undefined });
    const h2 = w.watch("/a", { onChange: () => undefined });
    expect(w.activeSubscribers("/a")).toBe(2);
    await h1.close();
    expect(w.activeSubscribers("/a")).toBe(1);
    await h2.close();
    expect(w.activeSubscribers("/a")).toBe(0);
  });

  it("emitError reaches subscribers that supplied onError", () => {
    const w = new FakeWatch();
    const errors: Error[] = [];
    w.watch("/a", {
      onChange: () => undefined,
      onError: (e) => errors.push(e),
    });
    w.watch("/a", { onChange: () => undefined });
    w.emitError("/a", new Error("boom"));
    expect(errors).toHaveLength(1);
    expect(errors[0]?.message).toBe("boom");
  });

  it("emitChange ignores events for paths nobody is watching", () => {
    const w = new FakeWatch();
    const changes: string[] = [];
    w.watch("/a", { onChange: (p) => changes.push(p) });
    w.emitChange("/b");
    expect(changes).toEqual([]);
  });
});
