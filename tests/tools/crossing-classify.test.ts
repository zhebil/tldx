import { describe, expect, it } from "vitest";

import { classifyCrossing } from "../../tools/crossing-classify.mjs";
import type { AbsShape } from "../../tools/layout-report.mjs";

function shape(id: string, parentId: string, x: number, y: number, w = 40, h = 40): AbsShape {
  return { id, kind: "box", label: id, parentId, x, y, w, h, ancestorFrameIds: [] };
}

function ctx(shapes: AbsShape[], outDegreeInContainer: Record<string, number> = {}) {
  return {
    byId: new Map(shapes.map((s) => [s.id, s])),
    outDegreeInContainer: new Map(Object.entries(outDegreeInContainer)),
  };
}

describe("classifyCrossing", () => {
  it("same-axis skip: crossed box sits between the endpoints in a horizontal row", () => {
    const a = shape("a", "row1", 0, 0);
    const b = shape("b", "row1", 100, 0);
    const c = shape("c", "row1", 200, 0);
    expect(classifyCrossing({ from: "a", to: "c", crossedId: "b" }, ctx([a, b, c]))).toBe(
      "same-axis skip",
    );
  });

  it("not a same-axis skip when the crossed box is not between the endpoints", () => {
    const a = shape("a", "row1", 0, 0);
    const b = shape("b", "row1", 100, 0);
    const c = shape("c", "row1", 200, 0);
    // b crosses a->c fine, but here we ask whether c (outside a..b) qualifies for a->b
    expect(classifyCrossing({ from: "a", to: "b", crossedId: "c" }, ctx([a, b, c]))).not.toBe(
      "same-axis skip",
    );
  });

  it("cross-container: endpoints live in different containers", () => {
    const a = shape("a", "left", 0, 0);
    const b = shape("b", "right", 300, 0);
    const c = shape("c", "middle", 150, 0);
    expect(classifyCrossing({ from: "a", to: "b", crossedId: "c" }, ctx([a, b, c]))).toBe(
      "cross-container",
    );
  });

  it("fan: source has out-degree >= 4 within its container", () => {
    const a = shape("hub", "row1", 0, 0);
    const b = shape("leaf-2", "row1", 100, 0);
    const c = shape("leaf-5", "row1", 400, 100); // not collinear with a/b
    expect(
      classifyCrossing(
        { from: "hub", to: "leaf-5", crossedId: "leaf-2" },
        ctx([a, b, c], { hub: 4 }),
      ),
    ).toBe("fan");
  });

  it("other: same container, low out-degree, not collinear/between", () => {
    const a = shape("a", "row1", 0, 0);
    const b = shape("b", "row1", 400, 100);
    const c = shape("c", "row1", 200, 300);
    expect(classifyCrossing({ from: "a", to: "b", crossedId: "c" }, ctx([a, b, c], { a: 1 }))).toBe(
      "other",
    );
  });

  it("other: an id that doesn't resolve to any shape", () => {
    const a = shape("a", "row1", 0, 0);
    const b = shape("b", "row1", 100, 0);
    expect(classifyCrossing({ from: "a", to: "b", crossedId: "ghost" }, ctx([a, b]))).toBe("other");
  });
});
