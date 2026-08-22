import { describe, expect, it } from "vitest";

import type {
  IRBox,
  IRBoxPositioned,
  IRDoc,
  IRDocPositioned,
  IRElement,
  IRElementPositioned,
} from "../ir/index.js";

import { planMoveCandidates } from "./moves.js";

const FILE = "test.tldsl.jsx";

function span(line: number) {
  return { file: FILE, line, column: 7 };
}

/** A row of `n` boxes (`b0`, `b1`, ...) at distinct source lines, each 100px
 *  wide with a 40px gap, laid out left to right starting at x=0. */
function rowIR(n: number, opts: { gap?: number; colGap?: number } = {}): { ir: IRDoc; positioned: IRDocPositioned } {
  const gap = opts.gap ?? 40;
  const boxes: IRBox[] = Array.from({ length: n }, (_, i) => ({
    kind: "box",
    id: `b${i}`,
    idExplicit: true,
    span: span(i + 2),
    w: 100,
    h: 50,
  }));
  const ir: IRDoc = {
    kind: "doc",
    id: "doc-0",
    idExplicit: false,
    span: span(1),
    layout: "row",
    ...(opts.gap === undefined ? {} : { gap: opts.gap }),
    ...(opts.colGap === undefined ? {} : { colGap: opts.colGap }),
    children: boxes,
  };
  const positionedChildren: IRElementPositioned[] = boxes.map((b, i) => ({
    ...b,
    x: i * (100 + gap),
    y: 0,
    w: 100,
    h: 50,
  }));
  const positioned: IRDocPositioned = { ...ir, layout: "row", children: positionedChildren };
  return { ir, positioned };
}

function colIR(n: number, opts: { gap?: number; rowGap?: number } = {}): { ir: IRDoc; positioned: IRDocPositioned } {
  const gap = opts.gap ?? 40;
  const boxes: IRBox[] = Array.from({ length: n }, (_, i) => ({
    kind: "box",
    id: `b${i}`,
    idExplicit: true,
    span: span(i + 2),
    w: 100,
    h: 50,
  }));
  const ir: IRDoc = {
    kind: "doc",
    id: "doc-0",
    idExplicit: false,
    span: span(1),
    layout: "col",
    ...(opts.gap === undefined ? {} : { gap: opts.gap }),
    ...(opts.rowGap === undefined ? {} : { rowGap: opts.rowGap }),
    children: boxes,
  };
  const positionedChildren: IRElementPositioned[] = boxes.map((b, i) => ({
    ...b,
    x: 0,
    y: i * (50 + gap),
    w: 100,
    h: 50,
  }));
  const positioned: IRDocPositioned = { ...ir, layout: "col", children: positionedChildren };
  return { ir, positioned };
}

describe("planMoveCandidates: reorder rung", () => {
  it("proposes every other slot for a middle child of a row, nearest first", () => {
    const { ir, positioned } = rowIR(4);
    const plan = planMoveCandidates(ir, positioned, "shape:b1", { x: 400 }, { x: 140, y: 0 });
    if ("reason" in plan) throw new Error(`expected candidates, got: ${plan.reason}`);
    const reorderSlots = plan.candidates.filter((c) => c.rung === "reorder").map((c) => c.toIndex);
    // dragged is at index 1; other slots are 0, 2, 3 - nearest (0 or 2) first.
    expect(reorderSlots[0]).toBe(0);
    expect(new Set(reorderSlots)).toEqual(new Set([0, 2, 3]));
  });

  it("also proposes a gap candidate when the dragged child is last", () => {
    const { ir, positioned } = rowIR(3);
    // b2 (last, base x=280) dragged further right to x=400.
    const plan = planMoveCandidates(ir, positioned, "shape:b2", { x: 400 }, { x: 280, y: 0 });
    if ("reason" in plan) throw new Error(`expected candidates, got: ${plan.reason}`);
    const gap = plan.candidates.find((c) => c.rung === "gap");
    expect(gap).toBeDefined();
    if (gap?.rung !== "gap") throw new Error("expected a gap candidate");
    expect(gap.attr).toBe("gap");
    expect(gap.value).toBe(40 + 120); // currentGap(40) + delta(400-280)
  });

  it("does not propose a gap candidate for a non-last child", () => {
    const { ir, positioned } = rowIR(3);
    const plan = planMoveCandidates(ir, positioned, "shape:b0", { x: 50 }, { x: 0, y: 0 });
    if ("reason" in plan) throw new Error(`expected candidates, got: ${plan.reason}`);
    expect(plan.candidates.some((c) => c.rung === "gap")).toBe(false);
  });

  it("picks colGap over gap when the container already sets colGap", () => {
    const { ir, positioned } = colIR(2, { rowGap: 60 });
    const plan = planMoveCandidates(ir, positioned, "shape:b1", { y: 300 }, { x: 0, y: 110 });
    if ("reason" in plan) throw new Error(`expected candidates, got: ${plan.reason}`);
    const gap = plan.candidates.find((c) => c.rung === "gap");
    if (gap?.rung !== "gap") throw new Error("expected a gap candidate");
    expect(gap.attr).toBe("rowGap");
    expect(gap.value).toBe(60 + 190); // currentGap(60) + delta(300-110)
  });
});

