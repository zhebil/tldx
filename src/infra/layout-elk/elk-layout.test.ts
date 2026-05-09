import { describe, expect, it } from "vitest";

import type { IRDoc } from "../../domain/ir/index.js";
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

function span() {
  return { file: "test.tldsl", line: 1, column: 1 };
}
