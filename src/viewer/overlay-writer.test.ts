import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { SceneJSON } from "../contracts/scene-json.js";

import { createOverlayWriter } from "./overlay-writer.js";

function scene(n: number): SceneJSON {
  return {
    store: { [`shape:${n}`]: { id: `shape:${n}`, typeName: "shape", x: n } },
    schema: { schemaVersion: 2, sequences: {} },
  };
}

describe("createOverlayWriter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces several changes into one PUT with the latest snapshot as the body", () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const writer = createOverlayWriter({ fetch, debounceMs: 400, token: "tok" });

    writer.onCanvasChange("aaaa", scene(1));
    vi.advanceTimersByTime(100);
    writer.onCanvasChange("aaaa", scene(2));
    vi.advanceTimersByTime(100);
    writer.onCanvasChange("aaaa", scene(3));
    vi.advanceTimersByTime(400);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/overlay");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ pageKey: "aaaa", snapshot: scene(3) });
    expect((init.headers as Record<string, string>)["x-tldx-token"]).toBe("tok");

    writer.close();
  });

  it("does not write a snapshot equal to the last server-pushed scene", () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const writer = createOverlayWriter({ fetch, debounceMs: 400, token: "tok" });

    writer.noteServerScene("aaaa", scene(1));
    writer.onCanvasChange("aaaa", scene(1));
    vi.advanceTimersByTime(400);

    expect(fetch).not.toHaveBeenCalled();

    writer.close();
  });

  it("writes a snapshot that differs from the last server-pushed scene", () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const writer = createOverlayWriter({ fetch, debounceMs: 400, token: "tok" });

    writer.noteServerScene("aaaa", scene(1));
    writer.onCanvasChange("aaaa", scene(2));
    vi.advanceTimersByTime(400);

    expect(fetch).toHaveBeenCalledTimes(1);

    writer.close();
  });

  it("compares each page against its own last server scene", () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const writer = createOverlayWriter({ fetch, debounceMs: 400, token: "tok" });

    // Merging page bbbb must not make aaaa's next snapshot look like an edit.
    writer.noteServerScene("aaaa", scene(1));
    writer.noteServerScene("bbbb", scene(2));
    writer.onCanvasChange("aaaa", scene(1));
    vi.advanceTimersByTime(400);

    expect(fetch).not.toHaveBeenCalled();

    writer.close();
  });

  it("does not let an edit on one page cancel another page's pending write", () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const writer = createOverlayWriter({ fetch, debounceMs: 400, token: "tok" });

    writer.onCanvasChange("aaaa", scene(1));
    vi.advanceTimersByTime(300);
    writer.onCanvasChange("bbbb", scene(2));
    vi.advanceTimersByTime(400);

    expect(fetch).toHaveBeenCalledTimes(2);

    writer.close();
  });

  it("close() cancels a pending write", () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const writer = createOverlayWriter({ fetch, debounceMs: 400, token: "tok" });

    writer.onCanvasChange("aaaa", scene(1));
    writer.close();
    vi.advanceTimersByTime(1000);

    expect(fetch).not.toHaveBeenCalled();
  });
});
