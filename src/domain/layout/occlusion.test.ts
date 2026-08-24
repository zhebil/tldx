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

const SPAN = { file: "test.tldx", line: 1, column: 1 };

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
      box({ id: "a", x: 0, y: 0, w: 120, h: 62, label: "A" }),
      box({ id: "b", x: 200, y: 0, w: 120, h: 62, label: "B" }),
      edge({ id: "ab", from: "a", to: "b" }),
    ]);
    expect(computeOcclusionDiagnostics(ir)).toEqual([]);
  });

  it("warns, naming both shapes, when two unrelated shapes' rects overlap", () => {
    const ir = doc([
      box({ id: "a", x: 0, y: 0, w: 120, h: 62, label: "A" }),
      box({ id: "b", x: 50, y: 0, w: 120, h: 62, label: "B" }),
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
        children: [box({ id: "inner", x: 10, y: 10, w: 120, h: 62, label: "Inner" })],
      }),
    ]);
    expect(computeOcclusionDiagnostics(ir)).toEqual([]);
  });

  it("does not warn about a skip edge the router can bend clear of the shape between its endpoints", () => {
    // a -> c skips over b, which sits on the midpoint of the straight chord.
    // Before B5 the label landed on b and this warned; the router now bends
    // the arc clear, so silence here is the fix working, not a missed defect.
    const ir = doc([
      box({ id: "a", x: 0, y: 0, w: 120, h: 62, label: "A" }),
      box({ id: "b", x: 80, y: 0, w: 120, h: 62, label: "B" }),
      box({ id: "c", x: 160, y: 0, w: 120, h: 62, label: "C" }),
      edge({ id: "ac", from: "a", to: "c", label: "skip" }),
    ]);
    expect(computeOcclusionDiagnostics(ir).filter((d) => d.code === "layout/label-overlap")).toEqual(
      [],
    );
  });

  it("warns, naming the covered shape, when no bend can clear the label", () => {
    // b engulfs both endpoints, so there is no arc that escapes it and the
    // router gives up at bend 0 - the case the diagnostic exists for.
    const ir = doc([
      box({ id: "a", x: 0, y: 0, w: 120, h: 62, label: "A" }),
      box({ id: "b", x: 80, y: -400, w: 400, h: 800, label: "B" }),
      box({ id: "c", x: 160, y: 0, w: 120, h: 62, label: "C" }),
      edge({ id: "ac", from: "a", to: "c", label: "skip" }),
    ]);
    const labelDiags = computeOcclusionDiagnostics(ir).filter(
      (d) => d.code === "layout/label-overlap",
    );
    expect(labelDiags).toHaveLength(1);
    expect(labelDiags[0]!.message).toContain("skip");
    expect(labelDiags[0]!.message).toContain("B");
  });

  it("does not warn about a labelled edge's own endpoints", () => {
    const ir = doc([
      box({ id: "a", x: 0, y: 0, w: 200, h: 200, label: "A" }),
      box({ id: "b", x: 50, y: 50, w: 120, h: 62, label: "B" }),
      edge({ id: "ab", from: "a", to: "b", label: "go" }),
    ]);
    const diags = computeOcclusionDiagnostics(ir);
    expect(diags.filter((d) => d.code === "layout/label-overlap")).toEqual([]);
  });

  it("names a note that buries another shape", () => {
    const ir = doc([
      box({ id: "a", x: 0, y: 0, w: 120, h: 62, label: "A" }),
      note({ id: "n", x: 10, y: 10, w: 100, h: 100, text: "long note" }),
    ]);
    const diags = computeOcclusionDiagnostics(ir);
    expect(diags).toHaveLength(1);
    expect(diags[0]!.message).toContain("A");
    expect(diags[0]!.message).toContain("long note");
  });

  it("warns, naming the shape and the label, when a box's label doesn't fit its own box (D22)", () => {
    const label =
      "DUMB ZONE do not put smart logic here this box explicitly pins its width so the label wraps onto far more lines than the box's auto-computed height accounts for";
    const ir = doc([box({ id: "dumb-zone", x: 0, y: 0, w: 160, h: 122, label })]);
    const diags = computeOcclusionDiagnostics(ir);
    const overflowDiags = diags.filter((d) => d.code === "layout/label-overflow");
    expect(overflowDiags).toHaveLength(1);
    expect(overflowDiags[0]).toMatchObject({ severity: "warning" });
    expect(overflowDiags[0]!.message).toContain("dumb-zone");
    expect(overflowDiags[0]!.message).toContain(label);
  });

  it("does not warn when a box's label fits its box", () => {
    const ir = doc([box({ id: "a", x: 0, y: 0, w: 120, h: 62, label: "A" })]);
    expect(computeOcclusionDiagnostics(ir).filter((d) => d.code === "layout/label-overflow")).toEqual([]);
  });
});
