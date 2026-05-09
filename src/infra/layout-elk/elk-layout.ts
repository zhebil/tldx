/**
 * Real `LayoutPort` adapter on top of `elkjs`. The pure compiler core
 * (`domain/`) depends on the port; this adapter is the only place in the
 * codebase that may import `elkjs` (lint-enforced by both eslint
 * `no-restricted-imports` and dependency-cruiser).
 *
 * Translation strategy:
 *
 * - The IR tree maps directly onto ELK's nested-children model. `IRDoc` and
 *   `IRFrame` become ELK parents; `IRBox` and `IRNote` become leaf nodes.
 * - `IREdge` is a connector with no rect of its own. The MVP emit pipeline
 *   only consumes edge endpoints (`from`/`to` ids), not ELK's routing
 *   sections, so we omit edges from the ELK graph and pass them through
 *   unchanged. This keeps adapter behavior identical to the StubLayout fake
 *   for edges.
 * - Hard pins (`x` AND `y` both set on an IR element) bypass ELK: the pinned
 *   element keeps its coordinates verbatim and is excluded from the ELK
 *   request for that container. ELK lays out only the unpinned siblings.
 *   The container's own size is the bounding box of all children
 *   (pinned + auto-laid) plus a uniform padding.
 *
 * Determinism: the contract requires `layout(ir)` to be deterministic on the
 * same input. ELK's layered algorithm is deterministic given the same input
 * graph and options; we never rely on insertion order for randomness.
 */

import ElkConstructor, {
  type ELK,
  type ElkNode,
  type LayoutOptions,
} from "elkjs";

import type {
  IRBox,
  IRBoxPositioned,
  IRDoc,
  IRDocPositioned,
  IRElement,
  IRElementPositioned,
  IRFrame,
  IRFramePositioned,
  IRNote,
  IRNotePositioned,
} from "../../domain/ir/index.js";
import type { LayoutPort } from "../../domain/ports/layout.js";

const BOX_W = 120;
const BOX_H = 60;
const NOTE_W = 200;
const NOTE_H = 80;
const FRAME_PADDING = 32;
const EMPTY_FRAME_W = BOX_W;
const EMPTY_FRAME_H = BOX_H;

const ELK_LAYOUT_OPTIONS: LayoutOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.spacing.nodeNode": "40",
  "elk.layered.spacing.nodeNodeBetweenLayers": "60",
  "elk.padding": "[top=0,left=0,bottom=0,right=0]",
};

export interface ElkLayoutAdapterOptions {
  /**
   * Override the ELK constructor. Tests may use this to inject a different
   * worker setup; production code should leave it unset.
   */
  elkFactory?: () => ELK;
}

export class ElkLayoutAdapter implements LayoutPort {
  private readonly elk: ELK;

  constructor(options: ElkLayoutAdapterOptions = {}) {
    const factory = options.elkFactory ?? (() => new ElkConstructor());
    this.elk = factory();
  }

  async layout(ir: IRDoc): Promise<IRDocPositioned> {
    const placedChildren = await layoutChildren(ir.children, this.elk);
    return {
      ...ir,
      children: placedChildren,
    };
  }
}

async function layoutChildren(
  children: readonly IRElement[],
  elk: ELK,
): Promise<IRElementPositioned[]> {
  // Phase 1: recurse into frames so nested children get their own positions
  // (relative to the frame). For boxes/notes we record default sizes; for
  // frames we compute the inner layout first to know the frame's size.
  const pre: PreNode[] = [];
  for (const child of children) {
    if (child.kind === "edge") {
      pre.push({ kind: "edge", edge: child });
      continue;
    }
    if (child.kind === "doc") {
      // Nested <doc> is rejected at IR-lowering; defend in depth.
      throw new Error("layout: nested <doc> is not permitted");
    }
    if (child.kind === "frame") {
      const innerChildren = await layoutChildren(child.children, elk);
      const bbox = childBounds(innerChildren);
      const w = child.w ?? bbox.w + FRAME_PADDING * 2;
      const h = child.h ?? bbox.h + FRAME_PADDING * 2;
      pre.push(makePre(child, w, h, innerChildren));
      continue;
    }
    // box or note
    const w = child.w ?? defaultW(child);
    const h = child.h ?? defaultH(child);
    pre.push(makePre(child, w, h, undefined));
  }

  // Phase 2: assign auto positions via ELK for the unpinned visual nodes.
  const positions = await runElkOnUnpinned(pre, elk);

  // Phase 3: stitch positions back into IR shape, preserving order + ids.
  const out: IRElementPositioned[] = [];
  for (let i = 0; i < pre.length; i++) {
    const p = pre[i]!;
    if (p.kind === "edge") {
      out.push(p.edge);
      continue;
    }
    let x: number;
    let y: number;
    if (p.pinned) {
      x = p.pinnedX;
      y = p.pinnedY;
    } else {
      const pos = positions.get(i);
      // ELK should always assign a position for every requested node; defend
      // in depth in case ELK misbehaves with empty/degenerate input.
      x = pos?.x ?? 0;
      y = pos?.y ?? 0;
    }
    out.push(buildPositioned(p.el, x, y, p.width, p.height, p.innerChildren));
  }
  return out;
}

