import { describe, expect, it } from "vitest";

import { GEOS } from "../ir/styles.js";

import {
  BOX_ASPECT_TARGET,
  estimatedBoxSize,
  estimatedNoteSize,
  fitBoxWidth,
  geoScale,
  labelExtent,
} from "./defaults.js";
import { lineHeightPx, textWidth } from "./glyph-metrics.js";

describe("estimatedBoxSize", () => {
  it("returns the minimum box for empty or undefined labels", () => {
    expect(estimatedBoxSize(undefined)).toEqual({ w: 120, h: 62 });
    expect(estimatedBoxSize("")).toEqual({ w: 120, h: 62 });
  });

  it("keeps a short label at BOX_MIN_W", () => {
    expect(estimatedBoxSize("Redis")).toEqual({ w: 120, h: 62 });
  });

  it("gives labels that used to wrap mid-word enough width to fit on one line", () => {
    for (const label of ["OrdersRepo", "PasswordHasher"]) {
      const size = estimatedBoxSize(label);
      expect(size.w - 32).toBeGreaterThanOrEqual(textWidth(label));
    }
  });

  it("gives Gateway enough width to fit on one line (regression: used to wrap as Gatewa/y)", () => {
    const size = estimatedBoxSize("Gateway");
    expect(size.w - 32).toBeGreaterThanOrEqual(textWidth("Gateway"));
  });

  it("wraps a long sentence onto multiple lines instead of growing past the aspect target", () => {
    const longWord = "A".repeat(25);
    const label = `${longWord} ${longWord} ${longWord}`;
    const single = estimatedBoxSize("A");
    const size = estimatedBoxSize(label);

    expect(size.h).toBeGreaterThan(single.h);
    expect(size.w).toBeLessThanOrEqual(BOX_ASPECT_TARGET * size.h);
  });

  it("returns integers", () => {
    const size = estimatedBoxSize("Some medium length label here");
    expect(Number.isInteger(size.w)).toBe(true);
    expect(Number.isInteger(size.h)).toBe(true);
  });

  it("never splits a long single word, even when it blows the aspect target", () => {
    const word = "A".repeat(40);
    const w = fitBoxWidth(word);
    expect(w).toBeGreaterThanOrEqual(textWidth(word) + 32);
  });

  it("caps width and pushes the label onto more lines when maxW is given", () => {
    const label = "Some medium length label here";
    const unbounded = estimatedBoxSize(label);
    const capped = estimatedBoxSize(label, 120);

    expect(capped.w).toBeLessThan(unbounded.w);
    expect(capped.h).toBeGreaterThan(unbounded.h);
  });
});

describe("geo-aware sizing (T15)", () => {
  const label = "Diamond";

  it("no geo prop is byte-identical to explicit geo=rectangle (regression: today's sizing unchanged)", () => {
    expect(estimatedBoxSize(label, undefined, {})).toEqual(
      estimatedBoxSize(label, undefined, { geo: "rectangle" }),
    );
  });

  it("a diamond box is strictly wider and taller than a rectangle box for the same label", () => {
    const rect = estimatedBoxSize(label, undefined, { geo: "rectangle" });
    const diamond = estimatedBoxSize(label, undefined, { geo: "diamond" });
    expect(diamond.w).toBeGreaterThan(rect.w);
    expect(diamond.h).toBeGreaterThan(rect.h);
  });

  it("the diamond's label rectangle fits inside its rhombus outline (Wl/w + Hl/h <= 1)", () => {
    const size = estimatedBoxSize(label, undefined, { geo: "diamond" });
    const wl = textWidth(label);
    const hl = lineHeightPx();
    expect(wl / size.w + hl / size.h).toBeLessThanOrEqual(1);
  });

  // The containment predicate per outline, restated independently of
  // `defaults.ts` - this is what caught the first cut, where `k` was solved
  // once on the rectangle basis and the label (which does not scale with the
  // box) still spilled past a triangle's slopes.
  const fits: Record<string, (a: number, b: number) => boolean> = {
    rect: () => true,
    ellipse: (a, b) => Math.hypot(a, b) <= 1,
    diamond: (a, b) => a + b <= 1,
    triangle: (a, b) => 2 * a + b <= 1,
    arrow: (a, b) => a <= 0.68 && b <= 0.24,
  };
  const model: Record<string, string> = {
    rectangle: "rect", "check-box": "rect", "x-box": "rect", cloud: "rect",
    ellipse: "ellipse", oval: "ellipse", hexagon: "ellipse", octagon: "ellipse",
    pentagon: "ellipse", heart: "ellipse",
    diamond: "diamond", rhombus: "diamond", "rhombus-2": "diamond",
    star: "diamond", trapezoid: "diamond",
    "arrow-up": "arrow", "arrow-down": "arrow", "arrow-left": "arrow",
    "arrow-right": "arrow",
    triangle: "triangle",
  };

  it.each(GEOS)("%s holds its label inside the outline, wrapped or not", (geo) => {
    for (const text of [label, "a much longer label that wraps onto more than one line"]) {
      const { w, h } = estimatedBoxSize(text, undefined, { geo });
      expect(w).toBeGreaterThanOrEqual(120);
      const { wl, hl } = labelExtent(text, w);
      expect(fits[model[geo]!]!(wl / w, hl / h)).toBe(true);
      expect(geoScale(text, undefined, { geo })).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("textWidth", () => {
  it("over-reserves rather than under-reserves for a wide-glyph string", () => {
    // "WWWW" is close to the widest realistic 4-char run; textWidth must not
    // under-predict what the real renderer draws.
    expect(textWidth("WWWW")).toBeGreaterThan(4 * 20.85);
  });
});

describe("estimatedNoteSize", () => {
  it("is 200x200 for empty or short text", () => {
    expect(estimatedNoteSize(undefined)).toEqual({ w: 200, h: 200 });
    expect(estimatedNoteSize("hi")).toEqual({ w: 200, h: 200 });
  });

  it("grows height with text length, reserving at least the measured requirement", () => {
    const text = "x".repeat(216);
    const size = estimatedNoteSize(text);
    expect(size.w).toBe(200);
    expect(size.h).toBeGreaterThanOrEqual(596);
  });
});
