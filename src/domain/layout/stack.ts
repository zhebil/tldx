/**
 * `hybridLayout`: bottom-up container layout with per-container dispatch.
 * A container (`<doc>` or `<frame>`) with `layout` = `row`/`col`/`grid`
 * (the default when `layout` is absent) or `free` is placed deterministically
 * in this file; a container with `layout="auto"` delegates its already-sized,
 * unpinned children to the injected `AutoPlacer` (ELK in production - see
 * `infra/layout-elk/elk-layout.ts`) as flat, fixed-size leaf nodes plus the
 * edge topology found anywhere in its subtree.
 *
 * Same conventions throughout: leaf sizes come from `estimatedBoxSize` /
 * `estimatedNoteSize`, explicit `w`/`h` wins, hard-pinned children (`x` AND
 * `y` set) keep their coordinates verbatim and are excluded from the flow /
 * the auto placer, edges pass through unchanged, and child coordinates are
 * parent-relative.
 */

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
} from "../ir/index.js";

import {
  DEFAULT_ALIGN,
  estimatedBoxSize,
  estimatedNoteSize,
  FRAME_PAD_INNER,
  FRAME_TITLE_PX,
  type Align,
  type Direction,
  type LayoutMode,
} from "./defaults.js";

const DEFAULT_GAP = 40;
const SKIP_ROW_GAP_FACTOR = 2;
const TARGET_ASPECT = 16 / 9;

type Rect = { x: number; y: number; w: number; h: number };
type FlowMode = "row" | "col" | "grid";
type Pad = { left: number; top: number; right: number; bottom: number };

export type AutoPlaceRequest = {
  nodes: readonly { id: string; w: number; h: number }[];
  edges: readonly { from: string; to: string }[];
  direction: Direction | undefined;
  gap: number;
  padLeft: number;
  padTop: number;
  padRight: number;
  padBottom: number;
};

export type AutoPlaceResult = {
  positions: ReadonlyMap<string, { x: number; y: number }>;
  w: number;
  h: number;
};

export type AutoPlacer = (req: AutoPlaceRequest) => Promise<AutoPlaceResult>;

export async function hybridLayout(ir: IRDoc, placeAuto: AutoPlacer): Promise<IRDocPositioned> {
  const mode = resolveMode(ir.layout);
  const gap = ir.gap ?? DEFAULT_GAP;
  const mayAutoGrid = ir.layout === undefined && ir.cols === undefined;
  const { children, mode: usedMode, cols: usedCols } = await layoutContainer(
    ir.children,
    mode,
    ir.cols,
    gap,
    { left: 0, top: 0, right: 0, bottom: 0 },
    ir.direction,
    ir.align ?? DEFAULT_ALIGN,
    placeAuto,
    mayAutoGrid,
  );
  return {
    ...ir,
    layout: usedMode,
    ...(usedCols === undefined ? {} : { cols: usedCols }),
    children,
  };
}

function resolveMode(mode: LayoutMode | undefined): LayoutMode {
  return mode ?? "col";
}

async function sizeElement(
  el: IRBox | IRNote | IRFrame,
  placeAuto: AutoPlacer,
): Promise<IRBoxPositioned | IRNotePositioned | IRFramePositioned> {
  switch (el.kind) {
    case "box": {
      const size = estimatedBoxSize(el.label);
      return { ...el, x: el.x ?? 0, y: el.y ?? 0, w: el.w ?? size.w, h: el.h ?? size.h };
    }
    case "note": {
      const size = estimatedNoteSize(el.text);
      return { ...el, x: el.x ?? 0, y: el.y ?? 0, w: el.w ?? size.w, h: el.h ?? size.h };
    }
    case "frame":
      return sizeFrame(el, placeAuto);
  }
}

async function sizeFrame(frame: IRFrame, placeAuto: AutoPlacer): Promise<IRFramePositioned> {
  const mode = resolveMode(frame.layout);
  const gap = frame.gap ?? DEFAULT_GAP;
  const pad = frame.pad ?? FRAME_PAD_INNER;
  const padTop = pad + FRAME_TITLE_PX;
  const { children, w: contentW, h: contentH } = await layoutContainer(
    frame.children,
    mode,
    frame.cols,
    gap,
    { left: pad, top: padTop, right: pad, bottom: pad },
    frame.direction,
    frame.align ?? DEFAULT_ALIGN,
    placeAuto,
    false,
  );
  const w = frame.w ?? contentW;
  const h = frame.h ?? contentH;
  const { x: _x, y: _y, w: _w, h: _h, children: _c, ...rest } = frame;
  void _x; void _y; void _w; void _h; void _c;
  return { ...rest, x: frame.x ?? 0, y: frame.y ?? 0, w, h, children };
}

