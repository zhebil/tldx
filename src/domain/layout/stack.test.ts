import { describe, expect, it } from "vitest";

import { lower } from "../ir/lower.js";
import type {
  IRBoxPositioned,
  IRElementPositioned,
  IRFramePositioned,
  IRNotePositioned,
} from "../ir/index.js";
import type { AstNode } from "../parser/ast.js";
import { astBuilders } from "../parser/ast.fixture.js";

import { BOX_ASPECT_TARGET, boxHeightForWidth, estimatedBoxSize, fitBoxWidth } from "./defaults.js";
import { arrowLabelLineHeight, arrowLabelWidth } from "./glyph-metrics.js";
import {
  bestGridCols,
  findFanGroups,
  formsChain,
  hasSkipEdge,
  hybridLayout,
  skipRowGaps,
  type AutoPlacer,
} from "./stack.js";

const { box, doc, edge, frame, note } = astBuilders();

/**
 * Trivial deterministic stub placer: lays nodes out in a row (source order)
 * and reports the tight bounding size, padding included. Enough to prove
 * `hybridLayout` delegates to the injected placer without pulling in ELK.
 */
const stubPlaceAuto: AutoPlacer = async (req) => {
  const positions = new Map<string, { x: number; y: number }>();
  let cursor = req.padLeft;
  let maxH = 0;
  for (const n of req.nodes) {
    positions.set(n.id, { x: cursor, y: req.padTop });
    cursor += n.w + req.gap;
    maxH = Math.max(maxH, n.h);
  }
  const w = req.nodes.length === 0
    ? req.padLeft + req.padRight
    : cursor - req.gap + req.padRight;
  const h = req.padTop + maxH + req.padBottom;
  return { positions, w, h };
};

function layoutAst(ast: AstNode, placeAuto: AutoPlacer = stubPlaceAuto) {
  const { ir, diagnostics } = lower(ast);
  expect(diagnostics).toEqual([]);
  if (ir === null) throw new Error("lower returned null ir");
  return hybridLayout(ir, placeAuto);
}

function boxById(children: readonly IRElementPositioned[], id: string): IRBoxPositioned {
  const el = children.find((c) => c.kind === "box" && c.id === id);
  if (el === undefined) throw new Error(`no box '${id}'`);
  return el as IRBoxPositioned;
}

function frameById(children: readonly IRElementPositioned[], id: string): IRFramePositioned {
  const el = children.find((c) => c.kind === "frame" && c.id === id);
  if (el === undefined) throw new Error(`no frame '${id}'`);
  return el as IRFramePositioned;
}

function noteById(children: readonly IRElementPositioned[], id: string): IRNotePositioned {
  const el = children.find((c) => c.kind === "note" && c.id === id);
  if (el === undefined) throw new Error(`no note '${id}'`);
  return el as IRNotePositioned;
}

