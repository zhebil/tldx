import { describe, expect, it } from "vitest";

import type { IRBoxPositioned, IRDocPositioned, IREdge, IRElementPositioned, IRFramePositioned } from "../ir/index.js";

import { ARROW_LABEL_PADDING, arrowLabelLineHeight } from "./glyph-metrics.js";
import { computeEdgeRoutes, type LabelBox } from "./routing.js";

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

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

function edge(input: {
  id: string;
  from: string;
  to: string;
  label?: string;
  fromAnchor?: { x: number; y: number };
  toAnchor?: { x: number; y: number };
}): IREdge {
  return { kind: "edge", idExplicit: true, span: SPAN, ...input };
}

describe("computeEdgeRoutes", () => {
  it("leaves an adjacent hop in a row straight (no shape crossed), attached face to face (B13)", () => {
    const ir = doc("root", [
      box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
      box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
      box({ id: "c", x: 300, y: 0, w: 100, h: 50 }),
      edge({ id: "ab", from: "a", to: "b" }),
    ]);
    const routes = computeEdgeRoutes(ir);
    const route = routes.get("ab");
    expect(route).toBeDefined();
    expect(route!.bend).toBe(0);
    // Same height, side by side (no y-overlap check applies - they share the
    // full row): right face of a, left face of b, both vertically centred -
    // the same point `bodyExitPoint`'s centre-to-centre ray already landed
    // on for two equal-height neighbours, just made explicit.
    expect(route!.startAnchor).toEqual({ x: 1, y: 0.5 });
    expect(route!.endAnchor).toEqual({ x: 0, y: 0.5 });
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

  it("leaves a cross-container edge straight when nothing sits between its endpoints", () => {
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
    // Straight, but no longer route-less: B13 attaches the facing edges
    // explicitly rather than leaving tldraw to aim centre-to-centre.
    expect(routes.get("ab")!.bend).toBe(0);
    expect(routes.get("ab")!.startAnchor).toEqual({ x: 1, y: 0.5 });
    expect(routes.get("ab")!.endAnchor).toEqual({ x: 0, y: 0.5 });
  });

  it("swings wide when the lane pass finds no viable side", () => {
    const ir = doc("root", [
      box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
      box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
      box({ id: "c", x: 300, y: 0, w: 100, h: 50 }),
      box({ id: "d", x: 450, y: 0, w: 100, h: 50 }),
      // Squeezed in just above and below the row - not enough clearance
      // for the 13.5 sag the chord over b/c would otherwise need, so the
      // lane pass declines and the detour pass bows right past them.
      box({ id: "top", x: 200, y: -30, w: 50, h: 20 }),
      box({ id: "bottom", x: 200, y: 60, w: 50, h: 20 }),
      edge({ id: "ad", from: "a", to: "d" }),
    ]);
    const routes = computeEdgeRoutes(ir);
    const route = routes.get("ad");
    expect(route).toBeDefined();
    // Past `bottom`'s far edge (y 80) rather than the 13.5 the row alone wanted.
    expect(Math.abs(route!.bend)).toBeGreaterThan(60);
    // B13 attaches the facing edges first; the detour grows the bend around
    // that, it does not fall back to a centre-to-centre chord.
    expect(route!.startAnchor).toEqual({ x: 1, y: 0.5 });
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

  it("routes a cross-container edge, bowing around obstacles outside both endpoints' containers", () => {
    // Same geometry as the plain "bows a chord over two boxes" test above,
    // but a and d each sit inside their own top-level frame while b and c
    // stay outside any frame. The chord still needs to clear b and c, so it
    // should bow exactly like the non-nested case (frames aren't obstacles).
    const ir = doc("root", [
      frame({ id: "f1", x: 0, y: 0, w: 100, h: 50, children: [box({ id: "a", x: 0, y: 0, w: 100, h: 50 })] }),
      box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
      box({ id: "c", x: 300, y: 0, w: 100, h: 50 }),
      frame({ id: "f2", x: 450, y: 0, w: 100, h: 50, children: [box({ id: "d", x: 0, y: 0, w: 100, h: 50 })] }),
      edge({ id: "ad", from: "a", to: "d" }),
    ]);
    const routes = computeEdgeRoutes(ir);
    const route = routes.get("ad");
    expect(route).toBeDefined();
    expect(route!.bend).toBeCloseTo(-13.5, 5);
    expect(route!.startAnchor).toEqual({ x: 0.5, y: 0 });
    expect(route!.endAnchor).toEqual({ x: 0.5, y: 0 });
  });

  it("groups cross-container edges by lowest common ancestor for lane assignment", () => {
    // Same shapes/spans as "lanes overlapping-span skips in the same row"
    // above (ad skips b/c, ce skips d, spans overlap 350..500), but a and e
    // are nested one level inside frames f1/f5, both siblings under an
    // "outer" frame alongside top-level b/c/d. ad's endpoints (f1, outer)
    // and ce's endpoints (outer, f5) both resolve to the same LCA, "outer",
    // so they land in the same lane group exactly as the flat case: ce
    // (shorter span) keeps rank 0 (-12), ad ranks above it (-33.5).
    const ir = doc("root", [
      frame({
        id: "outer",
        x: 0,
        y: 0,
        w: 700,
        h: 50,
        children: [
          frame({ id: "f1", x: 0, y: 0, w: 100, h: 50, children: [box({ id: "a", x: 0, y: 0, w: 100, h: 50 })] }),
          box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
          box({ id: "c", x: 300, y: 0, w: 100, h: 50 }),
          box({ id: "d", x: 450, y: 0, w: 100, h: 50 }),
          frame({ id: "f5", x: 600, y: 0, w: 100, h: 50, children: [box({ id: "e", x: 0, y: 0, w: 100, h: 50 })] }),
        ],
      }),
      edge({ id: "ad", from: "a", to: "d" }),
      edge({ id: "ce", from: "c", to: "e" }),
    ]);
    const routes = computeEdgeRoutes(ir);
    const ad = routes.get("ad");
    const ce = routes.get("ce");
    expect(ad).toBeDefined();
    expect(ce).toBeDefined();
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

  it("gives a self edge a loop route with distinct anchors and a non-zero bend", () => {
    const ir = doc("root", [
      box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
      edge({ id: "aa", from: "a", to: "a" }),
    ]);
    const routes = computeEdgeRoutes(ir);
    const route = routes.get("aa");
    expect(route).toBeDefined();
    expect(route!.bend).not.toBe(0);
    expect(route!.startAnchor).toBeDefined();
    expect(route!.endAnchor).toBeDefined();
    expect(route!.startAnchor).not.toEqual(route!.endAnchor);
  });

  it("fans two edges on one pair with nothing between them into equal-magnitude bends, no anchors", () => {
    const ir = doc("root", [
      box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
      box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
      edge({ id: "ab", from: "a", to: "b" }),
      edge({ id: "ba", from: "b", to: "a" }),
    ]);
    const routes = computeEdgeRoutes(ir);
    const ab = routes.get("ab");
    const ba = routes.get("ba");
    expect(ab).toBeDefined();
    expect(ba).toBeDefined();
    // `bend` is measured against the arrow's own direction of travel, so two
    // antiparallel arrows carrying the same bend bow to opposite sides in page space.
    expect(ab!.bend).toBeCloseTo(ba!.bend, 5);
    expect(Math.abs(ab!.bend)).toBeGreaterThanOrEqual(8);
    expect(ab!.startAnchor).toBeUndefined();
    expect(ab!.endAnchor).toBeUndefined();
    expect(ba!.startAnchor).toBeUndefined();
    expect(ba!.endAnchor).toBeUndefined();
  });

  it("fans three edges on one pair, dropping the zero-offset middle lane", () => {
    const ir = doc("root", [
      box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
      box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
      edge({ id: "ab1", from: "a", to: "b" }),
      edge({ id: "ba", from: "b", to: "a" }),
      edge({ id: "ab2", from: "a", to: "b" }),
    ]);
    const routes = computeEdgeRoutes(ir);
    const ab1 = routes.get("ab1");
    const ba = routes.get("ba");
    const ab2 = routes.get("ab2");
    expect(ab1).toBeDefined();
    expect(ab2).toBeDefined();
    // The middle lane keeps zero offset; B13 still attaches it face to face.
    expect(ba!.bend).toBe(0);
    expect(ab1!.bend).not.toBe(0);
    expect(ab2!.bend).not.toBe(0);
    expect(Math.sign(ab1!.bend)).not.toBe(Math.sign(ab2!.bend));
    expect(Math.abs(ab1!.bend)).toBeCloseTo(Math.abs(ab2!.bend), 5);
  });

  it("leaves a lone edge on a pair with nothing between it straight (fan does not fire for singletons)", () => {
    const ir = doc("root", [
      box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
      box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
      edge({ id: "ab", from: "a", to: "b" }),
    ]);
    const routes = computeEdgeRoutes(ir);
    expect(routes.get("ab")!.bend).toBe(0);
    expect(routes.get("ab")!.startAnchor).toEqual({ x: 1, y: 0.5 });
  });

  describe("reciprocal pair label clearance (B1)", () => {
    // Reproduces the tcp-groups.tldsl.jsx defect: `A -> B` and `B -> A` on a
    // short chord with long labels bow apart (T35's fan) but, at the bare
    // fan step, still stamp their labels on the same spot (D14's other half).
    const LONG_LABEL_A = "active open / SYN";
    const LONG_LABEL_B = "close / timeout";

    it("widens the fan step for a labelled reciprocal pair so their labels don't overlap", () => {
      const ir = doc("root", [
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
        edge({ id: "ab", from: "a", to: "b", label: LONG_LABEL_A }),
        edge({ id: "ba", from: "b", to: "a", label: LONG_LABEL_B }),
      ]);
      const routes = computeEdgeRoutes(ir);
      const ab = routes.get("ab");
      const ba = routes.get("ba");
      expect(ab?.labelBox).toBeDefined();
      expect(ba?.labelBox).toBeDefined();
      expect(boxesOverlap(ab!.labelBox!, ba!.labelBox!)).toBe(false);

      // Wider than the bare (unlabelled) fan gives the same pair geometry -
      // otherwise this is just re-testing T35's plain fan, not the label fix.
      const bareIr = doc("root", [
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
        edge({ id: "ab", from: "a", to: "b" }),
        edge({ id: "ba", from: "b", to: "a" }),
      ]);
      const bareBend = Math.abs(computeEdgeRoutes(bareIr).get("ab")!.bend);
      expect(Math.abs(ab!.bend)).toBeGreaterThan(bareBend);
    });

    it("leaves the fan step alone when a reciprocal pair's labels already fit", () => {
      const ir = doc("root", [
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
        edge({ id: "ab", from: "a", to: "b", label: "ok" }),
        edge({ id: "ba", from: "b", to: "a", label: "no" }),
      ]);
      const bareIr = doc("root", [
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
        edge({ id: "ab", from: "a", to: "b" }),
        edge({ id: "ba", from: "b", to: "a" }),
      ]);
      const bend = Math.abs(computeEdgeRoutes(ir).get("ab")!.bend);
      const bareBend = Math.abs(computeEdgeRoutes(bareIr).get("ab")!.bend);
      expect(bend).toBeCloseTo(bareBend, 5);
    });

    it("does not widen the fan step past a box the wider arc would cross", () => {
      const withoutBlocker = doc("root", [
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
        edge({ id: "ab", from: "a", to: "b", label: LONG_LABEL_A }),
        edge({ id: "ba", from: "b", to: "a", label: LONG_LABEL_B }),
      ]);
      const wideBend = Math.abs(computeEdgeRoutes(withoutBlocker).get("ab")!.bend);

      const withBlocker = doc("root", [
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
        box({ id: "blocker", x: 60, y: 40 + wideBend / 2, w: 80, h: 40 }),
        edge({ id: "ab", from: "a", to: "b", label: LONG_LABEL_A }),
        edge({ id: "ba", from: "b", to: "a", label: LONG_LABEL_B }),
      ]);
      const guardedBend = Math.abs(computeEdgeRoutes(withBlocker).get("ab")!.bend);
      expect(guardedBend).toBeLessThan(wideBend);
    });
  });

  describe("detour around obstacles", () => {
    it("bows a diagonal edge around the box its straight chord runs through", () => {
      const ir = doc("root", [
        frame({ id: "top", x: 0, y: 0, w: 500, h: 100, children: [box({ id: "a", x: 20, y: 20, w: 100, h: 50 })] }),
        frame({
          id: "middle",
          x: 0,
          y: 200,
          w: 500,
          h: 100,
          children: [box({ id: "mid", x: 150, y: 20, w: 120, h: 50 })],
        }),
        frame({
          id: "bottom",
          x: 0,
          y: 400,
          w: 500,
          h: 100,
          children: [box({ id: "z", x: 300, y: 20, w: 100, h: 50 })],
        }),
        edge({ id: "az", from: "a", to: "z" }),
      ]);
      const routes = computeEdgeRoutes(ir);
      const route = routes.get("az");
      expect(route).toBeDefined();
      expect(Math.abs(route!.bend)).toBeGreaterThanOrEqual(8);
      // Centre bindings: the detour never re-anchors, it only bends.
      expect(route!.startAnchor).toBeUndefined();
      expect(route!.endAnchor).toBeUndefined();
    });

    it("leaves a long diagonal edge alone when its chord already runs through empty space", () => {
      const ir = doc("root", [
        frame({ id: "top", x: 0, y: 0, w: 900, h: 100, children: [box({ id: "a", x: 20, y: 20, w: 100, h: 50 })] }),
        frame({
          id: "bottom",
          x: 0,
          y: 800,
          w: 900,
          h: 100,
          children: [box({ id: "z", x: 700, y: 20, w: 100, h: 50 })],
        }),
        edge({ id: "az", from: "a", to: "z" }),
      ]);
      expect(computeEdgeRoutes(ir).get("az")).toBeUndefined();
    });
  });

  describe("label placement", () => {
    it("slides two labels spanning the same gap apart when their midpoint boxes would overlap", () => {
      const ir = doc("root", [
        box({ id: "a1", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "a2", x: 0, y: 300, w: 100, h: 50 }),
        box({ id: "b1", x: 10, y: 0, w: 100, h: 50 }),
        box({ id: "b2", x: 10, y: 300, w: 100, h: 50 }),
        edge({ id: "a1a2", from: "a1", to: "a2", label: "loading" }),
        edge({ id: "b1b2", from: "b1", to: "b2", label: "saving" }),
      ]);
      const routes = computeEdgeRoutes(ir);
      const posA = routes.get("a1a2")?.labelPosition ?? 0.5;
      const posB = routes.get("b1b2")?.labelPosition ?? 0.5;
      expect(posA).not.toBe(posB);
    });

    it("slides a label off a foreign box sitting at its geometric midpoint", () => {
      // The obstacle is a wall far wider than the chord, so no detour bend
      // gets around it and the label is the only thing left to move.
      const ir = doc("root", [
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "d", x: 300, y: 300, w: 100, h: 50 }),
        box({ id: "obstacle", x: -800, y: 125, w: 2000, h: 100 }),
        edge({ id: "ad", from: "a", to: "d", label: "build" }),
      ]);
      const routes = computeEdgeRoutes(ir);
      const route = routes.get("ad");
      expect(route?.labelPosition).toBeDefined();
      expect(route?.labelPosition).not.toBe(0.5);
    });

    it("keeps a short label at the default midpoint when nothing crowds it", () => {
      const ir = doc("root", [
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 300, y: 0, w: 100, h: 50 }),
        edge({ id: "ab", from: "a", to: "b", label: "ok" }),
      ]);
      const routes = computeEdgeRoutes(ir);
      const route = routes.get("ab");
      expect(route === undefined || route.labelPosition === undefined || route.labelPosition === 0.5).toBe(true);
    });

    it("grows the bend to pull a label off a shape no candidate `t` clears (B2/D11)", () => {
      // Same shape of the tcp-groups.tldsl.jsx repro: `fin1 -> timeWait` is a
      // vertical-axis skip whose minimal (unlabelled) bend only has to clear
      // the two flanking shapes' *line*, not a label wide enough to still
      // cover one of them at every candidate `t` - sliding along the arc
      // can't fix that, only widening the arc can.
      const fin1 = { id: "fin1", x: 246, y: 0, w: 180, h: 60 };
      const timeWait = { id: "timeWait", x: 246, y: 500, w: 180, h: 60 };
      const fin2 = { id: "fin2", x: 96, y: 90, w: 180, h: 380 };
      const closing = { id: "closing", x: 396, y: 90, w: 180, h: 380 };

      const bareIr = doc("root", [box(fin1), box(timeWait), box(fin2), box(closing), edge({ id: "e", from: "fin1", to: "timeWait" })]);
      const bareBend = Math.abs(computeEdgeRoutes(bareIr).get("e")!.bend);

      const ir = doc("root", [
        box(fin1),
        box(timeWait),
        box(fin2),
        box(closing),
        edge({ id: "e", from: "fin1", to: "timeWait", label: "recv FIN,ACK / ACK" }),
      ]);
      const routes = computeEdgeRoutes(ir);
      const route = routes.get("e");
      expect(route?.labelBox).toBeDefined();
      expect(boxesOverlap(route!.labelBox!, fin2)).toBe(false);
      expect(boxesOverlap(route!.labelBox!, closing)).toBe(false);
      // The fix widens the bend past what clearing the shapes' outlines
      // alone would need - otherwise this is just re-testing the plain
      // detour, not the label-driven growth.
      expect(Math.abs(route!.bend)).toBeGreaterThan(bareBend);
    });
  });

  describe("obstacle correction after candidate/lane (B5)", () => {
    it("moves a candidate edge off its analytically-chosen side when that side actually crosses an off-axis shape invisible to computeCandidate (event-driven.tldsl.jsx repro)", () => {
      // t-payments -> dlq is a vertical-axis skip; `notifications` is the one
      // shape computeCandidate's own `crossed` set finds (its y-centre sits
      // strictly between the endpoints), so its x-extent (181..440) sets
      // `bandMin`/`bandMax` for the "how far can we lean" check. `t-orders`
      // sits beside t-payments (same row, not between the endpoints, so
      // `crossed` never sees it) but its right edge (284) sits *inside* that
      // band (181..440) rather than fully outside it - the one case the old
      // `gap()` heuristic's "only shapes fully outside the band limit us"
      // rule doesn't count as a limiter, so the analytic pass picks a side
      // as if nothing were in the way there. The real arc, still ramping up
      // its bow near t-payments, clips t-orders anyway - `computeCandidate`
      // is unchanged by B5 and picks the identical side whether or not
      // t-orders is even in the diagram, so the two variants below get the
      // same bend from the analytic pass alone. `clearObstaclesOnEveryRoute`
      // is the only pass that re-tests the *actual* rendered arc against
      // every shape (not just `crossed`), so a materially different final
      // bend once t-orders is added is only explainable by that correction
      // actually firing.
      const tPayments = { id: "t-payments", x: 332, y: 238, w: 175, h: 62 };
      const dlq = { id: "dlq", x: 294, y: 653, w: 217, h: 62 };
      const tOrders = { id: "t-orders", x: 145, y: 238, w: 139, h: 62 };
      const notifications = { id: "notifications", x: 181, y: 446, w: 259, h: 62 };

      const withoutTOrders = doc("root", [
        box(tPayments),
        box(dlq),
        box(notifications),
        edge({ id: "e", from: "t-payments", to: "dlq" }),
      ]);
      const bareBend = computeEdgeRoutes(withoutTOrders).get("e")!.bend;

      const withTOrders = doc("root", [
        box(tPayments),
        box(dlq),
        box(tOrders),
        box(notifications),
        edge({ id: "e", from: "t-payments", to: "dlq" }),
      ]);
      const correctedBend = computeEdgeRoutes(withTOrders).get("e")!.bend;

      // A blind correction pass would leave this identical to `bareBend`
      // (same sign, same magnitude) since t-orders is invisible to the
      // candidate/lane pass either way - the fix has to actually change the
      // outcome once the obstacle is real.
      expect(Math.sign(correctedBend)).not.toBe(Math.sign(bareBend));
    });
  });

  describe("authored anchors win over the router (B9)", () => {
    it("an authored fromSide/toSide overrides the candidate/lane pass's own anchor pick", () => {
      // Same shape as "bows a chord over two boxes in a row upward" - left
      // to itself the router ties to the top face ({0.5,0}) on both ends.
      // Authoring the bottom face instead must survive candidate/lane.
      const ir = doc("root", [
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
        box({ id: "c", x: 300, y: 0, w: 100, h: 50 }),
        box({ id: "d", x: 450, y: 0, w: 100, h: 50 }),
        edge({
          id: "ad",
          from: "a",
          to: "d",
          fromAnchor: { x: 0.5, y: 1 },
          toAnchor: { x: 0.5, y: 1 },
        }),
      ]);
      const route = computeEdgeRoutes(ir).get("ad");
      expect(route?.startAnchor).toEqual({ x: 0.5, y: 1 });
      expect(route?.endAnchor).toEqual({ x: 0.5, y: 1 });
    });

    it("a self-loop's authored anchors override the default loop terminals", () => {
      const ir = doc("root", [
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        edge({
          id: "loop",
          from: "a",
          to: "a",
          fromAnchor: { x: 0.1, y: 0 },
          toAnchor: { x: 0.9, y: 0 },
        }),
      ]);
      const route = computeEdgeRoutes(ir).get("loop");
      expect(route?.startAnchor).toEqual({ x: 0.1, y: 0 });
      expect(route?.endAnchor).toEqual({ x: 0.9, y: 0 });
    });

    it("obstacle clearing grows the bend around a fixed authored anchor instead of overriding it", () => {
      // a and c share no layout axis (computeCandidate has nothing to
      // work with), so without an authored anchor this edge would stay a
      // straight, anchor-less chord. fromSide="right"/toSide="left" pins a
      // straight line that runs directly through "blocker".
      const withoutBlocker = doc("root", [
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "c", x: 300, y: 200, w: 100, h: 50 }),
        edge({
          id: "ac",
          from: "a",
          to: "c",
          fromAnchor: { x: 1, y: 0.5 },
          toAnchor: { x: 0, y: 0.5 },
        }),
      ]);
      const bareRoute = computeEdgeRoutes(withoutBlocker).get("ac");
      expect(bareRoute?.bend ?? 0).toBe(0);

      const withBlocker = doc("root", [
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "c", x: 300, y: 200, w: 100, h: 50 }),
        box({ id: "blocker", x: 150, y: 95, w: 100, h: 60 }),
        edge({
          id: "ac",
          from: "a",
          to: "c",
          fromAnchor: { x: 1, y: 0.5 },
          toAnchor: { x: 0, y: 0.5 },
        }),
      ]);
      const route = computeEdgeRoutes(withBlocker).get("ac");
      // The anchor itself is a fixed constraint, never overridden...
      expect(route?.startAnchor).toEqual({ x: 1, y: 0.5 });
      expect(route?.endAnchor).toEqual({ x: 0, y: 0.5 });
      // ...but the obstacle it now runs through still gets routed around.
      expect(route?.bend ?? 0).not.toBe(0);
    });
  });

  describe("label squish avoidance (B4)", () => {
    it("grows the bend of a short diagonal skip so a long label stops wrapping to more lines than a box label would", () => {
      // Mirrors tcp-groups.tldsl.jsx's `listen -> syn_rcvd` defect: a short
      // diagonal gap between two nested-container boxes with a label wide
      // enough that tldraw's own arrowLabel.ts squishes it hard.
      const LONG_LABEL = "recv SYN / SYN,ACK";
      const withLabel = doc("root", [
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 140, y: 114, w: 100, h: 50 }),
        edge({ id: "e", from: "a", to: "b", label: LONG_LABEL }),
      ]);
      const withoutLabel = doc("root", [
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 140, y: 114, w: 100, h: 50 }),
        edge({ id: "e", from: "a", to: "b" }),
      ]);

      const bareBend = computeEdgeRoutes(withoutLabel).get("e")?.bend ?? 0;
      const route = computeEdgeRoutes(withLabel).get("e");

      // Nothing else would move this edge (no shared axis, no obstacle) -
      // any bend at all is squish avoidance, not some other pass.
      expect(bareBend).toBe(0);
      expect(Math.abs(route?.bend ?? 0)).toBeGreaterThan(0);

      // tldraw only ever wraps to whole lines - a label rendered at (close
      // to) a single line's height is materially better than the 3-line
      // wrap the un-widened chord produces.
      const oneLine = arrowLabelLineHeight({ label: LONG_LABEL } as never) + 2 * ARROW_LABEL_PADDING;
      expect(route?.labelBox?.h ?? Infinity).toBeLessThan(oneLine * 1.5);
    });

    it("leaves a reciprocal pair's fan step alone when both labels are short enough tldraw never squishes them", () => {
      // A label narrower than tldraw's own 64px squish floor renders at its
      // natural width no matter how short the gap is - this must stay a
      // pure no-op, the same guarantee the pre-existing fan-step test above
      // already pins for the *fan* pass; this one pins it for the new
      // squish pass specifically.
      const ir = doc("root", [
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
        edge({ id: "ab", from: "a", to: "b", label: "ok" }),
      ]);
      const bare = doc("root", [
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
        edge({ id: "ab", from: "a", to: "b" }),
      ]);
      expect(computeEdgeRoutes(ir).get("ab")?.bend ?? 0).toBe(
        computeEdgeRoutes(bare).get("ab")?.bend ?? 0,
      );
    });

    it("never grows a bend into an obstacle just to relieve squish", () => {
      const LONG_LABEL = "recv SYN / SYN,ACK";
      const blocked = doc("root", [
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 140, y: 114, w: 100, h: 50 }),
        // Covers both perpendicular directions the chord could bow into.
        box({ id: "blocker-pos", x: -400, y: -400, w: 900, h: 900 }),
        edge({ id: "e", from: "a", to: "b", label: LONG_LABEL }),
      ]);
      const route = computeEdgeRoutes(blocked).get("e");
      // A blocker this large leaves no room to grow into on either side -
      // the squish pass must give up rather than cross it.
      expect(route?.bend ?? 0).toBe(0);
    });
  });
});
