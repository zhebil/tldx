import { describe, expect, it } from "vitest";

import type { IRDoc, IRElementPositioned } from "../../domain/ir/index.js";
import { runContract } from "../../domain/ports/layout.contract.js";

import { ElkLayoutAdapter } from "./elk-layout.js";

runContract("ElkLayoutAdapter", () => new ElkLayoutAdapter());

describe("ElkLayoutAdapter: pinning policy", () => {
  it("honors hard pins (x AND y) verbatim", async () => {
    const port = new ElkLayoutAdapter();
    const ir: IRDoc = {
      kind: "doc",
      id: "root",
      idExplicit: false,
      span: span(),
      children: [
        {
          kind: "box",
          id: "pinned",
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

  it("auto-lays out unpinned siblings alongside a pinned one", async () => {
    const port = new ElkLayoutAdapter();
    const ir: IRDoc = {
      kind: "doc",
      id: "root",
      idExplicit: false,
      span: span(),
      children: [
        {
          kind: "box",
          id: "pinned",
          idExplicit: true,
          span: span(),
          x: 1000,
          y: 1000,
        },
        { kind: "box", id: "auto1", idExplicit: true, span: span() },
        { kind: "box", id: "auto2", idExplicit: true, span: span() },
      ],
    };

    const out = await port.layout(ir);
    const pinned = out.children[0]!;
    const a1 = out.children[1]!;
    const a2 = out.children[2]!;
    if (pinned.kind !== "box" || a1.kind !== "box" || a2.kind !== "box") {
      throw new Error("expected boxes");
    }
    expect({ x: pinned.x, y: pinned.y }).toEqual({ x: 1000, y: 1000 });
    // ELK should produce non-overlapping positions for auto-laid children.
    expect(Number.isFinite(a1.x)).toBe(true);
    expect(Number.isFinite(a2.x)).toBe(true);
    expect(a1.x === a2.x && a1.y === a2.y).toBe(false);
  });

  it("lays out a frame's interior (children get distinct positions)", async () => {
    const port = new ElkLayoutAdapter();
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
    expect(frame.children).toHaveLength(2);
    const a = frame.children[0]!;
    const b = frame.children[1]!;
    if (a.kind !== "box" || b.kind !== "box") {
      throw new Error("expected boxes");
    }
    expect(a.x === b.x && a.y === b.y).toBe(false);
    // Frame must be sized to contain its children.
    expect(frame.w).toBeGreaterThanOrEqual(Math.max(a.x + a.w, b.x + b.w));
    expect(frame.h).toBeGreaterThanOrEqual(Math.max(a.y + a.h, b.y + b.h));
  });

  it("passes edges through unchanged", async () => {
    const port = new ElkLayoutAdapter();
    const edge = {
      kind: "edge" as const,
      id: "e1",
      idExplicit: true,
      span: span(),
      from: "a",
      to: "b",
    };
    const ir: IRDoc = {
      kind: "doc",
      id: "root",
      idExplicit: false,
      span: span(),
      children: [
        { kind: "box", id: "a", idExplicit: true, span: span() },
        { kind: "box", id: "b", idExplicit: true, span: span() },
        edge,
      ],
    };

    const out = await port.layout(ir);
    expect(out.children[2]).toEqual(edge);
  });
});

describe("ElkLayoutAdapter: label-driven sizing", () => {
  it("grows a box's default width to fit a long label", async () => {
    const port = new ElkLayoutAdapter();
    const ir: IRDoc = {
      kind: "doc",
      id: "root",
      idExplicit: false,
      span: span(),
      children: [
        {
          kind: "box",
          id: "short",
          idExplicit: true,
          span: span(),
          label: "A",
        },
        {
          kind: "box",
          id: "long",
          idExplicit: true,
          span: span(),
          label: "EventSource client transport",
        },
      ],
    };

    const out = await port.layout(ir);
    const short = out.children[0]!;
    const long = out.children[1]!;
    if (short.kind !== "box" || long.kind !== "box") throw new Error("box");
    expect(long.w).toBeGreaterThan(short.w);
  });

  it("honors an explicit w even for a long label", async () => {
    const port = new ElkLayoutAdapter();
    const ir: IRDoc = {
      kind: "doc",
      id: "root",
      idExplicit: false,
      span: span(),
      children: [
        {
          kind: "box",
          id: "x",
          idExplicit: true,
          span: span(),
          label: "EventSource client transport",
          w: 200,
        },
      ],
    };
    const out = await port.layout(ir);
    const box = out.children[0]!;
    if (box.kind !== "box") throw new Error("box");
    expect(box.w).toBe(200);
  });
});

describe("ElkLayoutAdapter: hierarchical input + cross-frame edges", () => {
  it("places children inside the frame's content rect (clear of chrome)", async () => {
    const port = new ElkLayoutAdapter();
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
          name: "Backend",
          children: [
            { kind: "box", id: "a", idExplicit: true, span: span() },
            { kind: "box", id: "b", idExplicit: true, span: span() },
          ],
        },
      ],
    };
    const out = await port.layout(ir);
    const frame = out.children[0]!;
    if (frame.kind !== "frame") throw new Error("frame");
    for (const c of frame.children) {
      if (c.kind !== "box") continue;
      // chrome is ~32px on top; first row must clear it
      expect(c.y).toBeGreaterThanOrEqual(32);
    }
  });

  it("lays out a cross-frame edge without erroring", async () => {
    const port = new ElkLayoutAdapter();
    const ir: IRDoc = {
      kind: "doc",
      id: "root",
      idExplicit: false,
      span: span(),
      children: [
        {
          kind: "frame",
          id: "f1",
          idExplicit: true,
          span: span(),
          children: [
            { kind: "box", id: "a", idExplicit: true, span: span() },
          ],
        },
        {
          kind: "frame",
          id: "f2",
          idExplicit: true,
          span: span(),
          children: [
            { kind: "box", id: "b", idExplicit: true, span: span() },
          ],
        },
        {
          kind: "edge",
          id: "x",
          idExplicit: true,
          span: span(),
          from: "a",
          to: "b",
        },
      ],
    };
    const out = await port.layout(ir);
    expect(out.children).toHaveLength(3);
    const f1 = out.children[0]!;
    const f2 = out.children[1]!;
    if (f1.kind !== "frame" || f2.kind !== "frame") throw new Error("frame");
    // Both frames sized + positioned, no overlap on the layout axis.
    const f1Right = f1.x + f1.w;
    const f2Right = f2.x + f2.w;
    expect(positionedRectFinite(f1)).toBe(true);
    expect(positionedRectFinite(f2)).toBe(true);
    expect(f1Right === f2Right && f1.y === f2.y).toBe(false);
  });
});

describe("ElkLayoutAdapter: direction", () => {
  it("flips axis when direction='DOWN' is set on the doc", async () => {
    const ir = (direction: "RIGHT" | "DOWN"): IRDoc => ({
      kind: "doc",
      id: "root",
      idExplicit: false,
      span: span(),
      direction,
      children: [
        { kind: "box", id: "a", idExplicit: true, span: span() },
        { kind: "box", id: "b", idExplicit: true, span: span() },
        {
          kind: "edge",
          id: "ab",
          idExplicit: true,
          span: span(),
          from: "a",
          to: "b",
        },
      ],
    });
    const right = await new ElkLayoutAdapter().layout(ir("RIGHT"));
    const down = await new ElkLayoutAdapter().layout(ir("DOWN"));
    const ar = right.children[0]!;
    const br = right.children[1]!;
    const ad = down.children[0]!;
    const bd = down.children[1]!;
    if (
      ar.kind !== "box" || br.kind !== "box" ||
      ad.kind !== "box" || bd.kind !== "box"
    ) throw new Error("box");
    // RIGHT: b is to the right of a (different x, same y); DOWN: b is below a.
    expect(br.x).toBeGreaterThan(ar.x);
    expect(bd.y).toBeGreaterThan(ad.y);
  });
});

function positionedRectFinite(el: IRElementPositioned): boolean {
  if (el.kind === "edge" || el.kind === "doc") return true;
  return (
    Number.isFinite(el.x) &&
    Number.isFinite(el.y) &&
    el.w > 0 &&
    el.h > 0
  );
}

function span() {
  return { file: "test.tldsl", line: 1, column: 1 };
}
