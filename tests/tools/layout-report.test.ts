import { describe, expect, it } from "vitest";

import type {
  IRBoxPositioned,
  IRDocPositioned,
  IREdge,
  IRElementPositioned,
  IRFramePositioned,
} from "../../src/domain/ir/index.js";
import type { LayoutMode } from "../../src/domain/layout/defaults.js";
import { arrowPath, layoutReport } from "../../tools/layout-report.mjs";

describe("tools/layout-report", () => {
  it("counts an arrow path crossing a non-endpoint box, but not without one", () => {
    const a = box({ id: "a", x: 0, y: 0, w: 100, h: 50 });
    const mid = box({ id: "mid", x: 150, y: 0, w: 100, h: 50 });
    const c = box({ id: "c", x: 300, y: 0, w: 100, h: 50 });
    const eAC = edge({ id: "e-ac", from: "a", to: "c" });

    const withMiddle = layoutReport(doc({ children: [a, mid, c, eAC] }));
    expect(withMiddle.split("\n")).toContain("arrow paths crossing a non-endpoint shape: 1");

    const withoutMiddle = layoutReport(doc({ children: [a, c, eAC] }));
    expect(withoutMiddle.split("\n")).toContain("arrow paths crossing a non-endpoint shape: 0");

    const eAB = edge({ id: "e-ab", from: "a", to: "mid" });
    const adjacentOnly = layoutReport(doc({ children: [a, mid, c, eAB] }));
    expect(adjacentOnly.split("\n")).toContain("arrow paths crossing a non-endpoint shape: 0");
  });

  it("pins overlap, crossing, and source-order counts on a hand-built doc", () => {
    // Two overlapping boxes (a, b) at the top level, ordered [b, a] so a
    // row-mode source-order violation fires; a frame (f) with two stacked
    // children (c, d) that does NOT violate its own col order; and two
    // edges (a->d, b->c) whose segments properly cross.
    const a = box({ id: "a", x: 0, y: 0, w: 100, h: 50 });
    const b = box({ id: "b", x: 50, y: 25, w: 100, h: 50 });
    const c = box({ id: "c", x: 20, y: 20, w: 60, h: 30 });
    const d = box({ id: "d", x: 20, y: 60, w: 60, h: 30 });
    const f = frame({ id: "f", x: 200, y: 0, w: 200, h: 100, children: [c, d] });
    const e1 = edge({ id: "e1", from: "a", to: "d" });
    const e2 = edge({ id: "e2", from: "b", to: "c" });

    const report = layoutReport(doc({ layout: "row", children: [b, a, f, e1, e2] }));
    const lines = report.split("\n");

    expect(lines).toContain("canvas: 400 x 100");
    expect(lines).toContain("overlapping shape pairs: 1");
    expect(lines).toContain("edge-edge crossings: 1");
    expect(lines).toContain("  root (row): 1");
    expect(lines).toContain("  f (col): 0");
  });
});

describe("arrowPath", () => {
  it("splits an elbow route on the wider axis", () => {
    expect(arrowPath({ x: 0, y: 0 }, { x: 100, y: 10 }, "elbow")).toEqual([
      { x: 0, y: 0 },
      { x: 50, y: 0 },
      { x: 50, y: 10 },
      { x: 100, y: 10 },
    ]);
  });

  it("splits an elbow route on the taller axis", () => {
    expect(arrowPath({ x: 0, y: 0 }, { x: 10, y: 100 }, "elbow")).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 50 },
      { x: 10, y: 50 },
      { x: 10, y: 100 },
    ]);
  });

  it("returns a straight chord for non-elbow kinds", () => {
    expect(arrowPath({ x: 0, y: 0 }, { x: 10, y: 100 }, "arc")).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 100 },
    ]);
  });
});

// -- fixture builders (mirrors src/domain/emit/emit.test.ts) ------------------

const SPAN = { file: "test.tldsl", line: 1, column: 1 };

function doc(input: { layout?: LayoutMode; children: IRElementPositioned[] }): IRDocPositioned {
  const { layout, children } = input;
  return {
    kind: "doc",
    id: "root",
    idExplicit: true,
    span: SPAN,
    children,
    ...(layout === undefined ? {} : { layout }),
  };
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
  layout?: LayoutMode;
  children: IRElementPositioned[];
}): IRFramePositioned {
  const { layout, ...rest } = input;
  return {
    kind: "frame",
    idExplicit: true,
    span: SPAN,
    ...rest,
    ...(layout === undefined ? {} : { layout }),
  };
}

function edge(input: { id: string; from: string; to: string }): IREdge {
  return { kind: "edge", idExplicit: true, span: SPAN, ...input };
}
