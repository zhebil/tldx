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

import { hybridLayout, type AutoPlacer } from "./stack.js";

const { box, doc, edge, frame, note } = astBuilders();

const stubPlaceAuto: AutoPlacer = async (req) => {
  const positions = new Map<string, { x: number; y: number }>();
  let cursor = req.padLeft;
  let maxH = 0;
  for (const n of req.nodes) {
    positions.set(n.id, { x: cursor, y: req.padTop });
    cursor += n.w + req.gap;
    maxH = Math.max(maxH, n.h);
  }
  const w = req.nodes.length === 0 ? req.padLeft + req.padRight : cursor - req.gap + req.padRight;
  const h = req.padTop + maxH + req.padBottom;
  return { positions, w, h };
};

async function layoutAst(ast: AstNode) {
  const { ir, diagnostics } = lower(ast);
  expect(diagnostics).toEqual([]);
  if (ir === null) throw new Error("lower returned null ir");
  return hybridLayout(ir, stubPlaceAuto);
}

function byId(
  children: readonly IRElementPositioned[],
  id: string,
): IRBoxPositioned | IRFramePositioned | IRNotePositioned {
  const el = children.find((c) => c.kind !== "edge" && c.kind !== "doc" && c.id === id);
  if (el === undefined || el.kind === "edge" || el.kind === "doc") {
    throw new Error(`no element '${id}'`);
  }
  return el;
}

function noteById(children: readonly IRElementPositioned[], id: string): IRNotePositioned {
  const el = byId(children, id);
  if (el.kind !== "note") throw new Error(`'${id}' is not a note`);
  return el;
}

function rectOf(el: { x: number; y: number; w: number; h: number }) {
  return { x: el.x, y: el.y, w: el.w, h: el.h };
}

function overlaps(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0;
}

