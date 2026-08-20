import { describe, expect, it } from "vitest";

import { lower } from "../ir/lower.js";
import type { IRBoxPositioned, IRElementPositioned, IRFramePositioned } from "../ir/index.js";
import type { AstNode } from "../parser/ast.js";
import { astBuilders } from "../parser/ast.fixture.js";

import { estimatedBoxSize } from "./defaults.js";
import { bestGridCols, formsChain, hybridLayout, type AutoPlacer } from "./stack.js";

const { box, doc, edge, frame } = astBuilders();

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
    expect(a.y).toBe(10 + 32); // pad + FRAME_TITLE_PX
    expect(b.y).toBe(a.y + sizeA.h + 5);
    expect(f.w).toBe(Math.max(sizeA.w, sizeB.w) + 10 + 10);
    expect(f.h).toBe(b.y + sizeB.h + 10);
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
    const expectedCols = bestGridCols(
      sizes.map((s) => ({ x: 0, y: 0, w: s.w, h: s.h })),
      40,
    );
    expect(result.layout).toBe("grid");
    expect(result.cols).toBe(expectedCols);
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
