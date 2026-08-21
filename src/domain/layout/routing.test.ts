import { describe, expect, it } from "vitest";

import type { IRBoxPositioned, IRDocPositioned, IREdge, IRElementPositioned, IRFramePositioned } from "../ir/index.js";

import { computeEdgeBends } from "./routing.js";

const SPAN = { file: "test.tldsl", line: 1, column: 1 };

function doc(id: string, children: IRElementPositioned[]): IRDocPositioned {
  return { kind: "doc", id, idExplicit: false, span: SPAN, children };
}

function box(input: { id: string; x: number; y: number; w: number; h: number }): IRBoxPositioned {
  return { kind: "box", idExplicit: true, span: SPAN, ...input };
}

function frame(input: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  children: IRElementPositioned[];
}): IRFramePositioned {
  return { kind: "frame", idExplicit: true, span: SPAN, ...input };
}

function edge(input: { id: string; from: string; to: string }): IREdge {
  return { kind: "edge", idExplicit: true, span: SPAN, ...input };
}

describe("computeEdgeBends", () => {
  it("leaves an adjacent hop in a row straight (no shape crossed)", () => {
    const ir = doc("root", [
      box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
      box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
      box({ id: "c", x: 300, y: 0, w: 100, h: 50 }),
      edge({ id: "ab", from: "a", to: "b" }),
    ]);
    const bends = computeEdgeBends(ir);
    expect(bends.get("ab")).toBeUndefined();
  });

  it("bows a chord over two boxes in a row upward, with the exact deterministic sag", () => {
    // a -> d skips b and c; nothing else on the page, so both sides are
    // symmetric (boxes centred on the chord) and tie-breaks to "up".
    const ir = doc("root", [
      box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
      box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
      box({ id: "c", x: 300, y: 0, w: 100, h: 50 }),
      box({ id: "d", x: 450, y: 0, w: 100, h: 50 }),
      edge({ id: "ad", from: "a", to: "d" }),
    ]);
    const bends = computeEdgeBends(ir);
    const bend = bends.get("ad");
    expect(bend).toBeDefined();
    expect(bend!).toBeLessThan(0); // negative bend = bows up in page space
    // t at b and c is 1/3 and 2/3 -> f = 8/9 both; clearance = 25 (half box
    // height) + 12 margin = 37; sag = 37 / (8/9) = 41.625 -> rounds to 41.6.
    expect(bend).toBeCloseTo(-41.6, 5);
  });

  it("bows a chord in a column, with a computed sag", () => {
    const ir = doc("root", [
      box({ id: "a", x: 0, y: 0, w: 50, h: 100 }),
      box({ id: "b", x: 0, y: 150, w: 50, h: 100 }),
      box({ id: "c", x: 0, y: 300, w: 50, h: 100 }),
      edge({ id: "ac", from: "a", to: "c" }),
    ]);
    const bends = computeEdgeBends(ir);
    const bend = bends.get("ac");
    expect(bend).toBeDefined();
    // t at b is 0.5 -> f = 1; clearance = 25 (half box width) + 12 = 37 -> sag 37,
    // nothing else on the page so both sides tie and break to "left" (negative x).
    expect(bend).toBeCloseTo(37, 5);
  });

  it("leaves edges whose endpoints sit in different containers straight", () => {
    const ir = doc("root", [
      frame({
        id: "f1",
        x: 0,
        y: 0,
        w: 200,
        h: 200,
        children: [box({ id: "a", x: 0, y: 0, w: 100, h: 50 })],
      }),
      frame({
        id: "f2",
        x: 300,
        y: 0,
        w: 200,
        h: 200,
        children: [box({ id: "b", x: 0, y: 0, w: 100, h: 50 })],
      }),
      edge({ id: "ab", from: "a", to: "b" }),
    ]);
    const bends = computeEdgeBends(ir);
    expect(bends.get("ab")).toBeUndefined();
  });

  it("stays straight when boxed in on both sides (no viable side)", () => {
    const ir = doc("root", [
      box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
      box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
      box({ id: "c", x: 300, y: 0, w: 100, h: 50 }),
      box({ id: "d", x: 450, y: 0, w: 100, h: 50 }),
      // Squeezed in just above and below the row - not enough clearance
      // for the ~41.6 sag the chord over b/c would otherwise need.
      box({ id: "top", x: 200, y: -30, w: 50, h: 20 }),
      box({ id: "bottom", x: 200, y: 60, w: 50, h: 20 }),
      edge({ id: "ad", from: "a", to: "d" }),
    ]);
    const bends = computeEdgeBends(ir);
    expect(bends.get("ad")).toBeUndefined();
  });
});