type PreNode =
  | {
      kind: "edge";
      edge: Extract<IRElement, { kind: "edge" }>;
    }
  | {
      kind: "node";
      el: IRBox | IRNote | IRFrame;
      pinned: false;
      width: number;
      height: number;
      innerChildren: IRElementPositioned[] | undefined;
    }
  | {
      kind: "node";
      el: IRBox | IRNote | IRFrame;
      pinned: true;
      pinnedX: number;
      pinnedY: number;
      width: number;
      height: number;
      innerChildren: IRElementPositioned[] | undefined;
    };

function makePre(
  el: IRBox | IRNote | IRFrame,
  w: number,
  h: number,
  innerChildren: IRElementPositioned[] | undefined,
): PreNode {
  if (el.x !== undefined && el.y !== undefined) {
    return {
      kind: "node",
      el,
      pinned: true,
      pinnedX: el.x,
      pinnedY: el.y,
      width: w,
      height: h,
      innerChildren,
    };
  }
  return {
    kind: "node",
    el,
    pinned: false,
    width: w,
    height: h,
    innerChildren,
  };
}

async function runElkOnUnpinned(
  pre: readonly PreNode[],
  elk: ELK,
): Promise<Map<number, { x: number; y: number }>> {
  const positions = new Map<number, { x: number; y: number }>();
  const elkChildren: ElkNode[] = [];
  const indexById = new Map<string, number>();
  for (let i = 0; i < pre.length; i++) {
    const p = pre[i]!;
    if (p.kind === "edge") continue;
    if (p.pinned) continue;
    const elkId = `n${i}`;
    indexById.set(elkId, i);
    elkChildren.push({
      id: elkId,
      width: p.width,
      height: p.height,
    });
  }

  if (elkChildren.length === 0) {
    return positions;
  }

  const graph: ElkNode = {
    id: "root",
    layoutOptions: ELK_LAYOUT_OPTIONS,
    children: elkChildren,
  };

  const out = await elk.layout(graph);
  for (const c of out.children ?? []) {
    const idx = indexById.get(c.id);
    if (idx === undefined) continue;
    positions.set(idx, { x: c.x ?? 0, y: c.y ?? 0 });
  }
  return positions;
}

function defaultW(el: IRBox | IRNote): number {
  return el.kind === "box" ? BOX_W : NOTE_W;
}

function defaultH(el: IRBox | IRNote): number {
  return el.kind === "box" ? BOX_H : NOTE_H;
}

function buildPositioned(
  el: IRBox | IRNote | IRFrame,
  x: number,
  y: number,
  w: number,
  h: number,
  innerChildren: IRElementPositioned[] | undefined,
): IRBoxPositioned | IRNotePositioned | IRFramePositioned {
  switch (el.kind) {
    case "box":
      return { ...el, x, y, w, h };
    case "note":
      return { ...el, x, y, w, h };
    case "frame": {
      // Strip optional rect fields off the frame; the positioned variant
      // requires them, and we've already produced final values.
      const { x: _ix, y: _iy, w: _iw, h: _ih, children: _ic, ...rest } = el;
      void _ix;
      void _iy;
      void _iw;
      void _ih;
      void _ic;
      return {
        ...rest,
        x,
        y,
        w,
        h,
        children: innerChildren ?? [],
      };
    }
  }
}

function childBounds(
  children: readonly IRElementPositioned[],
): { w: number; h: number } {
  let maxX = 0;
  let maxY = 0;
  for (const c of children) {
    if (c.kind === "edge" || c.kind === "doc") continue;
    maxX = Math.max(maxX, c.x + c.w);
    maxY = Math.max(maxY, c.y + c.h);
  }
  return {
    w: Math.max(maxX, EMPTY_FRAME_W),
    h: Math.max(maxY, EMPTY_FRAME_H),
  };
}
