import { describe, expect, it } from "vitest";

import type { OverlayEntry } from "../../contracts/overlay.js";

import { mergeOverlayEntries } from "./merge.js";

describe("mergeOverlayEntries", () => {
  it("keeps a previous entry whose id is absent from the snapshot entirely", () => {
    const previous: Record<string, OverlayEntry> = {
      "shape:checkout": { moved: { x: 320, y: 96 } },
    };
    const { entries, preserved } = mergeOverlayEntries(previous, {}, new Set());

    expect(entries).toEqual(previous);
    expect(preserved).toEqual(["shape:checkout"]);
  });

  it("drops a previous entry whose id is present in the snapshot but unchanged from base", () => {
    const previous: Record<string, OverlayEntry> = {
      "shape:checkout": { moved: { x: 320, y: 96 } },
    };
    const { entries, preserved } = mergeOverlayEntries(previous, {}, new Set(["shape:checkout"]));

    expect(entries).toEqual({});
    expect(preserved).toEqual([]);
  });

  it("lets a fresh entry for the same id overwrite the previous one", () => {
    const previous: Record<string, OverlayEntry> = {
      "shape:checkout": { moved: { x: 0, y: 0 } },
    };
    const fresh: Record<string, OverlayEntry> = {
      "shape:checkout": { moved: { x: 400, y: 200 } },
    };
    const { entries, preserved } = mergeOverlayEntries(
      previous,
      fresh,
      new Set(["shape:checkout"]),
    );

    expect(entries).toEqual(fresh);
    expect(preserved).toEqual([]);
  });

  it("adds new fresh entries alongside preserved ones", () => {
    const previous: Record<string, OverlayEntry> = {
      "shape:a": { relabelled: "A" },
    };
    const fresh: Record<string, OverlayEntry> = {
      "shape:b": { relabelled: "B" },
    };
    const { entries, preserved } = mergeOverlayEntries(previous, fresh, new Set(["shape:b"]));

    expect(entries).toEqual({ "shape:a": { relabelled: "A" }, "shape:b": { relabelled: "B" } });
    expect(preserved).toEqual(["shape:a"]);
  });

  it("applies a real deletion when the fresh diff reports one", () => {
    const previous: Record<string, OverlayEntry> = {
      "shape:legacy": { moved: { x: 1, y: 2 } },
    };
    const fresh: Record<string, OverlayEntry> = {
      "shape:legacy": { deleted: true },
    };
    const { entries, preserved } = mergeOverlayEntries(previous, fresh, new Set());

    expect(entries).toEqual({ "shape:legacy": { deleted: true } });
    expect(preserved).toEqual([]);
  });
});
