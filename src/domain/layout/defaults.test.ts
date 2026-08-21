import { describe, expect, it } from "vitest";

import { estimatedBoxSize, estimatedNoteSize } from "./defaults.js";

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
      expect(size.w - 32).toBeGreaterThanOrEqual(label.length * 14);
    }
  });

  it("wraps a long sentence onto multiple lines, capping width and growing height", () => {
    const longWord = "A".repeat(25); // wider than usable line width on its own
    const label = `${longWord} ${longWord} ${longWord}`;
    const single = estimatedBoxSize("A");
    const size = estimatedBoxSize(label);

    expect(size.w).toBe(320);
    expect(size.h).toBeGreaterThan(single.h);
  });

  it("returns integers", () => {
    const size = estimatedBoxSize("Some medium length label here");
    expect(Number.isInteger(size.w)).toBe(true);
    expect(Number.isInteger(size.h)).toBe(true);
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
