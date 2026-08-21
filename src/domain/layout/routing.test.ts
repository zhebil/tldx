import { describe, expect, it } from "vitest";

import type { IRBoxPositioned, IRDocPositioned, IREdge, IRElementPositioned, IRFramePositioned } from "../ir/index.js";

import { computeEdgeRoutes } from "./routing.js";

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

describe("computeEdgeRoutes", () => {
  it("leaves an adjacent hop in a row straight (no shape crossed)", () => {
    const ir = doc("root", [
      box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
      box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
      box({ id: "c", x: 300, y: 0, w: 100, h: 50 }),
      edge({ id: "ab", from: "a", to: "b" }),
    ]);
    const routes = computeEdgeRoutes(ir);
    expect(routes.get("ab")).toBeUndefined();
  });

  it("bows a chord over two boxes in a row upward, exiting the top edge of both terminals", () => {
    // a -> d skips b and c; nothing else on the page, so both sides are
    // symmetric (boxes centred on the chord) and tie-breaks to "up".
    const ir = doc("root", [
      box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
      box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
      box({ id: "c", x: 300, y: 0, w: 100, h: 50 }),
      box({ id: "d", x: 450, y: 0, w: 100, h: 50 }),
      edge({ id: "ad", from: "a", to: "d" }),
    ]);
    const routes = computeEdgeRoutes(ir);
    const route = routes.get("ad");
    expect(route).toBeDefined();
    expect(route!.bend).toBeLessThan(0); // negative bend = bows up in page space
    // Anchors sit on the top edge (y=0), same for a and d, so the chord runs
    // flat along y=0; t at b and c is 1/3 and 2/3 -> f = 8/9 both; clearance
    // is just the margin (12) -> sag = 12 / (8/9) = 13.5.
    expect(route!.bend).toBeCloseTo(-13.5, 5);
    expect(route!.startAnchor).toEqual({ x: 0.5, y: 0 });
    expect(route!.endAnchor).toEqual({ x: 0.5, y: 0 });
  });

  it("bows a chord in a column, exiting the left edge of both terminals", () => {
    const ir = doc("root", [
      box({ id: "a", x: 0, y: 0, w: 50, h: 100 }),
      box({ id: "b", x: 0, y: 150, w: 50, h: 100 }),
      box({ id: "c", x: 0, y: 300, w: 50, h: 100 }),
      edge({ id: "ac", from: "a", to: "c" }),
    ]);
    const routes = computeEdgeRoutes(ir);
    const route = routes.get("ac");
    expect(route).toBeDefined();
    // Anchors sit on the left edge (x=0); t at b is 0.5 -> f = 1; clearance
    // is just the margin (12) -> sag = 12; nothing else on the page so both
    // sides tie and break to "neg" (left).
    expect(route!.bend).toBeCloseTo(12, 5);
    expect(route!.startAnchor).toEqual({ x: 0, y: 0.5 });
    expect(route!.endAnchor).toEqual({ x: 0, y: 0.5 });
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
    const routes = computeEdgeRoutes(ir);
    expect(routes.get("ab")).toBeUndefined();
  });

  it("stays straight when boxed in on both sides (no viable side)", () => {
    const ir = doc("root", [
      box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
      box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
      box({ id: "c", x: 300, y: 0, w: 100, h: 50 }),
      box({ id: "d", x: 450, y: 0, w: 100, h: 50 }),
      // Squeezed in just above and below the row - not enough clearance
      // for the 13.5 sag the chord over b/c would otherwise need.
      box({ id: "top", x: 200, y: -30, w: 50, h: 20 }),
      box({ id: "bottom", x: 200, y: 60, w: 50, h: 20 }),
      edge({ id: "ad", from: "a", to: "d" }),
    ]);
    const routes = computeEdgeRoutes(ir);
    expect(routes.get("ad")).toBeUndefined();
  });

  it("signed clearance ignores a crossed shape sitting entirely on the far side of the anchored chord", () => {
    // a -> d skips both bNear (pokes above the top-anchored chord, y -10..10)
    // and bFar (sits well below it, y 70..80). The old abs()-based clearance
    // would have demanded sag for bFar too (abs(0-70)+12=82); the signed
    // fix recognises bFar's far edge is already clear and contributes 0, so
    // the bow is driven by bNear alone.
    const ir = doc("root", [
      box({ id: "a", x: 0, y: 0, w: 100, h: 100 }),
      box({ id: "bNear", x: 200, y: -10, w: 100, h: 20 }),
      box({ id: "bFar", x: 300, y: 70, w: 100, h: 10 }),
      box({ id: "d", x: 450, y: 0, w: 100, h: 100 }),
      edge({ id: "ad", from: "a", to: "d" }),
    ]);
    const routes = computeEdgeRoutes(ir);
    const route = routes.get("ad");
    expect(route).toBeDefined();
    expect(route!.bend).toBeLessThan(0);
    // t at bNear = 200/450 = 4/9 -> f = 80/81; need = 0 - (-10-12) = 22;
    // sag = 22 * 81/80 = 22.275 -> rounds to -22.3.
    expect(route!.bend).toBeCloseTo(-22.3, 5);
  });

  it("lanes overlapping-span skips in the same row so the longer chord bows further", () => {
    // ad (span 50..500, skips b and c) and ce (span 350..650, skips d)
    // overlap on x in 350..500. Both tie-break to "neg" like the single-edge
    // cases above, landing them in the same lane group. ce is shorter so it
    // sorts first and keeps rank 0 (sag 12, matching a lone c->e skip); ad is
    // longer, ranks above it (sag 13.5 + one 20px lane step = 33.5), so its
    // bow reaches farther from the row than ce's.
    const ir = doc("root", [
      box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
      box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
      box({ id: "c", x: 300, y: 0, w: 100, h: 50 }),
      box({ id: "d", x: 450, y: 0, w: 100, h: 50 }),
      box({ id: "e", x: 600, y: 0, w: 100, h: 50 }),
      edge({ id: "ad", from: "a", to: "d" }),
      edge({ id: "ce", from: "c", to: "e" }),
    ]);
    const routes = computeEdgeRoutes(ir);
    const ad = routes.get("ad");
    const ce = routes.get("ce");
    expect(ad).toBeDefined();
    expect(ce).toBeDefined();
    expect(ad!.bend).toBeLessThan(0);
    expect(ce!.bend).toBeLessThan(0);
    expect(ce!.bend).toBeCloseTo(-12, 5);
    expect(ad!.bend).toBeCloseTo(-33.5, 5);
    expect(Math.abs(ad!.bend)).toBeGreaterThan(Math.abs(ce!.bend));
  });

  it("keeps rank 0 for two non-overlapping skips in the same row", () => {
    // Same a/b/c/d shape as the plain skip test above, duplicated 1000px to
    // the right as e/f/g/h. Both edges tie-break to "neg" and land in the
    // same lane group, but their spans (50..500 and 1050..1500) don't
    // overlap, so both keep rank 0 and bend identically to the single-edge
    // case (-13.5).
    const ir = doc("root", [
      box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
      box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
      box({ id: "c", x: 300, y: 0, w: 100, h: 50 }),
      box({ id: "d", x: 450, y: 0, w: 100, h: 50 }),
      box({ id: "e", x: 1000, y: 0, w: 100, h: 50 }),
      box({ id: "f", x: 1150, y: 0, w: 100, h: 50 }),
      box({ id: "g", x: 1300, y: 0, w: 100, h: 50 }),
      box({ id: "h", x: 1450, y: 0, w: 100, h: 50 }),
      edge({ id: "ad", from: "a", to: "d" }),
      edge({ id: "eh", from: "e", to: "h" }),
    ]);
    const routes = computeEdgeRoutes(ir);
    const ad = routes.get("ad");
    const eh = routes.get("eh");
    expect(ad).toBeDefined();
    expect(eh).toBeDefined();
    expect(ad!.bend).toBeCloseTo(-13.5, 5);
    expect(eh!.bend).toBeCloseTo(-13.5, 5);
  });
});
