import { describe, expect, it } from "vitest";

import { lower } from "../ir/lower.js";
import type { IRBoxPositioned, IRElementPositioned, IRFramePositioned } from "../ir/index.js";
import type { AstNode } from "../parser/ast.js";
import { astBuilders } from "../parser/ast.fixture.js";

import { estimatedBoxSize } from "./defaults.js";
import { hybridLayout, type AutoPlacer } from "./stack.js";

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
