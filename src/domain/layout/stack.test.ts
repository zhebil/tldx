import { describe, expect, it } from "vitest";

import { lower } from "../ir/lower.js";
import type { IRBoxPositioned, IRElementPositioned, IRFramePositioned } from "../ir/index.js";
import { parse } from "../parser/index.js";

import { estimatedBoxSize } from "./defaults.js";
import { hybridLayout, type AutoPlacer } from "./stack.js";

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

function layoutSource(source: string, placeAuto: AutoPlacer = stubPlaceAuto) {
  const { ast, diagnostics: parseDiags } = parse(source, "test.tldsl");
  expect(parseDiags).toEqual([]);
  const { ir, diagnostics } = lower(ast);
  expect(diagnostics).toEqual([]);
  if (ir === null) throw new Error("lower returned null ir");
  return hybridLayout(ir, placeAuto);
}

function box(children: readonly IRElementPositioned[], id: string): IRBoxPositioned {
  const el = children.find((c) => c.kind === "box" && c.id === id);
  if (el === undefined) throw new Error(`no box '${id}'`);
  return el as IRBoxPositioned;
}

function frame(children: readonly IRElementPositioned[], id: string): IRFramePositioned {
  const el = children.find((c) => c.kind === "frame" && c.id === id);
  if (el === undefined) throw new Error(`no frame '${id}'`);
  return el as IRFramePositioned;
}

describe("hybridLayout", () => {
  it("stacks col children top-to-bottom in source order", async () => {
    const doc = await layoutSource(`
      <doc layout="col">
        <box id="a" label="A" />
        <box id="b" label="B" />
        <box id="c" label="C" />
      </doc>
    `);
    const a = box(doc.children, "a");
    const b = box(doc.children, "b");
    const c = box(doc.children, "c");
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
    expect(b.y).toBeGreaterThan(a.y);
    expect(c.y).toBeGreaterThan(b.y);
    expect(b.x).toBe(0);
    expect(c.x).toBe(0);
  });

  it("defaults to col when layout is absent", async () => {
    const doc = await layoutSource(`
      <doc>
        <box id="a" label="A" />
        <box id="b" label="B" />
      </doc>
    `);
    const a = box(doc.children, "a");
    const b = box(doc.children, "b");
    expect(a.x).toBe(0);
    expect(b.x).toBe(0);
    expect(b.y).toBeGreaterThan(a.y);
  });

  it("stacks row children left-to-right in source order", async () => {
    const doc = await layoutSource(`
      <doc layout="row">
        <box id="a" label="A" />
        <box id="b" label="B" />
        <box id="c" label="C" />
      </doc>
    `);
    const a = box(doc.children, "a");
    const b = box(doc.children, "b");
    const c = box(doc.children, "c");
    expect(a.y).toBe(0);
    expect(a.x).toBe(0);
    expect(b.x).toBeGreaterThan(a.x);
    expect(c.x).toBeGreaterThan(b.x);
    expect(b.y).toBe(0);
    expect(c.y).toBe(0);
  });

  it("places grid children row-major", async () => {
    const doc = await layoutSource(`
      <doc layout="grid" cols="2">
        <box id="a" label="A" />
        <box id="b" label="B" />
        <box id="c" label="C" />
        <box id="d" label="D" />
      </doc>
    `);
    const a = box(doc.children, "a");
    const b = box(doc.children, "b");
    const c = box(doc.children, "c");
    const d = box(doc.children, "d");
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
    const doc = await layoutSource(`
      <doc layout="col">
        <frame id="f" layout="col" pad="10" gap="5">
          <box id="a" label="A" />
          <box id="b" label="B" />
        </frame>
      </doc>
    `);
    const f = frame(doc.children, "f");
    const a = box(f.children, "a");
    const b = box(f.children, "b");
    const sizeA = estimatedBoxSize("A");
    const sizeB = estimatedBoxSize("B");
    expect(a.x).toBe(10);
    expect(a.y).toBe(10 + 32); // pad + FRAME_TITLE_PX
    expect(b.y).toBe(a.y + sizeA.h + 5);
    expect(f.w).toBe(Math.max(sizeA.w, sizeB.w) + 10 + 10);
    expect(f.h).toBe(b.y + sizeB.h + 10);
  });

  it("keeps a hard-pinned child's coordinates verbatim and out of the flow", async () => {
    const doc = await layoutSource(`
      <doc layout="col">
        <box id="a" label="A" />
        <box id="pinned" label="Pinned" x="500" y="500" />
        <box id="b" label="B" />
      </doc>
    `);
    const a = box(doc.children, "a");
    const pinned = box(doc.children, "pinned");
    const b = box(doc.children, "b");
    expect(pinned.x).toBe(500);
    expect(pinned.y).toBe(500);
    // b flows directly after a, unaffected by the pinned sibling.
    const sizeA = estimatedBoxSize("A");
    expect(b.y).toBe(a.y + sizeA.h + 40);
  });

  it("sizes a nested frame bottom-up before the parent's row placement uses it", async () => {
    const doc = await layoutSource(`
      <doc layout="row" gap="10">
        <frame id="f1" layout="col" pad="10" gap="5">
          <box id="a" label="A very long label indeed" />
        </frame>
        <frame id="f2" layout="col" pad="10" gap="5">
          <box id="b" label="B" />
        </frame>
      </doc>
    `);
    const f1 = frame(doc.children, "f1");
    const f2 = frame(doc.children, "f2");
    expect(f2.x).toBe(f1.x + f1.w + 10);
  });

  it("delegates an auto container to the injected placer and applies its positions/size", async () => {
    const doc = await layoutSource(`
      <doc layout="auto" gap="10">
        <box id="a" label="A" />
        <box id="b" label="B" />
        <edge id="e" from="a" to="b" />
      </doc>
    `);
    const a = box(doc.children, "a");
    const b = box(doc.children, "b");
    const sizeA = estimatedBoxSize("A");
    expect(a.x).toBe(0);
    expect(a.y).toBe(0);
    expect(b.x).toBe(sizeA.w + 10);
    expect(b.y).toBe(0);
  });
});
