import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createHeartbeat } from "./heartbeat.js";

interface FakeDocument {
  visibilityState: "visible" | "hidden";
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  fireVisibilityChange(): void;
}

function makeFakeDocument(initial: "visible" | "hidden" = "visible"): FakeDocument {
  const listeners: (() => void)[] = [];
  return {
    visibilityState: initial,
    addEventListener: (_type, listener) => listeners.push(listener),
    removeEventListener: (_type, listener) => {
      const i = listeners.indexOf(listener);
      if (i >= 0) listeners.splice(i, 1);
    },
    fireVisibilityChange() {
      for (const l of [...listeners]) l();
    },
  };
}

describe("createHeartbeat", () => {
  let calls: number;
  let fetch: () => Promise<Response>;

  beforeEach(() => {
    vi.useFakeTimers();
    calls = 0;
    fetch = vi.fn(async () => {
      calls++;
      return new Response(null, { status: 204 });
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("pings once immediately while visible, then again every intervalMs", () => {
    const doc = makeFakeDocument("visible");
    const hb = createHeartbeat({ fetch, document: doc, intervalMs: 60_000 });

    expect(calls).toBe(1);
    vi.advanceTimersByTime(60_000);
    expect(calls).toBe(2);
    vi.advanceTimersByTime(60_000);
    expect(calls).toBe(3);

    hb.close();
  });

  it("does not ping at all while the tab starts hidden", () => {
    const doc = makeFakeDocument("hidden");
    const hb = createHeartbeat({ fetch, document: doc, intervalMs: 60_000 });

    expect(calls).toBe(0);
    vi.advanceTimersByTime(600_000);
    expect(calls).toBe(0);

    hb.close();
  });

  it("stops pinging once the tab hides, resumes on visibilitychange back to visible", () => {
    const doc = makeFakeDocument("visible");
    const hb = createHeartbeat({ fetch, document: doc, intervalMs: 60_000 });
    expect(calls).toBe(1);

    doc.visibilityState = "hidden";
    doc.fireVisibilityChange();
    vi.advanceTimersByTime(600_000);
    expect(calls).toBe(1); // no further pings while hidden

    doc.visibilityState = "visible";
    doc.fireVisibilityChange();
    expect(calls).toBe(2); // immediate ping on resume

    vi.advanceTimersByTime(60_000);
    expect(calls).toBe(3);

    hb.close();
  });

  it("close() stops the pending timer and detaches the listener", () => {
    const doc = makeFakeDocument("visible");
    const hb = createHeartbeat({ fetch, document: doc, intervalMs: 60_000 });
    expect(calls).toBe(1);

    hb.close();
    vi.advanceTimersByTime(600_000);
    expect(calls).toBe(1);

    // A visibility flip after close must not resurrect the loop.
    doc.visibilityState = "hidden";
    doc.fireVisibilityChange();
    doc.visibilityState = "visible";
    doc.fireVisibilityChange();
    expect(calls).toBe(1);
  });
});