describe("hybridLayout", () => {
  it("stacks col children top-to-bottom in source order", async () => {
    const result = await layoutAst(
      doc({ layout: "col" }, [
        box({ id: "a", label: "A" }),
        box({ id: "b", label: "B" }),
        box({ id: "c", label: "C" }),
      ]),
    );
    const a = boxById(result.children, "a");
    const b = boxById(result.children, "b");
    const c = boxById(result.children, "c");
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
    expect(b.y).toBeGreaterThan(a.y);
    expect(c.y).toBeGreaterThan(b.y);
    expect(b.x).toBe(0);
    expect(c.x).toBe(0);
  });

  it("defaults to col when layout is absent", async () => {
    const result = await layoutAst(
      doc({}, [
        box({ id: "a", label: "A" }),
        box({ id: "b", label: "B" }),
      ]),
    );
    const a = boxById(result.children, "a");
    const b = boxById(result.children, "b");
    expect(a.x).toBe(0);
    expect(b.x).toBe(0);
    expect(b.y).toBeGreaterThan(a.y);
  });

  it("stacks row children left-to-right in source order", async () => {
    const result = await layoutAst(
      doc({ layout: "row" }, [
        box({ id: "a", label: "A" }),
        box({ id: "b", label: "B" }),
        box({ id: "c", label: "C" }),
      ]),
    );
    const a = boxById(result.children, "a");
    const b = boxById(result.children, "b");
    const c = boxById(result.children, "c");
    expect(a.y).toBe(0);
    expect(a.x).toBe(0);
    expect(b.x).toBeGreaterThan(a.x);
    expect(c.x).toBeGreaterThan(b.x);
    expect(b.y).toBe(0);
    expect(c.y).toBe(0);
  });

  it("places grid children row-major", async () => {
    const result = await layoutAst(
      doc({ layout: "grid", cols: 2 }, [
        box({ id: "a", label: "A" }),
        box({ id: "b", label: "B" }),
        box({ id: "c", label: "C" }),
        box({ id: "d", label: "D" }),
      ]),
    );
    const a = boxById(result.children, "a");
    const b = boxById(result.children, "b");
    const c = boxById(result.children, "c");
    const d = boxById(result.children, "d");
    // row 0: a, b side by side
    expect(a.y).toBe(b.y);
    expect(b.x).toBeGreaterThan(a.x);
    // row 1: c, d side by side, below row 0
    expect(c.y).toBe(d.y);
    expect(c.y).toBeGreaterThan(a.y);
    expect(c.x).toBe(a.x);
    expect(d.x).toBeGreaterThan(c.x);
  });

  it("keeps an explicit grid row-major, not serpentine", async () => {
    const result = await layoutAst(
      doc({ layout: "grid", cols: 3 }, [
        box({ id: "a", label: "A" }),
        box({ id: "b", label: "B" }),
        box({ id: "c", label: "C" }),
        box({ id: "d", label: "D" }),
      ]),
    );
    const a = boxById(result.children, "a");
    const d = boxById(result.children, "d");
    // row 1's first child (d) stays under column 0, same x as row 0's a
    expect(d.x).toBe(a.x);
  });

  it("sizes a nested frame to its content bounding box", async () => {
    const result = await layoutAst(
      doc({ layout: "col" }, [
        frame({ id: "f", layout: "col", pad: 10, gap: 5 }, [
          box({ id: "a", label: "A" }),
          box({ id: "b", label: "B" }),
        ]),
      ]),
    );
    const f = frameById(result.children, "f");
    const a = boxById(f.children, "a");
    const b = boxById(f.children, "b");
    const sizeA = estimatedBoxSize("A");
    const sizeB = estimatedBoxSize("B");
    expect(a.x).toBe(10);
    expect(a.y).toBe(10); // pad only - box-only children don't need title clearance
    expect(b.y).toBe(a.y + sizeA.h + 5);
    expect(f.w).toBe(Math.max(sizeA.w, sizeB.w) + 10 + 10);
    expect(f.h).toBe(b.y + sizeB.h + 10);
  });

  it("reserves title clearance above the first child when a frame has a nested frame", async () => {
    const result = await layoutAst(
      doc({ layout: "col" }, [
        frame({ id: "outer", layout: "col", pad: 10, gap: 5 }, [
          frame({ id: "inner", name: "Inner", layout: "col", pad: 10, gap: 5 }, [
            box({ id: "a", label: "A" }),
          ]),
        ]),
      ]),
    );
    const outer = frameById(result.children, "outer");
    const inner = frameById(outer.children, "inner");
    expect(inner.y).toBe(10 + 30); // pad + FRAME_TITLE_PX
  });

  it("does not reserve title clearance above the first child when a frame has a nested group", async () => {
    const result = await layoutAst(
      doc({ layout: "col" }, [
        frame({ id: "outer", layout: "col", pad: 10, gap: 5 }, [
          frame(
            { id: "inner", name: "Inner", layout: "col", pad: 10, gap: 5 },
            [box({ id: "a", label: "A" })],
            true,
          ),
        ]),
      ]),
    );
    const outer = frameById(result.children, "outer");
    const inner = frameById(outer.children, "inner");
    expect(inner.y).toBe(10); // pad only - a group draws no title, no clearance needed
  });

  it("does not reserve title clearance above the first child when a nested frame has no name (D2)", async () => {
    const result = await layoutAst(
      doc({ layout: "col" }, [
        frame({ id: "outer", layout: "col", pad: 10, gap: 5 }, [
          frame({ id: "inner", layout: "col", pad: 10, gap: 5 }, [box({ id: "a", label: "A" })]),
        ]),
      ]),
    );
    const outer = frameById(result.children, "outer");
    const inner = frameById(outer.children, "inner");
    expect(inner.y).toBe(10); // pad only - an unnamed frame draws no title, no clearance needed
  });

  it("lays out a group's children exactly like the equivalent frame's children", async () => {
    const frameResult = await layoutAst(
      doc({ layout: "col" }, [
        frame({ id: "f", layout: "row", pad: 10, gap: 5 }, [
          box({ id: "a", label: "A" }),
          box({ id: "b", label: "A longer label" }),
        ]),
      ]),
    );
    const groupResult = await layoutAst(
      doc({ layout: "col" }, [
        frame(
          { id: "g", layout: "row", pad: 10, gap: 5 },
          [box({ id: "a", label: "A" }), box({ id: "b", label: "A longer label" })],
          true,
        ),
      ]),
    );
    const f = frameById(frameResult.children, "f");
    const g = frameById(groupResult.children, "g");
    expect({ w: g.w, h: g.h }).toEqual({ w: f.w, h: f.h });
    for (const id of ["a", "b"]) {
      const fromFrame = boxById(f.children, id);
      const fromGroup = boxById(g.children, id);
      expect({ x: fromGroup.x, y: fromGroup.y, w: fromGroup.w, h: fromGroup.h }).toEqual({
        x: fromFrame.x,
        y: fromFrame.y,
        w: fromFrame.w,
        h: fromFrame.h,
      });
    }
  });

  it("keeps a hard-pinned child's coordinates verbatim and out of the flow", async () => {
    const result = await layoutAst(
      doc({ layout: "col" }, [
        box({ id: "a", label: "A" }),
        box({ id: "pinned", label: "Pinned", x: 500, y: 500 }),
        box({ id: "b", label: "B" }),
      ]),
    );
    const a = boxById(result.children, "a");
    const pinned = boxById(result.children, "pinned");
    const b = boxById(result.children, "b");
    expect(pinned.x).toBe(500);
    expect(pinned.y).toBe(500);
    // b flows directly after a, unaffected by the pinned sibling.
    const sizeA = estimatedBoxSize("A");
    expect(b.y).toBe(a.y + sizeA.h + 40);
  });

  it("sizes a nested frame bottom-up before the parent's row placement uses it", async () => {
    const result = await layoutAst(
      doc({ layout: "row", gap: 10 }, [
        frame({ id: "f1", layout: "col", pad: 10, gap: 5 }, [
          box({ id: "a", label: "A very long label indeed" }),
        ]),
        frame({ id: "f2", layout: "col", pad: 10, gap: 5 }, [
          box({ id: "b", label: "B" }),
        ]),
      ]),
    );
    const f1 = frameById(result.children, "f1");
    const f2 = frameById(result.children, "f2");
    expect(f2.x).toBe(f1.x + f1.w + 10);
  });

  it("aligns col children on the cross axis: start", async () => {
    const result = await layoutAst(
      doc({ layout: "col", align: "start" }, [
        box({ id: "a", label: "A", w: 100, h: 40 }),
        box({ id: "b", label: "B", w: 60, h: 40 }),
      ]),
    );
    expect(boxById(result.children, "a").x).toBe(0);
    expect(boxById(result.children, "b").x).toBe(0);
  });

  it("aligns col children on the cross axis: center", async () => {
    const result = await layoutAst(
      doc({ layout: "col", align: "center" }, [
        box({ id: "a", label: "A", w: 100, h: 40 }),
        box({ id: "b", label: "B", w: 60, h: 40 }),
      ]),
    );
    expect(boxById(result.children, "a").x).toBe(0);
    expect(boxById(result.children, "b").x).toBe(20);
  });

  it("aligns col children on the cross axis: end", async () => {
    const result = await layoutAst(
      doc({ layout: "col", align: "end" }, [
        box({ id: "a", label: "A", w: 100, h: 40 }),
        box({ id: "b", label: "B", w: 60, h: 40 }),
      ]),
    );
    expect(boxById(result.children, "a").x).toBe(0);
    expect(boxById(result.children, "b").x).toBe(40);
  });

  it("aligns row children on the cross axis: start", async () => {
    const result = await layoutAst(
      doc({ layout: "row", align: "start" }, [
        box({ id: "a", label: "A", w: 40, h: 100 }),
        box({ id: "b", label: "B", w: 40, h: 60 }),
      ]),
    );
    expect(boxById(result.children, "a").y).toBe(0);
    expect(boxById(result.children, "b").y).toBe(0);
  });

  it("aligns row children on the cross axis: center", async () => {
    const result = await layoutAst(
      doc({ layout: "row", align: "center" }, [
        box({ id: "a", label: "A", w: 40, h: 100 }),
        box({ id: "b", label: "B", w: 40, h: 60 }),
      ]),
    );
    expect(boxById(result.children, "a").y).toBe(0);
    expect(boxById(result.children, "b").y).toBe(20);
  });

  it("aligns row children on the cross axis: end", async () => {
    const result = await layoutAst(
      doc({ layout: "row", align: "end" }, [
        box({ id: "a", label: "A", w: 40, h: 100 }),
        box({ id: "b", label: "B", w: 40, h: 60 }),
      ]),
    );
    expect(boxById(result.children, "a").y).toBe(0);
    expect(boxById(result.children, "b").y).toBe(40);
  });

  it("defaults to center alignment when align is absent", async () => {
    const result = await layoutAst(
      doc({ layout: "col" }, [
        box({ id: "a", label: "A", w: 100, h: 40 }),
        box({ id: "b", label: "B", w: 60, h: 40 }),
      ]),
    );
    expect(boxById(result.children, "a").x).toBe(0);
    expect(boxById(result.children, "b").x).toBe(20);
  });

  it("delegates an auto container to the injected placer and applies its positions/size", async () => {
    const result = await layoutAst(
      doc({ layout: "auto", gap: 10 }, [
        box({ id: "a", label: "A" }),
        box({ id: "b", label: "B" }),
        edge({ id: "e", from: "a", to: "b" }),
      ]),
    );
    const a = boxById(result.children, "a");
    const b = boxById(result.children, "b");
    const sizeA = estimatedBoxSize("A");
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
    expect(b.x).toBe(sizeA.w + 10);
    expect(b.y).toBe(0);
  });

  it("passes edges declared outside the auto container to the placer (D7)", async () => {
    let seen: readonly { from: string; to: string }[] = [];
    const spy: AutoPlacer = async (req) => {
      if (req.nodes.length > 1) seen = req.edges;
      return stubPlaceAuto(req);
    };
    await layoutAst(
      doc({ layout: "col" }, [
        frame({ id: "g", layout: "auto" }, [
          box({ id: "a", label: "A" }),
          box({ id: "b", label: "B" }),
        ]),
        edge({ id: "e", from: "a", to: "b" }),
      ]),
      spy,
    );
    expect(seen.map((e) => `${e.from}->${e.to}`)).toEqual(["a->b"]);
  });
});

