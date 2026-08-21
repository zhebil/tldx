import { describe, expect, it } from "vitest";

import { crowdedFraction, segmentHitsRect } from "../../tools/arrow-truth.mjs";

describe("segmentHitsRect", () => {
  const rect = { x: 100, y: 100, w: 50, h: 50 };

  it("hits when the segment passes through the rect", () => {
    expect(segmentHitsRect({ x: 0, y: 125 }, { x: 200, y: 125 }, rect)).toBe(true);
  });

  it("misses when the segment stays outside the rect", () => {
    expect(segmentHitsRect({ x: 0, y: 0 }, { x: 50, y: 50 }, rect)).toBe(false);
  });

  it("misses a segment that passes beside the rect on the same axis", () => {
    expect(segmentHitsRect({ x: 0, y: 0 }, { x: 0, y: 200 }, rect)).toBe(false);
  });
});

describe("crowdedFraction", () => {
  it("is 1 for two identical paths", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    expect(crowdedFraction(path, [...path], 8)).toBe(1);
  });

  it("is 0 for paths further apart than the threshold", () => {
    const a = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const b = [
      { x: 0, y: 20 },
      { x: 100, y: 20 },
    ];
    expect(crowdedFraction(a, b, 8)).toBe(0);
  });

  it("counts only the overlapping half of a path that diverges", () => {
    const a = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    const b = [
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 50 },
    ];
    expect(crowdedFraction(a, b, 8)).toBeCloseTo(0.58, 1);
  });
});