/**
 * Bottom-up: size every non-edge child first (recursing into frames), then
 * place the un-pinned ones per `mode`, reassembling the output in original
 * child order (edges pass through, pinned children keep their own x/y).
 * Returns the container's own content size, padding included.
 */
async function layoutContainer(
  children: readonly IRElement[],
  mode: LayoutMode,
  cols: number | undefined,
  gap: number,
  pad: Pad,
  direction: Direction | undefined,
  align: Align,
  placeAuto: AutoPlacer,
  mayAutoGrid: boolean,
): Promise<{
  children: IRElementPositioned[];
  w: number;
  h: number;
  mode: LayoutMode;
  cols: number | undefined;
}> {
  const sized: (IRBoxPositioned | IRNotePositioned | IRFramePositioned | null)[] = await Promise.all(
    children.map(async (c) => {
      if (c.kind === "edge") return null;
      if (c.kind === "doc") throw new Error("layout: nested <doc> is not permitted");
      return sizeElement(c, placeAuto);
    }),
  );

  const flowedIndices = children
    .map((_, i) => i)
    .filter((i) => {
      const c = children[i]!;
      if (c.kind === "edge" || c.kind === "doc") return false;
      return !(c.x !== undefined && c.y !== undefined);
    });

  let w: number;
  let h: number;
  let usedMode: LayoutMode = mode;
  let usedCols = cols;

  if (mode === "auto") {
    const nodes = flowedIndices.map((i) => {
      const s = sized[i]!;
      return { id: s.id, w: s.w, h: s.h };
    });
    const result = await placeAuto({
      nodes,
      edges: collectAutoEdges(children),
      direction,
      gap,
      padLeft: pad.left,
      padTop: pad.top,
      padRight: pad.right,
      padBottom: pad.bottom,
    });
    flowedIndices.forEach((i) => {
      const p = result.positions.get(sized[i]!.id);
      if (p !== undefined) sized[i] = { ...sized[i]!, x: p.x, y: p.y };
    });
    w = result.w;
    h = result.h;
  } else if (mode === "free") {
    flowedIndices.forEach((i) => {
      const c = children[i] as IRBox | IRNote | IRFrame;
      sized[i] = { ...sized[i]!, x: c.x ?? pad.left, y: c.y ?? pad.top };
    });
    const bbox = boundingBox(children, sized);
    w = bbox.maxX + pad.right;
    h = bbox.maxY + pad.bottom;
  } else {
    const flowedEls = flowedIndices.map((i) => sized[i]!);
    const flowedIds = flowedEls.map((el) => el.id);
    let flowMode: FlowMode = mode as FlowMode;
    let flowCols = cols;
    let autoEdges: { from: string; to: string }[] | undefined;
    if (mayAutoGrid && mode === "col") {
      const childIds = children
        .filter((c) => c.kind !== "edge" && c.kind !== "doc")
        .map((c) => c.id);
      autoEdges = collectAutoEdges(children);
      if (!formsChain(childIds, autoEdges)) {
        flowMode = "grid";
        const preGap = hasSkipEdge(flowedIds, autoEdges) ? gap * SKIP_ROW_GAP_FACTOR : gap;
        flowCols = bestGridCols(flowedEls, gap, TARGET_ASPECT, preGap);
      }
    }
    const edges = autoEdges ?? collectAutoEdges(children);
    const rowGap =
      flowMode === "grid" && hasSkipEdge(flowedIds, edges) ? gap * SKIP_ROW_GAP_FACTOR : gap;
    const positions = computeFlowPositions(
      flowedEls,
      flowMode,
      flowCols,
      gap,
      rowGap,
      pad.left,
      pad.top,
      align,
    );
    flowedIndices.forEach((i, k) => {
      sized[i] = { ...sized[i]!, x: positions[k]!.x, y: positions[k]!.y };
    });
    const bbox = boundingBox(children, sized);
    w = bbox.maxX + pad.right;
    h = bbox.maxY + pad.bottom;
    usedMode = flowMode;
    usedCols = flowCols;
  }

  const out: IRElementPositioned[] = children.map((c, i) => (c.kind === "edge" ? c : sized[i]!));
  return { children: out, w, h, mode: usedMode, cols: usedCols };
}