describe("hybridLayout: labeled-edge gap clearance (T12)", () => {
  it("widens a row's gap to clear a labeled edge between adjacent siblings", async () => {
    const result = await layoutAst(
      doc({ layout: "row", gap: 10 }, [
        box({ id: "a", label: "A", w: 50, h: 50 }),
        box({ id: "b", label: "B", w: 50, h: 50 }),
        edge({ id: "e", from: "a", to: "b", label: "reads from cache" }),
      ]),
    );
    // 64 is tldraw's squish margin, 13.5 the body the arrowhead end eats (D9).
    expect(boxById(result.children, "b").x).toBe(50 + arrowLabelWidth("reads from cache") + 77.5);
  });

  it("does not widen the gap for a labeled edge between non-adjacent siblings", async () => {
    const result = await layoutAst(
      doc({ layout: "row", gap: 10 }, [
        box({ id: "a", label: "A", w: 50, h: 50 }),
        box({ id: "b", label: "B", w: 50, h: 50 }),
        box({ id: "c", label: "C", w: 50, h: 50 }),
        edge({ id: "e", from: "a", to: "c", label: "reads from cache" }),
      ]),
    );
    expect(boxById(result.children, "b").x).toBe(60);
    expect(boxById(result.children, "c").x).toBe(120);
  });

  it("does not widen the gap for an unlabeled edge", async () => {
    const result = await layoutAst(
      doc({ layout: "row", gap: 10 }, [
        box({ id: "a", label: "A", w: 50, h: 50 }),
        box({ id: "b", label: "B", w: 50, h: 50 }),
        edge({ id: "e", from: "a", to: "b" }),
      ]),
    );
    expect(boxById(result.children, "b").x).toBe(60);
  });

  it("keeps the declared gap when it already exceeds the label's clearance", async () => {
    const result = await layoutAst(
      doc({ layout: "row", gap: 500 }, [
        box({ id: "a", label: "A", w: 50, h: 50 }),
        box({ id: "b", label: "B", w: 50, h: 50 }),
        edge({ id: "e", from: "a", to: "b", label: "hi" }),
      ]),
    );
    expect(boxById(result.children, "b").x).toBe(550);
  });

  it("widens a col's gap using the line-height formula for a labeled edge", async () => {
    const result = await layoutAst(
      doc({ layout: "col", gap: 10 }, [
        box({ id: "a", label: "A", w: 50, h: 50 }),
        box({ id: "b", label: "B", w: 50, h: 50 }),
        edge({ id: "e", from: "a", to: "b", label: "reads" }),
      ]),
    );
    expect(boxById(result.children, "b").y).toBe(50 + arrowLabelLineHeight() + 2 * 4.25);
  });

  it("widens a frame's gap for a labeled edge declared as a doc-level sibling of the frame", async () => {
    const result = await layoutAst(
      doc({ layout: "col" }, [
        frame({ id: "f", layout: "row", pad: 10, gap: 10 }, [
          box({ id: "a", label: "A", w: 50, h: 50 }),
          box({ id: "b", label: "B", w: 50, h: 50 }),
        ]),
        edge({ id: "e", from: "a", to: "b", label: "reads from cache" }),
      ]),
    );
    const f = frameById(result.children, "f");
    const a = boxById(f.children, "a");
    const b = boxById(f.children, "b");
    expect(b.x).toBe(a.x + a.w + arrowLabelWidth("reads from cache") + 77.5);
  });
});

