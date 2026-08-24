import { describe, expect, it } from "vitest";

import type {
  IRBoxPositioned,
  IRDocPositioned,
  IREdge,
  IRElementPositioned,
  IRFramePositioned,
} from "../../src/domain/ir/index.js";
import type { LayoutMode } from "../../src/domain/layout/defaults.js";
import { layoutReport } from "../../tools/layout-report.mjs";

describe("tools/layout-report", () => {
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

  it("scores a row-major grid 0 source-order violations", () => {
    const children = [
      box({ id: "a", x: 0, y: 0, w: 50, h: 50 }),
      box({ id: "b", x: 100, y: 0, w: 50, h: 50 }),
      box({ id: "c", x: 200, y: 0, w: 50, h: 50 }),
      box({ id: "d", x: 0, y: 100, w: 50, h: 50 }),
      box({ id: "e", x: 100, y: 100, w: 50, h: 50 }),
      box({ id: "f", x: 200, y: 100, w: 50, h: 50 }),
    ];
    const report = layoutReport(doc({ layout: "grid", children }));
    expect(report.split("\n")).toContain("  root (grid): 0");
  });

  it("scores a serpentine grid 0 source-order violations", () => {
    const children = [
      box({ id: "a", x: 0, y: 0, w: 50, h: 50 }),
      box({ id: "b", x: 100, y: 0, w: 50, h: 50 }),
      box({ id: "c", x: 200, y: 0, w: 50, h: 50 }),
      box({ id: "d", x: 200, y: 100, w: 50, h: 50 }),
      box({ id: "e", x: 100, y: 100, w: 50, h: 50 }),
      box({ id: "f", x: 0, y: 100, w: 50, h: 50 }),
    ];
    const report = layoutReport(doc({ layout: "grid", children }));
    expect(report.split("\n")).toContain("  root (grid): 0");
  });

  it("still scores a grid that fits neither reading order above 0", () => {
    const children = [
      box({ id: "a", x: 0, y: 0, w: 50, h: 50 }),
      box({ id: "b", x: 200, y: 0, w: 50, h: 50 }),
      box({ id: "c", x: 100, y: 0, w: 50, h: 50 }),
      box({ id: "d", x: 300, y: 0, w: 50, h: 50 }),
    ];
    const report = layoutReport(doc({ layout: "grid", children }));
    const line = report.split("\n").find((l) => l.startsWith("  root (grid):"));
    expect(line).toBeDefined();
    const count = Number(line!.split(": ")[1]);
    expect(count).toBeGreaterThan(0);
  });
});

// -- fixture builders (mirrors src/domain/emit/emit.test.ts) ------------------

const SPAN = { file: "test.tldx", line: 1, column: 1 };

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
