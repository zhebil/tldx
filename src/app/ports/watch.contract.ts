/**
 * Contract suite for `WatchPort`, run by both `FakeWatch` and the real
 * chokidar adapter, so the fake's synthetic events stay in step with what
 * chokidar actually emits.
 *
 * The harness owns event triggering: the fake calls `emitChange()` directly,
 * the real one writes to disk and waits for chokidar to fire.
 */

import { describe, it, expect } from "vitest";

import type { WatchPort } from "./watch.js";

export interface WatchHarness {
  port: WatchPort;
  /** Create a file at `relPath`; returns the absolute path. Caller may then `port.watch([absPath], …)`. */
  writeFile(relPath: string, content: string): Promise<string>;
  /**
   * Mutate `absPath` so that watchers on it observe a change. Resolves once
   * the change has been flushed (real adapter: write completed; fake:
   * `emitChange` fired).
   */
  triggerChange(absPath: string, content: string): Promise<void>;
  /**
   * Remove `absPath` so watchers on it observe the disappearance. Resolves
   * once the delete has been flushed.
   */
  deleteFile(absPath: string): Promise<void>;
  dispose(): Promise<void>;
}

/** Poll `predicate` every 10ms up to `timeoutMs`, then throw. */
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
        const path = await h.writeFile("doc.tldx", "first");
        const changes: string[] = [];
        const handle = h.port.watch([path], {
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
        const path = await h.writeFile("doc.tldx", "v1");
        const changes: string[] = [];
        const handle = h.port.watch([path], {
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
        const path = await h.writeFile("doc.tldx", "v1");
        const changes: string[] = [];
        const handle = h.port.watch([path], {
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

    it("delivers a change event when the watched file is deleted", async () => {
      // Pins the unlink-folding policy: adapters fold chokidar's `unlink`
      // into the single `onChange` signal.
      const h = await make();
      try {
        const path = await h.writeFile("doc.tldx", "v1");
        const changes: string[] = [];
        const handle = h.port.watch([path], {
          onChange: (p) => changes.push(p),
        });
        try {
          await h.deleteFile(path);
          await waitFor(() => changes.length >= 1, timeout);
          expect(changes[0]).toBe(path);
        } finally {
          await handle.close();
        }
      } finally {
        await h.dispose();
      }
    });

    it("close() is idempotent", async () => {
      const h = await make();
      try {
        const path = await h.writeFile("doc.tldx", "v1");
        const handle = h.port.watch([path], { onChange: () => undefined });
        await handle.close();
        await expect(handle.close()).resolves.toBeUndefined();
      } finally {
        await h.dispose();
      }
    });

    it("watches every path in the initial set", async () => {
      const h = await make();
      try {
        const a = await h.writeFile("a.tldx", "v1");
        const b = await h.writeFile("b.tldx", "v1");
        const changes: string[] = [];
        const handle = h.port.watch([a, b], {
          onChange: (p) => changes.push(p),
        });
        try {
          await h.triggerChange(a, "v2");
          await waitFor(() => changes.includes(a), timeout);
          await h.triggerChange(b, "v2");
          await waitFor(() => changes.includes(b), timeout);
        } finally {
          await handle.close();
        }
      } finally {
        await h.dispose();
      }
    });

    it("update() adds a path", async () => {
      const h = await make();
      try {
        const a = await h.writeFile("a.tldx", "v1");
        const b = await h.writeFile("b.tldx", "v1");
        const changes: string[] = [];
        const handle = h.port.watch([a], {
          onChange: (p) => changes.push(p),
        });
        try {
          handle.update([a, b]);
          await h.triggerChange(b, "v2");
          await waitFor(() => changes.includes(b), timeout);
        } finally {
          await handle.close();
        }
      } finally {
        await h.dispose();
      }
    });

    it("update() drops a path", async () => {
      const h = await make();
      try {
        const a = await h.writeFile("a.tldx", "v1");
        const b = await h.writeFile("b.tldx", "v1");
        const changes: string[] = [];
        const handle = h.port.watch([a, b], {
          onChange: (p) => changes.push(p),
        });
        try {
          handle.update([a]);
          await h.triggerChange(b, "v2");
          await new Promise((r) => setTimeout(r, 200));
          expect(changes).toEqual([]);

          await h.triggerChange(a, "v2");
          await waitFor(() => changes.includes(a), timeout);
        } finally {
          await handle.close();
        }
      } finally {
        await h.dispose();
      }
    });

    it("update() with an unchanged set delivers no event by itself", async () => {
      const h = await make();
      try {
        const a = await h.writeFile("a.tldx", "v1");
        const changes: string[] = [];
        const handle = h.port.watch([a], {
          onChange: (p) => changes.push(p),
        });
        try {
          handle.update([a]);
          await new Promise((r) => setTimeout(r, 200));
          expect(changes).toEqual([]);
        } finally {
          await handle.close();
        }
      } finally {
        await h.dispose();
      }
    });
  });
}
