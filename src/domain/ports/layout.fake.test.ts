import { describe, expect, it } from "vitest";

import type { IRDoc } from "../ir/index.js";

import { runContract } from "./layout.contract.js";
import { StubLayout } from "./layout.fake.js";

runContract("StubLayout", () => new StubLayout());

describe("StubLayout: deterministic policy", () => {
  it("lays children out left-to-right with no overlap on the x axis", async () => {
    const port = new StubLayout();
    const ir: IRDoc = {
      kind: "doc",
      id: "root",
      idExplicit: false,
      span: span(),
      children: [
        { kind: "box", id: "a", idExplicit: true, span: span() },
        { kind: "box", id: "b", idExplicit: true, span: span() },
        { kind: "box", id: "c", idExplicit: true, span: span() },
      ],
    };

    const out = await port.layout(ir);
    const xs = out.children.map((c) => {
      if (c.kind !== "box") throw new Error("expected box");
      return { x: c.x, w: c.w };
    });
    expect(xs[0]!.x).toBe(0);
    expect(xs[1]!.x).toBeGreaterThan(xs[0]!.x + xs[0]!.w);
    expect(xs[2]!.x).toBeGreaterThan(xs[1]!.x + xs[1]!.w);
  });

  it("honors explicit x/y/w/h on a pinned box", async () => {
    const port = new StubLayout();
    const ir: IRDoc = {
      kind: "doc",
      id: "root",
      idExplicit: false,
      span: span(),
      children: [
        {
          kind: "box",
          id: "a",
          idExplicit: true,
          span: span(),
          x: 500,
          y: 250,
          w: 80,
          h: 40,
        },
      ],
    };

    const out = await port.layout(ir);
    const box = out.children[0]!;
    if (box.kind !== "box") throw new Error("expected box");
    expect({ x: box.x, y: box.y, w: box.w, h: box.h }).toEqual({
      x: 500,
      y: 250,
      w: 80,
      h: 40,
    });
  });

  it("sizes a frame to contain its children plus padding", async () => {
    const port = new StubLayout();
    const ir: IRDoc = {
      kind: "doc",
      id: "root",
      idExplicit: false,
      span: span(),
      children: [
        {
          kind: "frame",
          id: "f",
          idExplicit: true,
          span: span(),
          children: [
            { kind: "box", id: "a", idExplicit: true, span: span() },
            { kind: "box", id: "b", idExplicit: true, span: span() },
          ],
        },
      ],
    };

    const out = await port.layout(ir);
    const frame = out.children[0]!;
    if (frame.kind !== "frame") throw new Error("expected frame");
    const childRight = frame.children
      .filter((c): c is Extract<typeof c, { kind: "box" }> => c.kind === "box")
      .reduce((acc, b) => Math.max(acc, b.x + b.w), 0);
    expect(frame.w).toBeGreaterThan(childRight);
  });

  it("passes edges through unchanged", async () => {
    const port = new StubLayout();
    const ir: IRDoc = {
      kind: "doc",
      id: "root",
      idExplicit: false,
      span: span(),
      children: [
        { kind: "box", id: "a", idExplicit: true, span: span() },
        { kind: "box", id: "b", idExplicit: true, span: span() },
        {
          kind: "edge",
          id: "e1",
          idExplicit: true,
          span: span(),
          from: "a",
          to: "b",
        },
      ],
    };

    const out = await port.layout(ir);
    const edge = out.children[2]!;
    if (edge.kind !== "edge") throw new Error("expected edge");
    expect(edge).toEqual(ir.children[2]);
  });
});

function span() {
  return { file: "test.tldx", line: 1, column: 1 };
}