describe("planMoveCandidates: refusals", () => {
  it("refuses a rotated move", () => {
    const { ir, positioned } = rowIR(2);
    const plan = planMoveCandidates(ir, positioned, "shape:b0", { rotation: 0.3 }, { x: 0, y: 0 });
    if (!("reason" in plan)) throw new Error("expected unabsorbable");
    expect(plan.reason).toMatch(/rotation/);
  });

  it("refuses a reparent", () => {
    const { ir, positioned } = rowIR(2);
    const plan = planMoveCandidates(ir, positioned, "shape:b0", { parentId: "shape:elsewhere" }, { x: 0, y: 0 });
    if (!("reason" in plan)) throw new Error("expected unabsorbable");
    expect(plan.reason).toMatch(/reparented/);
  });

  it("refuses a resize", () => {
    const { ir, positioned } = rowIR(2);
    const plan = planMoveCandidates(ir, positioned, "shape:b0", { x: 10, w: 200 }, { x: 0, y: 0 });
    if (!("reason" in plan)) throw new Error("expected unabsorbable");
    expect(plan.reason).toMatch(/resize/);
  });

  it("refuses a child that's already hard-pinned", () => {
    const { ir, positioned } = rowIR(2);
    const pinned: IRBox = { ...(ir.children[0] as IRBox), x: 5, y: 5 };
    const irPinned: IRDoc = { ...ir, children: [pinned, ir.children[1] as IRElement] };
    const posPinned: IRDocPositioned = {
      ...positioned,
      children: [{ ...(positioned.children[0] as IRBoxPositioned), x: 5, y: 5 }, positioned.children[1]!],
    };
    const plan = planMoveCandidates(irPinned, posPinned, "shape:b0", { x: 50 }, { x: 5, y: 5 });
    if (!("reason" in plan)) throw new Error("expected unabsorbable");
    expect(plan.reason).toMatch(/explicit x\/y pin/);
  });

  it("refuses a container that isn't row/col (grid)", () => {
    const { ir, positioned } = rowIR(3);
    const irGrid: IRDoc = { ...ir, layout: "grid" };
    const posGrid: IRDocPositioned = { ...positioned, layout: "grid" };
    const plan = planMoveCandidates(irGrid, posGrid, "shape:b0", { x: 10 }, { x: 0, y: 0 });
    if (!("reason" in plan)) throw new Error("expected unabsorbable");
    expect(plan.reason).toMatch(/layout="grid"/);
  });

  it("refuses siblings that share a span (generated by .map())", () => {
    const { ir, positioned } = rowIR(3);
    // Collapse every child's span onto the first one, as a loop body would.
    const collapsedChildren = ir.children.map((c) => ({ ...c, span: span(2) }));
    const irLoop: IRDoc = { ...ir, children: collapsedChildren };
    const posLoop: IRDocPositioned = {
      ...positioned,
      children: positioned.children.map((c) => ({ ...c, span: span(2) })) as IRElementPositioned[],
    };
    const plan = planMoveCandidates(irLoop, posLoop, "shape:b1", { x: 10 }, { x: 140, y: 0 });
    if (!("reason" in plan)) throw new Error("expected unabsorbable");
    expect(plan.reason).toMatch(/generated/);
  });

  it("refuses the only flowed child of its container", () => {
    const { ir, positioned } = rowIR(1);
    const plan = planMoveCandidates(ir, positioned, "shape:b0", { x: 10 }, { x: 0, y: 0 });
    if (!("reason" in plan)) throw new Error("expected unabsorbable");
    expect(plan.reason).toMatch(/only flowed child/);
  });

  it("refuses an id that isn't in the tree", () => {
    const { ir, positioned } = rowIR(2);
    const plan = planMoveCandidates(ir, positioned, "shape:ghost", { x: 10 }, { x: 0, y: 0 });
    if (!("reason" in plan)) throw new Error("expected unabsorbable");
    expect(plan.reason).toMatch(/could not locate/);
  });
});
