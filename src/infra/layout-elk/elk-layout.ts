/**
 * Real `LayoutPort` adapter on top of `elkjs`. The pure compiler core
 * (`domain/`) depends on the port; this adapter is the only place in the
 * codebase that may import `elkjs` (lint-enforced by both eslint
 * `no-restricted-imports` and dependency-cruiser).
 *
 * Translation strategy:
 *
 * - The IR tree maps directly onto ELK's nested-children model. The whole IR
 *   is fed to ELK as one nested graph (frames become parent ELK nodes with
 *   their own `children`); ELK then runs `hierarchyHandling=INCLUDE_CHILDREN`
 *   so cross-container edges route around obstacles instead of going through
 *   them. Without this, ELK has no way to honor frame boundaries.
 * - Edges are hoisted to the lowest common ancestor container of their
 *   endpoints (the convention ELK expects for cross-hierarchy edges). The
 *   MVP emit pipeline only consumes endpoint ids, not ELK's routing
 *   sections, so the routing pass is "free" - we feed edges in to give ELK
 *   topology information for node placement, then drop the routes.
 * - Each visual node carries an estimated `labels: [{ width, height }]`
 *   computed from `label.length * avg-char-px + padding` (no DOM, identical
 *   between `tldsl check` and `tldsl serve`). With
 *   `nodeSize.constraints=NODE_LABELS,MINIMUM_SIZE` ELK fits-or-grows the
 *   node around its text rather than clipping.
 * - Frames carry asymmetric `elk.padding` so children clear tldraw's title
 *   chrome (~32px on top); other sides use the standard inner padding.
 * - Hard pins (`x` AND `y` both set on an IR element) bypass ELK: the pinned
 *   element keeps its coordinates verbatim and is excluded from the ELK
 *   request. ELK lays out only the unpinned siblings; the pinned ones are
 *   stitched back at the end.
 *
 * Determinism: the contract requires `layout(ir)` to be deterministic on the
 * same input. ELK's layered algorithm is deterministic given the same input
 * graph and options; we never rely on insertion order for randomness.
 */

import ElkConstructor, {
  type ELK,
  type ElkExtendedEdge,
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
import {
  DEFAULT_DIRECTION,
  estimatedBoxSize,
  estimatedNoteSize,
  FRAME_PAD_INNER,
  FRAME_PAD_TOP,
  type Direction,
} from "../../domain/layout/defaults.js";
import type { LayoutPort } from "../../domain/ports/layout.js";

const BASE_OPTIONS: LayoutOptions = {
  "elk.algorithm": "layered",
  "elk.spacing.nodeNode": "40",
  "elk.layered.spacing.nodeNodeBetweenLayers": "60",
  "elk.hierarchyHandling": "INCLUDE_CHILDREN",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.nodeSize.constraints": "NODE_LABELS,MINIMUM_SIZE",
};

const ROOT_PADDING = "[top=0,left=0,bottom=0,right=0]";
const FRAME_PADDING = `[top=${FRAME_PAD_TOP},left=${FRAME_PAD_INNER},bottom=${FRAME_PAD_INNER},right=${FRAME_PAD_INNER}]`;

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
    const ctx: BuildCtx = {
      pinned: new Map(),
      idAncestors: new Map(),
      visualIds: new Set(),
      edges: [],
    };
    indexTree(ir, [], ctx);
    bucketEdges(ir, ctx);

    const rootGraph = buildElkNode(ir, ctx);
    // Skip the ELK call when the tree has nothing for it to lay out (every
    // visual is pinned, or the doc is empty); ELK rejects empty graphs.
    const positions = countElkNodes(rootGraph) > 0
      ? collectPositions(await this.elk.layout(rootGraph))
      : new Map<string, Pos>();
    return {
      ...ir,
      children: stitchChildren(ir.children, ctx, positions),
    };
  }
}

type BuildCtx = {
  /** Element ids whose IR has both x AND y set (hard pin). */
  pinned: Map<string, { x: number; y: number }>;
  /** id → container ids from root to (but excluding) the element itself. */
  idAncestors: Map<string, string[]>;
  /** Ids that are valid edge endpoints (boxes, notes, frames). */
  visualIds: Set<string>;
  /** Edges hoisted to their LCA container, ready to attach to ELK graphs. */
  edges: { id: string; from: string; to: string; lca: string }[];
};