describe("bestGridCols", () => {
  it("picks a sane column count for a set of equal boxes", () => {
    const els = Array.from({ length: 6 }, () => ({ x: 0, y: 0, w: 100, h: 100 }));
    expect(bestGridCols(els, 0)).toBe(4);
  });

  it("honours the tie-break by keeping the smaller cols", () => {
    const els = [
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 0, y: 0, w: 100, h: 100 },
    ];
    // cols=1 -> 100x200 (ratio 0.5), cols=2 -> 200x100 (ratio 2); against
    // target 1 both score |ln(0.5)| = |ln(2)|, a genuine tie.
    expect(bestGridCols(els, 0, 1)).toBe(1);
  });

  it("guards the empty case", () => {
    expect(bestGridCols([], 40)).toBe(1);
  });
});

describe("formsChain", () => {
  it("is true for a linear chain covering the whole container", () => {
    const ids = ["a", "b", "c"];
    const edges = [
      { from: "a", to: "b" },
      { from: "b", to: "c" },
    ];
    expect(formsChain(ids, edges)).toBe(true);
  });

  it("is false for a fan (a hub with out-degree > 1)", () => {
    const ids = ["hub", "a", "b", "c"];
    const edges = [
      { from: "hub", to: "a" },
      { from: "hub", to: "b" },
      { from: "hub", to: "c" },
    ];
    expect(formsChain(ids, edges)).toBe(false);
  });

  it("is false for an edgeless set", () => {
    expect(formsChain(["a", "b", "c"], [])).toBe(false);
  });

  it("is false for a sparse set that fails the coverage clause", () => {
    // degrees are all <= 1, but 2 edges over 8 children is well under half.
    const ids = ["a", "b", "c", "d", "e", "f", "g", "h"];
    const edges = [
      { from: "a", to: "b" },
      { from: "c", to: "d" },
    ];
    expect(formsChain(ids, edges)).toBe(false);
  });
});

