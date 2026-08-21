import { describe, expect, it } from "vitest";

import { BOX_ASPECT_TARGET, estimatedBoxSize, estimatedNoteSize, fitBoxWidth } from "./defaults.js";
import { textWidth } from "./glyph-metrics.js";

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
