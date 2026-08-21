import { describe, expect, it } from "vitest";

import { segmentHitsRect } from "../../tools/arrow-truth.mjs";

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
