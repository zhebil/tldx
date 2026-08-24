/**
 * Shared scenarios that every `LayoutPort` adapter must satisfy. The fake
 * (`layout.fake.ts`) and the real ELK adapter (`infra/layout-elk/`, tracked
 * in tldx-gxl) both run this contract to guard against fake drift.
 *
 * Per docs/testing.md: `runContract(make)` is invoked from the adapter's own
 * test file; the adapter supplies its constructor and (if needed) setup.
 *
 * The contract intentionally asserts only what is universal across layout
 * engines: ids and tree structure are preserved, every visual node ends up
 * with finite x/y/w/h, edges pass through unchanged. It does NOT pin specific
 * coordinates - that would couple the contract to the stub's grid policy.
 */

import { describe, expect, it } from "vitest";

import type {
  IRDoc,
  IRDocPositioned,
  IRElementPositioned,
} from "../ir/index.js";

import type { LayoutPort } from "./layout.js";

export function runContract(label: string, make: () => LayoutPort): void {
  describe(`LayoutPort contract: ${label}`, () => {
    it("preserves the doc's id and shape on an empty document", async () => {
      const port = make();
      const ir: IRDoc = {
        kind: "doc",
        id: "root",
        idExplicit: false,
        span: span(),
        children: [],
      };

      const out = await port.layout(ir);

      expect(out.kind).toBe("doc");
      expect(out.id).toBe("root");
      expect(out.children).toEqual([]);
    });

    it("assigns finite x/y/w/h to a single box", async () => {
      const port = make();
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
            label: "A",
          },
        ],
      };

      const out = await port.layout(ir);
      const box = out.children[0]!;
      if (box.kind !== "box") throw new Error("expected box");
      expect(Number.isFinite(box.x)).toBe(true);
      expect(Number.isFinite(box.y)).toBe(true);
      expect(box.w).toBeGreaterThan(0);
      expect(box.h).toBeGreaterThan(0);
      expect(box.id).toBe("a");
      expect(box.idExplicit).toBe(true);
    });

    it("preserves frame nesting, child order, and every id", async () => {
      const port = make();
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
              {
                kind: "box",
                id: "a",
                idExplicit: true,
                span: span(),
              },
              {
                kind: "note",
                id: "n",
                idExplicit: false,
                span: span(),
                text: "hello",
              },
              {
                kind: "edge",
                id: "e1",
                idExplicit: true,
                span: span(),
                from: "a",
                to: "a",
              },
            ],
          },
        ],
      };

      const out = await port.layout(ir);

      expect(out.children).toHaveLength(1);
      const frame = out.children[0]!;
      if (frame.kind !== "frame") throw new Error("expected frame");
      expect(frame.id).toBe("f");
      expect(Number.isFinite(frame.x)).toBe(true);
      expect(Number.isFinite(frame.y)).toBe(true);
      expect(frame.w).toBeGreaterThan(0);
      expect(frame.h).toBeGreaterThan(0);

      expect(frame.children.map((c) => c.id)).toEqual(["a", "n", "e1"]);
      expect(frame.children).toHaveLength(3);

      const box = frame.children[0]!;
      const note = frame.children[1]!;
      const edge = frame.children[2]!;
      if (box.kind !== "box") throw new Error("expected box");
      if (note.kind !== "note") throw new Error("expected note");
      if (edge.kind !== "edge") throw new Error("expected edge");

      expect(box.w).toBeGreaterThan(0);
      expect(note.w).toBeGreaterThan(0);
      // edges are connectors; they have no rect.
      expect(edge.from).toBe("a");
      expect(edge.to).toBe("a");
    });

    it("is deterministic on the same input", async () => {
      const port = make();
      const ir: IRDoc = {
        kind: "doc",
        id: "root",
        idExplicit: false,
        span: span(),
        children: [
          { kind: "box", id: "a", idExplicit: true, span: span() },
          { kind: "box", id: "b", idExplicit: true, span: span() },
        ],
      };

      const a = await port.layout(ir);
      const b = await port.layout(ir);
      expect(rectsOf(a)).toEqual(rectsOf(b));
    });
  });
}

function span() {
  return { file: "test.tldx", line: 1, column: 1 };
}

function rectsOf(
  doc: IRDocPositioned,
): Record<string, { x: number; y: number; w: number; h: number }> {
  const out: Record<string, { x: number; y: number; w: number; h: number }> =
    {};
  for (const c of doc.children) walk(c);
  return out;

  function walk(el: IRElementPositioned): void {
    if (el.kind === "box" || el.kind === "note" || el.kind === "frame") {
      out[el.id] = { x: el.x, y: el.y, w: el.w, h: el.h };
    }
    if (el.kind === "frame" || el.kind === "doc") {
      for (const c of el.children) walk(c);
    }
  }
}
