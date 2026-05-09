/**
 * Contract suite for `WatchPort`. Both `FakeWatch` and the real chokidar
 * adapter run this against their own constructors, ensuring the fake's
 * synthetic events match what real chokidar emits in the scenarios that
 * actually matter to `watchAndServe`.
 *
 * The harness owns event-trigger semantics: the fake calls `emitChange()`
 * directly, while the real-adapter harness writes to disk and waits for
 * chokidar to fire.
 */

import { describe, it, expect } from "vitest";

import type { WatchPort } from "./watch.js";

export interface WatchHarness {
  port: WatchPort;
  /** Create a file at `relPath`; returns the absolute path. Caller may then `port.watch(absPath, …)`. */
  writeFile(relPath: string, content: string): Promise<string>;
  /**
   * Mutate `absPath` so that watchers on it observe a change. Resolves once
   * the change has been flushed (real adapter: write completed; fake:
   * `emitChange` fired).
   */
  triggerChange(absPath: string, content: string): Promise<void>;
  /** Tear down. */
  dispose(): Promise<void>;
}

/**
 * Wait for `predicate` to become true, polling every 10ms up to `timeoutMs`.
 * Used to drain async event delivery without coupling tests to a fixed delay.
 */
async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  if (!predicate()) {
    throw new Error(`waitFor: predicate did not become true within ${String(timeoutMs)}ms`);
  }
}

export function runWatchContract(
  label: string,
  make: () => Promise<WatchHarness>,
  options: { eventTimeoutMs?: number } = {},
): void {
  const timeout = options.eventTimeoutMs ?? 2000;

  describe(`WatchPort contract: ${label}`, () => {
    it("delivers a change event after the file is modified", async () => {
      const h = await make();
      try {
        const path = await h.writeFile("doc.tldsl", "first");
        const changes: string[] = [];
        const handle = h.port.watch(path, {
          onChange: (p) => changes.push(p),
        });
        try {
          await h.triggerChange(path, "second");
          await waitFor(() => changes.length >= 1, timeout);
          expect(changes[0]).toBe(path);
        } finally {
          await handle.close();
        }
      } finally {
        await h.dispose();
      }
    });

    it("delivers multiple change events for repeated modifications", async () => {
      const h = await make();
      try {
        const path = await h.writeFile("doc.tldsl", "v1");
        const changes: string[] = [];
        const handle = h.port.watch(path, {
          onChange: (p) => changes.push(p),
        });
        try {
          await h.triggerChange(path, "v2");
          await waitFor(() => changes.length >= 1, timeout);
          await h.triggerChange(path, "v3");
          await waitFor(() => changes.length >= 2, timeout);
          expect(changes.length).toBeGreaterThanOrEqual(2);
        } finally {
          await handle.close();
        }
      } finally {
        await h.dispose();
      }
    });

    it("stops delivering events after close()", async () => {
      const h = await make();
      try {
        const path = await h.writeFile("doc.tldsl", "v1");
        const changes: string[] = [];
        const handle = h.port.watch(path, {
          onChange: (p) => changes.push(p),
        });
        await handle.close();
        await h.triggerChange(path, "v2");
        await new Promise((r) => setTimeout(r, 100));
        expect(changes).toEqual([]);
      } finally {
        await h.dispose();
      }
    });

    it("close() is idempotent", async () => {
      const h = await make();
      try {
        const path = await h.writeFile("doc.tldsl", "v1");
        const handle = h.port.watch(path, { onChange: () => undefined });
        await handle.close();
        await expect(handle.close()).resolves.toBeUndefined();
      } finally {
        await h.dispose();
      }
    });
  });
}
