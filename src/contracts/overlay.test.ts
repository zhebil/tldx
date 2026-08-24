import { describe, expect, it } from "vitest";

import { emptyOverlay, isOverlay, OVERLAY_VERSION } from "./overlay.js";

describe("isOverlay", () => {
  it("accepts an empty overlay", () => {
    expect(isOverlay(emptyOverlay("a1b2c3d4"))).toBe(true);
  });

  it("accepts an overlay with entries", () => {
    expect(
      isOverlay({
        v: OVERLAY_VERSION,
        basedOn: "a1b2c3d4",
        entries: {
          "shape:checkout": { moved: { x: 10, y: 20 } },
          "shape:legacy": { deleted: true },
        },
      }),
    ).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "not an overlay"],
    ["an array", []],
    ["missing v", { basedOn: "a1b2c3d4", entries: {} }],
    ["wrong v", { v: 2, basedOn: "a1b2c3d4", entries: {} }],
    ["non-string basedOn", { v: OVERLAY_VERSION, basedOn: 42, entries: {} }],
    ["missing entries", { v: OVERLAY_VERSION, basedOn: "a1b2c3d4" }],
    ["entries as an array", { v: OVERLAY_VERSION, basedOn: "a1b2c3d4", entries: [] }],
    [
      "an entry that isn't an object",
      {
        v: OVERLAY_VERSION,
        basedOn: "a1b2c3d4",
        entries: { "shape:x": "deleted" },
      },
    ],
  ])("rejects %s", (_label, value) => {
    expect(isOverlay(value)).toBe(false);
  });
});