function indexTree(el: IRElement, ancestors: string[], ctx: BuildCtx): void {
  if (el.kind === "frame" || el.kind === "box" || el.kind === "note") {
    ctx.visualIds.add(el.id);
    ctx.idAncestors.set(el.id, [...ancestors]);
    if (el.x !== undefined && el.y !== undefined) {
      ctx.pinned.set(el.id, { x: el.x, y: el.y });
    }
  }
  if (el.kind === "doc" || el.kind === "frame") {
    const nextAncestors = el.kind === "doc" ? ancestors : [...ancestors, el.id];
    for (const c of el.children) indexTree(c, nextAncestors, ctx);
  }
}

function bucketEdges(doc: IRDoc, ctx: BuildCtx): void {
  walk(doc);

  function walk(container: IRDoc | IRFrame): void {
    for (const c of container.children) {
      if (c.kind === "edge") {
        if (!ctx.visualIds.has(c.from) || !ctx.visualIds.has(c.to)) continue;
        const fromAnc = ctx.idAncestors.get(c.from) ?? [];
        const toAnc = ctx.idAncestors.get(c.to) ?? [];
        const lca = lcaContainerId(fromAnc, toAnc);
        ctx.edges.push({ id: c.id, from: c.from, to: c.to, lca });
        continue;
      }
      if (c.kind === "frame") walk(c);
    }
  }
}

function lcaContainerId(a: string[], b: string[]): string {
  // Both arrays start at root (empty prefix) and step down. Returning the
  // last common entry yields the deepest shared container id; fall back to
  // the synthetic "__root__" sentinel when the two paths diverge at root.
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i === 0 ? ROOT_ID : a[i - 1]!;
}

const ROOT_ID = "__root__";

function buildElkNode(el: IRElement, ctx: BuildCtx): ElkNode {
  if (el.kind === "doc") {
    return {
      id: ROOT_ID,
      layoutOptions: containerOptions(
        el.direction ?? DEFAULT_DIRECTION,
        /*isFrame=*/ false,
      ),
      children: buildContainerChildren(el.children, ctx),
      edges: edgesForContainer(ROOT_ID, ctx),
    };
  }
  if (el.kind === "frame") {
    const node: ElkNode = {
      id: el.id,
      layoutOptions: containerOptions(el.direction, /*isFrame=*/ true),
      children: buildContainerChildren(el.children, ctx),
      edges: edgesForContainer(el.id, ctx),
    };
    if (el.w !== undefined) node.width = el.w;
    if (el.h !== undefined) node.height = el.h;
    return node;
  }
  if (el.kind === "box") {
    return leafNode(el.id, el.label ?? "", explicitWH(el));
  }
  if (el.kind === "note") {
    return leafNode(el.id, el.text, explicitWH(el));
  }
  throw new Error(`buildElkNode: unexpected kind ${el.kind}`);
}

function containerOptions(direction: Direction | undefined, isFrame: boolean): LayoutOptions {
  const opts: LayoutOptions = { ...BASE_OPTIONS };
  opts["elk.padding"] = isFrame ? FRAME_PADDING : ROOT_PADDING;
  if (direction !== undefined) opts["elk.direction"] = direction;
  else if (!isFrame) opts["elk.direction"] = DEFAULT_DIRECTION;
  return opts;
}

function buildContainerChildren(
  children: readonly IRElement[],
  ctx: BuildCtx,
): ElkNode[] {
  const out: ElkNode[] = [];
  for (const c of children) {
    if (c.kind === "edge" || c.kind === "doc") continue;
    if (ctx.pinned.has(c.id)) continue; // pinned: excluded from ELK, stitched back later
    out.push(buildElkNode(c, ctx));
  }
  return out;
}

function edgesForContainer(containerId: string, ctx: BuildCtx): ElkExtendedEdge[] {
  const out: ElkExtendedEdge[] = [];
  for (const e of ctx.edges) {
    if (e.lca !== containerId) continue;
    // Skip edges that touch a pinned node or live inside a pinned subtree;
    // those nodes aren't in the ELK graph and ELK would reject the reference.
    if (touchesPinnedTree(e.from, ctx) || touchesPinnedTree(e.to, ctx)) continue;
    out.push({ id: `e:${e.id}`, sources: [e.from], targets: [e.to] });
  }
  return out;
}

