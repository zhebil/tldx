import { EventEmitter } from "node:events";
import type { ChildProcess, spawn as nodeSpawn } from "node:child_process";

import { describe, expect, it } from "vitest";

import { openBrowser } from "./open-browser.js";

interface SpawnCall {
  cmd: string;
  args: readonly string[];
}

interface FakeChild {
  unrefCount: number;
  errorHandlers: Array<(err: Error) => void>;
}

function fakeSpawn(): {
  spawn: typeof nodeSpawn;
  calls: SpawnCall[];
  children: FakeChild[];
} {
  const calls: SpawnCall[] = [];
  const children: FakeChild[] = [];
  const spawn = ((cmd: string, args: readonly string[]) => {
    calls.push({ cmd, args });
    const ee = new EventEmitter();
    const tracker: FakeChild = { unrefCount: 0, errorHandlers: [] };
    const child = Object.assign(ee, {
      unref(): void {
        tracker.unrefCount += 1;
      },
    }) as unknown as ChildProcess;
    ee.on("error", (err: Error) => {
      tracker.errorHandlers.forEach((h) => {
        h(err);
      });
    });
    children.push(tracker);
    return child;
  }) as unknown as typeof nodeSpawn;
  return { spawn, calls, children };
}

describe("openBrowser", () => {
  it("uses `open -g` on darwin so the browser does not steal focus", () => {
    const { spawn, calls } = fakeSpawn();
    openBrowser("http://example/", { spawn, platform: "darwin" });
    expect(calls).toEqual([{ cmd: "open", args: ["-g", "http://example/"] }]);
  });

  it("uses `xdg-open` on linux", () => {
    const { spawn, calls } = fakeSpawn();
    openBrowser("http://example/", { spawn, platform: "linux" });
    expect(calls).toEqual([{ cmd: "xdg-open", args: ["http://example/"] }]);
  });

  it('uses `cmd /c start "" <url>` on win32', () => {
    const { spawn, calls } = fakeSpawn();
    openBrowser("http://example/", { spawn, platform: "win32" });
    expect(calls).toEqual([{ cmd: "cmd", args: ["/c", "start", "", "http://example/"] }]);
  });

  it("unrefs the child so it does not hold the event loop open", () => {
    const { spawn, children } = fakeSpawn();
    openBrowser("http://example/", { spawn, platform: "darwin" });
    expect(children).toHaveLength(1);
    expect(children[0]!.unrefCount).toBe(1);
  });

  it("swallows synchronous spawn errors", () => {
    const throwingSpawn = (() => {
      throw new Error("boom");
    }) as unknown as typeof nodeSpawn;
    expect(() =>
      openBrowser("http://example/", { spawn: throwingSpawn, platform: "darwin" }),
    ).not.toThrow();
  });
});
