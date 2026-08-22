import { describe, expect, it } from "vitest";

import type {
  IRBoxPositioned,
  IRDocPositioned,
  IREdge,
  IRElementPositioned,
  IRFramePositioned,
  IRNotePositioned,
} from "../ir/index.js";

import { computeOcclusionDiagnostics } from "./occlusion.js";

const SPAN = { file: "test.tldsl", line: 1, column: 1 };

function doc(children: IRElementPositioned[]): IRDocPositioned {
  return { kind: "doc", id: "root", idExplicit: false, span: SPAN, children };
}

function box(input: { id: string; x: number; y: number; w: number; h: number; label?: string }): IRBoxPositioned {
  return { kind: "box", idExplicit: true, span: SPAN, ...input };
}

function note(input: { id: string; x: number; y: number; w: number; h: number; text: string }): IRNotePositioned {
  return { kind: "note", idExplicit: true, span: SPAN, ...input };
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

function edge(input: { id: string; from: string; to: string; label?: string }): IREdge {
  return { kind: "edge", idExplicit: true, span: SPAN, ...input };
}

describe("computeOcclusionDiagnostics", () => {
  it("returns nothing for a diagram with no overlaps", () => {
    const ir = doc([
      box({ id: "a", x: 0, y: 0, w: 100, h: 50, label: "A" }),
      box({ id: "b", x: 200, y: 0, w: 100, h: 50, label: "B" }),
      edge({ id: "ab", from: "a", to: "b" }),
    ]);
    expect(computeOcclusionDiagnostics(ir)).toEqual([]);
  });

  it("warns, naming both shapes, when two unrelated shapes' rects overlap", () => {
    const ir = doc([
      box({ id: "a", x: 0, y: 0, w: 100, h: 50, label: "A" }),
      box({ id: "b", x: 50, y: 0, w: 100, h: 50, label: "B" }),
    ]);
    const diags = computeOcclusionDiagnostics(ir);
    expect(diags).toHaveLength(1);
    expect(diags[0]).toMatchObject({ severity: "warning", code: "layout/shape-overlap" });
    expect(diags[0]!.message).toContain("A");
    expect(diags[0]!.message).toContain("B");
  });

  it("does not warn when one shape is a box nested inside a frame it visually overlaps", () => {
    const ir = doc([
      frame({
        id: "f",
        x: 0,
        y: 0,
        w: 200,
        h: 200,
        children: [box({ id: "inner", x: 10, y: 10, w: 50, h: 50, label: "Inner" })],
      }),
    ]);
    expect(computeOcclusionDiagnostics(ir)).toEqual([]);
  });

  it("warns, naming the covered shape, when an edge label lands on a shape the edge doesn't connect", () => {
    // a -> c skips over b, which sits directly on the midpoint of the chord.
    const ir = doc([
      box({ id: "a", x: 0, y: 0, w: 40, h: 40, label: "A" }),
      box({ id: "b", x: 80, y: 0, w: 40, h: 40, label: "B" }),
      box({ id: "c", x: 160, y: 0, w: 40, h: 40, label: "C" }),
      edge({ id: "ac", from: "a", to: "c", label: "skip" }),
    ]);
    const diags = computeOcclusionDiagnostics(ir);
    const labelDiags = diags.filter((d) => d.code === "layout/label-overlap");
    expect(labelDiags).toHaveLength(1);
    expect(labelDiags[0]!.message).toContain("skip");
    expect(labelDiags[0]!.message).toContain("B");
  });

  it("does not warn about a labelled edge's own endpoints", () => {
    const ir = doc([
      box({ id: "a", x: 0, y: 0, w: 200, h: 200, label: "A" }),
      box({ id: "b", x: 50, y: 50, w: 40, h: 40, label: "B" }),
      edge({ id: "ab", from: "a", to: "b", label: "go" }),
    ]);
    const diags = computeOcclusionDiagnostics(ir);
    expect(diags.filter((d) => d.code === "layout/label-overlap")).toEqual([]);
  });

  it("names a note that buries another shape", () => {
    const ir = doc([
      box({ id: "a", x: 0, y: 0, w: 40, h: 40, label: "A" }),
      note({ id: "n", x: 10, y: 10, w: 100, h: 100, text: "long note" }),
    ]);
    const diags = computeOcclusionDiagnostics(ir);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("A");
    expect(diags[0]!.message).toContain("long note");
  });
});