describe("hybridLayout doc-root aspect wrap (B20)", () => {
  it("leaves a chain of children in a single column, unwrapped", async () => {
    const result = await layoutAst(
      doc({}, [
        box({ id: "a", label: "A" }),
        box({ id: "b", label: "B" }),
        box({ id: "c", label: "C" }),
        box({ id: "d", label: "D" }),
        edge({ id: "e1", from: "a", to: "b" }),
        edge({ id: "e2", from: "b", to: "c" }),
        edge({ id: "e3", from: "c", to: "d" }),
      ]),
    );
    expect(result.layout).toBe("col");
    expect(result.cols).toBeUndefined();
    const a = boxById(result.children, "a");
    const b = boxById(result.children, "b");
    const c = boxById(result.children, "c");
    const d = boxById(result.children, "d");
    expect(a.x).toBe(b.x);
    expect(b.x).toBe(c.x);
    expect(c.x).toBe(d.x);
    expect(b.y).toBeGreaterThan(a.y);
    expect(c.y).toBeGreaterThan(b.y);
    expect(d.y).toBeGreaterThan(c.y);
  });

  it("wraps a fan of children into a grid sized by bestGridCols", async () => {
    const labels = ["hub", "a", "b", "c"];
    const result = await layoutAst(
      doc({}, [
        box({ id: "hub", label: "hub" }),
        box({ id: "a", label: "a" }),
        box({ id: "b", label: "b" }),
        box({ id: "c", label: "c" }),
        edge({ id: "e1", from: "hub", to: "a" }),
        edge({ id: "e2", from: "hub", to: "b" }),
        edge({ id: "e3", from: "hub", to: "c" }),
      ]),
    );
    const sizes = labels.map((l) => estimatedBoxSize(l));
    const edges = [
      { from: "hub", to: "a" },
      { from: "hub", to: "b" },
      { from: "hub", to: "c" },
    ];
    const rowGap = hasSkipEdge(labels, edges) ? 80 : 40;
    const expectedCols = bestGridCols(
      sizes.map((s) => ({ x: 0, y: 0, w: s.w, h: s.h })),
      40,
      undefined,
      rowGap,
    );
    expect(result.layout).toBe("grid");
    expect(result.cols).toBe(expectedCols);
  });

  it("mirrors odd rows of an auto-wrapped grid (serpentine)", async () => {
    const labels = ["a", "b", "c", "d", "e"];
    const result = await layoutAst(
      doc(
        {},
        labels.map((l) => box({ id: l, label: l.toUpperCase() })),
      ),
    );
    expect(result.layout).toBe("grid");
    expect(result.cols).toBe(3);
    const a = boxById(result.children, "a");
    const d = boxById(result.children, "d");
    const e = boxById(result.children, "e");
    // row 1 (d, e) is reversed: d lands under column 2, not column 0
    expect(d.x).not.toBe(a.x);
    expect(d.x).toBeGreaterThan(e.x);
  });

  it("leaves an explicit layout=\"col\" doc unaffected even when its children fan out", async () => {
    const result = await layoutAst(
      doc({ layout: "col" }, [
        box({ id: "hub", label: "hub" }),
        box({ id: "a", label: "a" }),
        box({ id: "b", label: "b" }),
        edge({ id: "e1", from: "hub", to: "a" }),
        edge({ id: "e2", from: "hub", to: "b" }),
      ]),
    );
    expect(result.layout).toBe("col");
    const hub = boxById(result.children, "hub");
    const a = boxById(result.children, "a");
    expect(a.x).toBe(hub.x);
    expect(a.y).toBeGreaterThan(hub.y);
  });

  it("leaves a doc with explicit cols unaffected even when its children fan out", async () => {
    const result = await layoutAst(
      doc({ cols: 2 }, [
        box({ id: "hub", label: "hub" }),
        box({ id: "a", label: "a" }),
        box({ id: "b", label: "b" }),
        edge({ id: "e1", from: "hub", to: "a" }),
        edge({ id: "e2", from: "hub", to: "b" }),
      ]),
    );
    // cols only takes effect under mode "grid"; the default mode is "col",
    // so an explicit cols with no explicit layout still stacks - the point
    // here is that it never gets promoted to "grid" by the wrap.
    expect(result.layout).toBe("col");
    expect(result.cols).toBe(2);
    const hub = boxById(result.children, "hub");
    const a = boxById(result.children, "a");
    expect(a.x).toBe(hub.x);
    expect(a.y).toBeGreaterThan(hub.y);
  });
});