describe("attachNotes", () => {
  it("places an attached note within 24-40px of its target, overlapping nothing", async () => {
    const ast = doc({ layout: "col" }, [box({ id: "a", label: "Target box" }), note({ on: "a" }, "annotation text")]);
    const result = await layoutAst(ast);
    const a = byId(result.children, "a");
    const n = noteById(result.children, findNoteId(result.children));
    expect(n.on).toBe("a");
    expect(overlaps(rectOf(a), rectOf(n))).toBe(false);
    const gapRight = n.x - (a.x + a.w);
    expect(gapRight).toBeGreaterThanOrEqual(24);
    expect(gapRight).toBeLessThanOrEqual(40);
  });

  it("re-parents an attached note out of its declaring frame to the document root", async () => {
    const ast = doc({ layout: "col" }, [
      frame({ id: "f" }, [box({ id: "inner", label: "Inner" }), note({ on: "inner" }, "hi")]),
    ]);
    const result = await layoutAst(ast);
    const frameEl = result.children.find((c) => c.kind === "frame");
    if (frameEl === undefined || frameEl.kind !== "frame") throw new Error("expected frame");
    expect(frameEl.children.some((c) => c.kind === "note")).toBe(false);
    const n = result.children.find((c) => c.kind === "note");
    expect(n).toBeDefined();
    expect(n?.kind).toBe("note");
  });

  it("does not move any sibling compared to the same document without the attached note", async () => {
    const withNote = await layoutAst(
      doc({ layout: "col" }, [
        box({ id: "a", label: "A" }),
        note({ on: "a" }, "annotation") ,
        box({ id: "b", label: "B" }),
      ]),
    );
    const without = await layoutAst(
      doc({ layout: "col" }, [box({ id: "a", label: "A" }), box({ id: "b", label: "B" })]),
    );
    expect(rectOf(byId(withNote.children, "a"))).toEqual(rectOf(byId(without.children, "a")));
    expect(rectOf(byId(withNote.children, "b"))).toEqual(rectOf(byId(without.children, "b")));
  });

  it("prefers right when nothing blocks it", async () => {
    const ast = doc({ layout: "free" }, [
      box({ id: "a", x: 100, y: 100, w: 80, h: 40 }),
      note({ id: "n", on: "a", w: 30, h: 20 }, "x"),
    ]);
    const result = await layoutAst(ast);
    const n = noteById(result.children, "n");
    expect(n.x).toBe(204);
    expect(n.y).toBe(110);
  });

  it("falls back to below when right is blocked", async () => {
    const ast = doc({ layout: "free" }, [
      box({ id: "a", x: 100, y: 100, w: 80, h: 40 }),
      box({ id: "block-right", x: 204, y: 110, w: 30, h: 20 }),
      note({ id: "n", on: "a", w: 30, h: 20 }, "x"),
    ]);
    const result = await layoutAst(ast);
    const n = noteById(result.children, "n");
    expect(n.x).toBe(125);
    expect(n.y).toBe(164);
  });

  it("falls back to left when right and below are blocked", async () => {
    const ast = doc({ layout: "free" }, [
      box({ id: "a", x: 100, y: 100, w: 80, h: 40 }),
      box({ id: "block-right", x: 204, y: 110, w: 30, h: 20 }),
      box({ id: "block-below", x: 125, y: 164, w: 30, h: 20 }),
      note({ id: "n", on: "a", w: 30, h: 20 }, "x"),
    ]);
    const result = await layoutAst(ast);
    const n = noteById(result.children, "n");
    expect(n.x).toBe(46);
    expect(n.y).toBe(110);
  });

  it("falls back to above when right, below, and left are all blocked", async () => {
    const ast = doc({ layout: "free" }, [
      box({ id: "a", x: 100, y: 100, w: 80, h: 40 }),
      box({ id: "block-right", x: 204, y: 110, w: 30, h: 20 }),
      box({ id: "block-below", x: 125, y: 164, w: 30, h: 20 }),
      box({ id: "block-left", x: 46, y: 110, w: 30, h: 20 }),
      note({ id: "n", on: "a", w: 30, h: 20 }, "x"),
    ]);
    const result = await layoutAst(ast);
    const n = noteById(result.children, "n");
    expect(n.x).toBe(125);
    expect(n.y).toBe(56);
  });

  it("attaches to an edge's chord midpoint", async () => {
    const ast = doc({ layout: "free" }, [
      box({ id: "a", x: 0, y: 0, w: 40, h: 40 }),
      box({ id: "b", x: 200, y: 0, w: 40, h: 40 }),
      edge({ id: "e", from: "a", to: "b" }),
      note({ id: "n", on: "e", w: 20, h: 20 }, "x"),
    ]);
    const result = await layoutAst(ast);
    const n = noteById(result.children, "n");
    // chord midpoint of centres (20,20) and (220,20) is (120,20); the note
    // sits to the right of the degenerate 1x1 target rect at that point.
    expect(n.x).toBe(120 + 1 + 24);
    expect(n.y).toBeCloseTo(20 + (1 - 20) / 2, 5);
  });

  it("rejects a candidate with negative coordinates even when it would otherwise be the clear choice", async () => {
    const ast = doc({ layout: "free" }, [
      box({ id: "a", x: 50, y: 0, w: 20, h: 20 }),
      box({ id: "block-right", x: 94, y: 5, w: 10, h: 10 }),
      box({ id: "block-below", x: 55, y: 44, w: 10, h: 10 }),
      box({ id: "block-left", x: 16, y: 5, w: 10, h: 10 }),
      note({ id: "n", on: "a", w: 10, h: 10 }, "x"),
    ]);
    const result = await layoutAst(ast);
    const n = noteById(result.children, "n");
    // "above" (x:55, y:-34) is unblocked and would otherwise be the clear
    // winner, but its y is negative, so it must be rejected.
    expect(n.y).toBeGreaterThanOrEqual(0);
    expect(n.x).toBeGreaterThanOrEqual(0);
    expect(n.x !== 55 || n.y !== -34).toBe(true);
  });
});

function findNoteId(children: readonly IRElementPositioned[]): string {
  const n = children.find((c) => c.kind === "note");
  if (n === undefined) throw new Error("no note in children");
  return n.id;
}