function touchesPinnedTree(id: string, ctx: BuildCtx): boolean {
  if (ctx.pinned.has(id)) return true;
  const ancestors = ctx.idAncestors.get(id) ?? [];
  for (const a of ancestors) if (ctx.pinned.has(a)) return true;
  return false;
}

function leafNode(
  id: string,
  text: string,
  explicit: { w?: number; h?: number },
): ElkNode {
  // ELK has no kind discriminator on a leaf node; both boxes and notes use
  // the box estimator (an upper bound on rendered text width). Notes are
  // post-processed in `stitchOne` with their dedicated estimator if ELK
  // didn't return a width.
  const est = estimatedBoxSize(text);
  const width = explicit.w ?? est.w;
  const height = explicit.h ?? est.h;
  return {
    id,
    width,
    height,
    labels: text === "" ? [] : [{ text, width: est.w, height: est.h }],
  };
}

function explicitWH(el: IRBox | IRNote | IRFrame): { w?: number; h?: number } {
  return {
    ...(el.w === undefined ? {} : { w: el.w }),
    ...(el.h === undefined ? {} : { h: el.h }),
  };
}

type Pos = { x: number; y: number; w: number; h: number };

function countElkNodes(n: ElkNode): number {
  let count = (n.children ?? []).length;
  for (const c of n.children ?? []) count += countElkNodes(c);
  return count;
}

function collectPositions(node: ElkNode): Map<string, Pos> {
  const out = new Map<string, Pos>();
  walk(node);
  return out;

  function walk(n: ElkNode): void {
    if (n.id !== ROOT_ID) {
      out.set(n.id, {
        x: n.x ?? 0,
        y: n.y ?? 0,
        w: n.width ?? 0,
        h: n.height ?? 0,
      });
    }
    for (const c of n.children ?? []) walk(c);
  }
}

function stitchChildren(
  children: readonly IRElement[],
  ctx: BuildCtx,
  positions: Map<string, Pos>,
): IRElementPositioned[] {
  const out: IRElementPositioned[] = [];
  for (const child of children) {
    if (child.kind === "edge") {
      out.push(child);
      continue;
    }
    if (child.kind === "doc") {
      throw new Error("layout: nested <doc> is not permitted");
    }
    out.push(stitchOne(child, ctx, positions));
  }
  return out;
}

function stitchOne(
  el: IRBox | IRNote | IRFrame,
  ctx: BuildCtx,
  positions: Map<string, Pos>,
): IRBoxPositioned | IRNotePositioned | IRFramePositioned {
  const pinned = ctx.pinned.get(el.id);
  const fromElk = positions.get(el.id);
  const x = pinned?.x ?? fromElk?.x ?? 0;
  const y = pinned?.y ?? fromElk?.y ?? 0;

  switch (el.kind) {
    case "box": {
      const size = estimatedBoxSize(el.label);
      const w = el.w ?? fromElk?.w ?? size.w;
      const h = el.h ?? fromElk?.h ?? size.h;
      return { ...el, x, y, w, h };
    }
    case "note": {
      const size = estimatedNoteSize();
      const w = el.w ?? fromElk?.w ?? size.w;
      const h = el.h ?? fromElk?.h ?? size.h;
      return { ...el, x, y, w, h };
    }
    case "frame": {
      const innerChildren = stitchChildren(el.children, ctx, positions);
      const fallback = frameFallbackSize(innerChildren);
      const w = el.w ?? fromElk?.w ?? fallback.w;
      const h = el.h ?? fromElk?.h ?? fallback.h;
      const { x: _ix, y: _iy, w: _iw, h: _ih, children: _ic, ...rest } = el;
      void _ix; void _iy; void _iw; void _ih; void _ic;
      return { ...rest, x, y, w, h, children: innerChildren };
    }
  }
}

function frameFallbackSize(children: readonly IRElementPositioned[]): {
  w: number;
  h: number;
} {
  let maxX = 0;
  let maxY = 0;
  for (const c of children) {
    if (c.kind === "edge" || c.kind === "doc") continue;
    maxX = Math.max(maxX, c.x + c.w);
    maxY = Math.max(maxY, c.y + c.h);
  }
  return {
    w: Math.max(maxX + FRAME_PAD_INNER, FRAME_PAD_INNER * 2),
    h: Math.max(maxY + FRAME_PAD_INNER, FRAME_PAD_TOP + FRAME_PAD_INNER),
  };
}