describe("findFanGroups", () => {
  it("groups a source with >= minOutDegree distinct leaf targets", () => {
    const groups = findFanGroups(
      ["hub", "a", "b", "c", "d"],
      [
        { from: "hub", to: "a" },
        { from: "hub", to: "b" },
        { from: "hub", to: "c" },
        { from: "hub", to: "d" },
      ],
    );
    expect(groups).toEqual([{ sourceId: "hub", targetIds: ["a", "b", "c", "d"] }]);
  });

  it("drops a candidate target that has an extra edge elsewhere (not a leaf)", () => {
    const groups = findFanGroups(
      ["hub", "a", "b", "c", "d", "e"],
      [
        { from: "hub", to: "a" },
        { from: "hub", to: "b" },
        { from: "hub", to: "c" },
        { from: "hub", to: "d" },
        { from: "d", to: "e" },
      ],
    );
    expect(groups).toEqual([]);
  });

  it("dedupes parallel edges between the same pair, so they don't count toward the threshold", () => {
    const edges = Array.from({ length: 7 }, () => ({ from: "core", to: "driven-ports" }));
    expect(findFanGroups(["core", "driven-ports"], edges)).toEqual([]);
  });

  it("requires at least minOutDegree distinct leaf targets", () => {
    const groups = findFanGroups(
      ["hub", "a", "b", "c"],
      [
        { from: "hub", to: "a" },
        { from: "hub", to: "b" },
        { from: "hub", to: "c" },
      ],
    );
    expect(groups).toEqual([]);
  });

  it("finds two disjoint fans in the same container", () => {
    const groups = findFanGroups(
      ["hub1", "a1", "a2", "a3", "a4", "hub2", "b1", "b2", "b3", "b4"],
      [
        { from: "hub1", to: "a1" },
        { from: "hub1", to: "a2" },
        { from: "hub1", to: "a3" },
        { from: "hub1", to: "a4" },
        { from: "hub2", to: "b1" },
        { from: "hub2", to: "b2" },
        { from: "hub2", to: "b3" },
        { from: "hub2", to: "b4" },
      ],
    );
    expect(groups).toEqual([
      { sourceId: "hub1", targetIds: ["a1", "a2", "a3", "a4"] },
      { sourceId: "hub2", targetIds: ["b1", "b2", "b3", "b4"] },
    ]);
  });
});

describe("hybridLayout fan-group placement (T6)", () => {
  it("collapses a fan at/above the threshold into a source + target-column block", async () => {
    const result = await layoutAst(
      doc({}, [
        box({ id: "hub", label: "hub" }),
        box({ id: "a", label: "a" }),
        box({ id: "b", label: "b" }),
        box({ id: "c", label: "c" }),
        box({ id: "d", label: "d" }),
        edge({ id: "e1", from: "hub", to: "a" }),
        edge({ id: "e2", from: "hub", to: "b" }),
        edge({ id: "e3", from: "hub", to: "c" }),
        edge({ id: "e4", from: "hub", to: "d" }),
      ]),
    );
    expect(result.layout).toBe("grid");
    const hub = boxById(result.children, "hub");
    const a = boxById(result.children, "a");
    const b = boxById(result.children, "b");
    const c = boxById(result.children, "c");
    const d = boxById(result.children, "d");

    // targets share one y with the source, laid out left to right in a row
    expect(a.y).toBe(hub.y);
    expect(b.y).toBe(hub.y);
    expect(c.y).toBe(hub.y);
    expect(d.y).toBe(hub.y);
    expect(a.x - hub.x).toBe(hub.w + 40);
    expect(b.x - a.x).toBe(a.w + 40);
    expect(c.x - b.x).toBe(b.w + 40);
    expect(d.x - c.x).toBe(c.w + 40);
  });

  it("leaves an explicit layout unaffected even when a child fans out past the threshold", async () => {
    const result = await layoutAst(
      doc({ layout: "row" }, [
        box({ id: "hub", label: "hub" }),
        box({ id: "a", label: "a" }),
        box({ id: "b", label: "b" }),
        box({ id: "c", label: "c" }),
        box({ id: "d", label: "d" }),
        edge({ id: "e1", from: "hub", to: "a" }),
        edge({ id: "e2", from: "hub", to: "b" }),
        edge({ id: "e3", from: "hub", to: "c" }),
        edge({ id: "e4", from: "hub", to: "d" }),
      ]),
    );
    expect(result.layout).toBe("row");
    const hub = boxById(result.children, "hub");
    const a = boxById(result.children, "a");
    const d = boxById(result.children, "d");
    expect(a.y).toBe(hub.y);
    expect(a.x).toBeGreaterThan(hub.x);
    expect(d.x).toBeGreaterThan(a.x);
  });
});

describe("hasSkipEdge", () => {
  it("is true when an edge skips over an intervening child", () => {
    expect(hasSkipEdge(["a", "b", "c"], [{ from: "a", to: "c" }])).toBe(true);
  });

  it("is false when edges only connect flow-adjacent children", () => {
    expect(
      hasSkipEdge(
        ["a", "b", "c"],
        [
          { from: "a", to: "b" },
          { from: "b", to: "c" },
        ],
      ),
    ).toBe(false);
  });

  it("is false for an empty edge list", () => {
    expect(hasSkipEdge(["a", "b", "c"], [])).toBe(false);
  });

  it("ignores edges touching ids outside the list", () => {
    expect(hasSkipEdge(["a", "b"], [{ from: "a", to: "z" }])).toBe(false);
  });
});

