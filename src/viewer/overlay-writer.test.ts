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
    const writer = createOverlayWriter({ fetch, debounceMs: 400 });

    writer.onCanvasChange(scene(1));
    vi.advanceTimersByTime(100);
    writer.onCanvasChange(scene(2));
    vi.advanceTimersByTime(100);
    writer.onCanvasChange(scene(3));
    vi.advanceTimersByTime(400);

    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/overlay");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual(scene(3));

    writer.close();
  });

  it("does not write a snapshot equal to the last server-pushed scene", () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const writer = createOverlayWriter({ fetch, debounceMs: 400 });

    writer.noteServerScene(scene(1));
    writer.onCanvasChange(scene(1));
    vi.advanceTimersByTime(400);

    expect(fetch).not.toHaveBeenCalled();

    writer.close();
  });

  it("writes a snapshot that differs from the last server-pushed scene", () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const writer = createOverlayWriter({ fetch, debounceMs: 400 });

    writer.noteServerScene(scene(1));
    writer.onCanvasChange(scene(2));
    vi.advanceTimersByTime(400);

    expect(fetch).toHaveBeenCalledTimes(1);

    writer.close();
  });

  it("close() cancels a pending write", () => {
    const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const writer = createOverlayWriter({ fetch, debounceMs: 400 });

    writer.onCanvasChange(scene(1));
    writer.close();
    vi.advanceTimersByTime(1000);

    expect(fetch).not.toHaveBeenCalled();
  });
});