function boundingBox(
  children: readonly IRElement[],
  sized: readonly (IRBoxPositioned | IRNotePositioned | IRFramePositioned | null)[],
): { maxX: number; maxY: number } {
  let maxX = 0;
  let maxY = 0;
  children.forEach((c, i) => {
    if (c.kind === "edge" || c.kind === "doc") return;
    const s = sized[i]!;
    maxX = Math.max(maxX, s.x + s.w);
    maxY = Math.max(maxY, s.y + s.h);
  });
  return { maxX, maxY };
}

/**
 * Resolves every `<edge>` anywhere in `children`'s subtree to the pair of
 * direct children of `children` that contain (or are) its endpoints. Gives
 * an `auto` container ELK-topology hints without requiring it to see past
 * its own direct children.
 */
function collectAutoEdges(children: readonly IRElement[]): { from: string; to: string }[] {
  const owner = new Map<string, string>();
  for (const c of children) {
    if (c.kind === "edge" || c.kind === "doc") continue;
    owner.set(c.id, c.id);
    if (c.kind === "frame") indexDescendants(c.children, c.id, owner);
  }

  const rawEdges: { from: string; to: string }[] = [];
  collectEdgesDeep(children, rawEdges);

  const out: { from: string; to: string }[] = [];
  for (const e of rawEdges) {
    const from = owner.get(e.from);
    const to = owner.get(e.to);
    if (from !== undefined && to !== undefined && from !== to) out.push({ from, to });
  }
  return out;
}

/**
 * True iff the direct children of a container form a chain: at least one
 * edge, every child has resolved in-/out-degree <= 1, and the edges cover
 * most of the container (`edges.length * 2 >= childIds.length`). Used to
 * gate the doc-root aspect wrap - a grid is topology-blind and turns a
 * chain's adjacent-pair edges into row-wrap diagonals (see B7/B20 in
 * docs/layout-hypotheses.md).
 */
export function formsChain(
  childIds: readonly string[],
  edges: readonly { from: string; to: string }[],
): boolean {
  if (edges.length === 0) return false;
  const outDeg = new Map<string, number>();
  const inDeg = new Map<string, number>();
  for (const e of edges) {
    outDeg.set(e.from, (outDeg.get(e.from) ?? 0) + 1);
    inDeg.set(e.to, (inDeg.get(e.to) ?? 0) + 1);
  }
  for (const id of childIds) {
    if ((outDeg.get(id) ?? 0) > 1 || (inDeg.get(id) ?? 0) > 1) return false;
  }
  return edges.length * 2 >= childIds.length;
}

/**
 * True iff some edge connects two ids that both appear in `childIds` (flow
 * order) at positions more than one apart - a skip edge, one with no
 * corridor because the children it jumps over sit between its endpoints.
 * Ids not in `childIds` are ignored.
 */
export function hasSkipEdge(
  childIds: readonly string[],
  edges: readonly { from: string; to: string }[],
): boolean {
  const pos = new Map<string, number>();
  childIds.forEach((id, i) => pos.set(id, i));
  return edges.some((e) => {
    const from = pos.get(e.from);
    const to = pos.get(e.to);
    return from !== undefined && to !== undefined && Math.abs(from - to) > 1;
  });
}

function indexDescendants(
  children: readonly IRElement[],
  ownerId: string,
  owner: Map<string, string>,
): void {
  for (const c of children) {
    if (c.kind === "edge" || c.kind === "doc") continue;
    owner.set(c.id, ownerId);
    if (c.kind === "frame") indexDescendants(c.children, ownerId, owner);
  }
}

function collectEdgesDeep(
  children: readonly IRElement[],
  out: { from: string; to: string }[],
): void {
  for (const c of children) {
    if (c.kind === "edge") {
      out.push({ from: c.from, to: c.to });
      continue;
    }
    if (c.kind === "frame") collectEdgesDeep(c.children, out);
  }
}