describe("hybridLayout grid row gap (B25)", () => {
  it("doubles the row gap when children carry a skip edge, keeping the column gap plain", async () => {
    const result = await layoutAst(
      doc({ layout: "grid", cols: 2 }, [
        box({ id: "a", label: "A", w: 100, h: 40 }),
        box({ id: "b", label: "B", w: 100, h: 40 }),
        box({ id: "c", label: "C", w: 100, h: 40 }),
        box({ id: "d", label: "D", w: 100, h: 40 }),
        edge({ id: "e", from: "a", to: "d" }),
      ]),
    );
    const a = boxById(result.children, "a");
    const b = boxById(result.children, "b");
    const c = boxById(result.children, "c");
    expect(b.x - a.x).toBe(100 + 40);
    expect(c.y - a.y).toBe(40 + 80);
  });

  it("keeps the plain gap when edges only connect adjacent grid children", async () => {
    const result = await layoutAst(
      doc({ layout: "grid", cols: 2 }, [
        box({ id: "a", label: "A", w: 100, h: 40 }),
        box({ id: "b", label: "B", w: 100, h: 40 }),
        box({ id: "c", label: "C", w: 100, h: 40 }),
        box({ id: "d", label: "D", w: 100, h: 40 }),
        edge({ id: "e1", from: "a", to: "b" }),
        edge({ id: "e2", from: "c", to: "d" }),
      ]),
    );
    const a = boxById(result.children, "a");
    const c = boxById(result.children, "c");
    expect(c.y - a.y).toBe(40 + 40);
  });

  it("leaves a col container's gap unchanged even with a skip edge", async () => {
    const result = await layoutAst(
      doc({ layout: "col" }, [
        box({ id: "a", label: "A", w: 100, h: 40 }),
        box({ id: "b", label: "B", w: 100, h: 40 }),
        box({ id: "c", label: "C", w: 100, h: 40 }),
        edge({ id: "e", from: "a", to: "c" }),
      ]),
    );
    const a = boxById(result.children, "a");
    const b = boxById(result.children, "b");
    const c = boxById(result.children, "c");
    expect(b.y - a.y).toBe(40 + 40);
    expect(c.y - b.y).toBe(40 + 40);
  });
});

describe("hybridLayout per-boundary skip row gap (B32)", () => {
  it("scales each boundary by its own crossing count (gradient)", async () => {
    const result = await layoutAst(
      doc({ layout: "grid", cols: 2 }, [
        box({ id: "a", label: "A", w: 100, h: 40 }),
        box({ id: "b", label: "B", w: 100, h: 40 }),
        box({ id: "c", label: "C", w: 100, h: 40 }),
        box({ id: "d", label: "D", w: 100, h: 40 }),
        box({ id: "e", label: "E", w: 100, h: 40 }),
        box({ id: "f", label: "F", w: 100, h: 40 }),
        edge({ id: "e1", from: "a", to: "c" }),
        edge({ id: "e2", from: "a", to: "d" }),
      ]),
    );
    const a = boxById(result.children, "a");
    const c = boxById(result.children, "c");
    const e = boxById(result.children, "e");
    expect(c.y - a.y).toBe(40 + 120);
    expect(e.y - c.y).toBe(40 + 40);
  });

  it("caps the boundary factor at SKIP_ROW_GAP_MAX regardless of crossing count", async () => {
    const result = await layoutAst(
      doc({ layout: "grid", cols: 2 }, [
        box({ id: "a", label: "A", w: 100, h: 40 }),
        box({ id: "b", label: "B", w: 100, h: 40 }),
        box({ id: "c", label: "C", w: 100, h: 40 }),
        box({ id: "d", label: "D", w: 100, h: 40 }),
        edge({ id: "e1", from: "a", to: "c" }),
        edge({ id: "e2", from: "a", to: "d" }),
        edge({ id: "e3", from: "b", to: "d" }),
        edge({ id: "e4", from: "a", to: "c" }),
        edge({ id: "e5", from: "a", to: "d" }),
      ]),
    );
    const a = boxById(result.children, "a");
    const c = boxById(result.children, "c");
    expect(c.y - a.y).toBe(40 + 160);
  });
});

describe("skipRowGaps (B33)", () => {
  it("returns the plain gap per boundary when no edges skip", () => {
    expect(skipRowGaps(["a", "b", "c", "d"], [], 2, 40)).toEqual([40]);
  });

  it("widens a boundary for a flow-adjacent edge that lands in a different row", () => {
    // b (row 0) -> c (row 1): |Δpos| = 1, but crosses the row boundary.
    expect(skipRowGaps(["a", "b", "c", "d"], [{ from: "b", to: "c" }], 2, 40)).toEqual([80]);
  });

  it("does not count a flow-adjacent edge that stays within a row", () => {
    expect(skipRowGaps(["a", "b", "c", "d"], [{ from: "a", to: "b" }], 2, 40)).toEqual([40]);
  });

  it("scales a single boundary by its crossing count", () => {
    expect(skipRowGaps(["a", "b", "c", "d"], [{ from: "a", to: "d" }], 2, 40)).toEqual([80]);
  });

  it("caps the factor at SKIP_ROW_GAP_MAX", () => {
    const edges = [
      { from: "a", to: "c" },
      { from: "a", to: "d" },
      { from: "b", to: "d" },
      { from: "a", to: "c" },
      { from: "a", to: "d" },
    ];
    expect(skipRowGaps(["a", "b", "c", "d"], edges, 2, 40)).toEqual([160]);
  });

  it("returns an empty array for cols <= 0", () => {
    expect(skipRowGaps(["a", "b", "c", "d"], [{ from: "a", to: "d" }], 0, 40)).toEqual([]);
  });

  it("returns an empty array with fewer than 2 rows", () => {
    expect(skipRowGaps(["a", "b"], [{ from: "a", to: "b" }], 2, 40)).toEqual([]);
  });
});