function crossAxisPos(align: Align, pad: number, cross: number, size: number): number {
  switch (align) {
    case "start":
      return pad;
    case "center":
      return pad + Math.round((cross - size) / 2);
    case "end":
      return pad + (cross - size);
  }
}

function computeFlowPositions(
  els: readonly Rect[],
  mode: FlowMode,
  cols: number | undefined,
  gap: number,
  rowGap: number,
  padLeft: number,
  padTop: number,
  align: Align,
): { x: number; y: number }[] {
  if (mode === "row") {
    const maxH = els.reduce((m, el) => Math.max(m, el.h), 0);
    const out: { x: number; y: number }[] = [];
    let cursor = padLeft;
    for (const el of els) {
      out.push({ x: cursor, y: crossAxisPos(align, padTop, maxH, el.h) });
      cursor += el.w + gap;
    }
    return out;
  }
  if (mode === "grid") {
    const n = cols !== undefined && cols > 0 ? Math.floor(cols) : els.length || 1;
    return gridPositions(els, n, gap, rowGap, padLeft, padTop);
  }
  const maxW = els.reduce((m, el) => Math.max(m, el.w), 0);
  const out: { x: number; y: number }[] = [];
  let cursor = padTop;
  for (const el of els) {
    out.push({ x: crossAxisPos(align, padLeft, maxW, el.w), y: cursor });
    cursor += el.h + gap;
  }
  return out;
}

function gridPositions(
  els: readonly Rect[],
  cols: number,
  gap: number,
  rowGap: number,
  padLeft: number,
  padTop: number,
): { x: number; y: number }[] {
  const rows = Math.ceil(els.length / cols);
  const colWidths = new Array<number>(cols).fill(0);
  const rowHeights = new Array<number>(rows).fill(0);
  els.forEach((el, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    colWidths[c] = Math.max(colWidths[c]!, el.w);
    rowHeights[r] = Math.max(rowHeights[r]!, el.h);
  });
  const colX: number[] = [];
  let x = padLeft;
  for (let c = 0; c < cols; c++) {
    colX.push(x);
    x += colWidths[c]! + gap;
  }
  const rowY: number[] = [];
  let y = padTop;
  for (let r = 0; r < rows; r++) {
    rowY.push(y);
    y += rowHeights[r]! + rowGap;
  }
  return els.map((_, i) => ({ x: colX[i % cols]!, y: rowY[Math.floor(i / cols)]! }));
}

/** Pure column-max / row-max extent of a row-major grid, no positions. */
function gridExtent(
  els: readonly Rect[],
  cols: number,
  gap: number,
  rowGap: number = gap,
): { w: number; h: number } {
  const rows = Math.ceil(els.length / cols);
  const colWidths = new Array<number>(cols).fill(0);
  const rowHeights = new Array<number>(rows).fill(0);
  els.forEach((el, i) => {
    const r = Math.floor(i / cols);
    const c = i % cols;
    colWidths[c] = Math.max(colWidths[c]!, el.w);
    rowHeights[r] = Math.max(rowHeights[r]!, el.h);
  });
  const w = colWidths.reduce((a, b) => a + b, 0) + gap * (cols - 1);
  const h = rowHeights.reduce((a, b) => a + b, 0) + rowGap * (rows - 1);
  return { w, h };
}

/**
 * Scans `cols` from 1 to `els.length` and returns the one whose grid extent
 * is closest to `target` aspect ratio (log-ratio distance, so 2x too wide
 * and 2x too tall score equally). Ties keep the smaller `cols`.
 */
export function bestGridCols(
  els: readonly Rect[],
  gap: number,
  target: number = TARGET_ASPECT,
  rowGap: number = gap,
): number {
  if (els.length === 0) return 1;
  let bestCols = 1;
  let bestScore = Infinity;
  for (let cols = 1; cols <= els.length; cols++) {
    const { w, h } = gridExtent(els, cols, gap, rowGap);
    const score = Math.abs(Math.log(w / h / target));
    if (score < bestScore) {
      bestScore = score;
      bestCols = cols;
    }
  }
  return bestCols;
}