describe("hybridLayout container-aware box sizing (T0)", () => {
  it("gives every col box child the same width and height", async () => {
    const result = await layoutAst(
      doc({ layout: "col" }, [
        box({ id: "a", label: "A" }),
        box({ id: "b", label: "Redis cluster primary" }),
        box({ id: "c", label: "X" }),
      ]),
    );
    const [a, b, c] = ["a", "b", "c"].map((id) => boxById(result.children, id));
    expect(b!.w).toBe(a!.w);
    expect(c!.w).toBe(a!.w);
    expect(a!.h).toBe(b!.h);
    expect(a!.h).toBe(c!.h);
  });

  it("gives every row box child the same height", async () => {
    const result = await layoutAst(
      doc({ layout: "row" }, [
        box({ id: "a", label: "A" }),
        box({
          id: "b",
          label: "Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo",
        }),
      ]),
    );
    const a = boxById(result.children, "a");
    const b = boxById(result.children, "b");
    expect(a.h).toBe(b.h);
  });

  it("never grows a flowed box past the aspect target unless w is pinned", async () => {
    const longLabel =
      "Alpha Bravo Charlie Delta Echo Foxtrot Golf Hotel India Juliett Kilo Lima Mike " +
      "November Oscar Papa Quebec Romeo Sierra Tango Uniform Victor Whiskey Xray Yankee Zulu";
    const result = await layoutAst(
      doc({ layout: "col" }, [
        box({ id: "a", label: longLabel }),
        box({ id: "pinned", label: "whatever", w: 900 }),
      ]),
    );
    const a = boxById(result.children, "a");
    const pinned = boxById(result.children, "pinned");
    expect(a.w).toBeLessThanOrEqual(BOX_ASPECT_TARGET * a.h);
    expect(pinned.w).toBe(900);
  });

  it("keeps an author-pinned w and h instead of the shared container size", async () => {
    const result = await layoutAst(
      doc({ layout: "col" }, [
        box({ id: "pinned", label: "small", w: 250, h: 80 }),
        box({ id: "other", label: "A much longer sibling label to force a bigger shared width" }),
      ]),
    );
    const pinned = boxById(result.children, "pinned");
    expect(pinned.w).toBe(250);
    expect(pinned.h).toBe(80);
  });

  it("caps a box's shared width at its own maxW", async () => {
    const result = await layoutAst(
      doc({ layout: "col" }, [
        box({ id: "wide", label: "A fairly long label that sets a wide shared width" }),
        box({ id: "capped", label: "Short", maxW: 100 }),
      ]),
    );
    const capped = boxById(result.children, "capped");
    expect(capped.w).toBe(100);
  });
});

describe("note sizing: geo <Note> vs sticky <Sticky>", () => {
  it("a geo note sizes like a box - wraps to a readable width, not a 200px sticky column", async () => {
    const text =
      "Two sentences of context about this diagram. It should read like an annotation, not a filing cabinet.";
    const result = await layoutAst(doc({ layout: "col" }, [note({ id: "n" }, text)]));
    const n = noteById(result.children, "n");
    const expectedW = fitBoxWidth(text);
    expect(n.w).toBe(expectedW);
    expect(n.h).toBe(boxHeightForWidth(text, expectedW));
    expect(n.w).not.toBe(200);
  });

  it("a geo note in a grid takes the shared box width but not the shared box height", async () => {
    const longText =
      "A fairly long annotation that will wrap onto several lines once boxed at the shared width.";
    const result = await layoutAst(
      doc({ layout: "grid", cols: 2 }, [
        box({ id: "a", label: "A" }),
        box({ id: "b", label: "B" }),
        note({ id: "n" }, longText),
      ]),
    );
    const a = boxById(result.children, "a");
    const n = noteById(result.children, "n");
    expect(n.w).toBe(a.w);
    expect(n.h).toBe(boxHeightForWidth(longText, a.w));
    expect(n.h).not.toBe(a.h);
  });

  it("a sticky note still sizes 200 wide, ignoring the container's shared box width", async () => {
    const result = await layoutAst(
      doc({ layout: "grid", cols: 2 }, [
        box({ id: "a", label: "A much wider label than the note needs" }),
        note({ id: "n" }, "hi", true),
      ]),
    );
    const a = boxById(result.children, "a");
    const n = noteById(result.children, "n");
    expect(a.w).toBeGreaterThan(200);
    expect(n.w).toBe(200);
  });
});
