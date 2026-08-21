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
 * parent-relative. A `<Note on="...">` is excluded from the flow the same
 * way (sized, but not arranged or counted toward the container's bounding
 * box) - `layout/attach.ts` places it after this whole pass finishes.
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

import type { StyleFont, StyleFontSize } from "../ir/styles.js";

import {
  boxHeightForWidth,
  DEFAULT_ALIGN,
  estimatedBoxSize,
  estimatedNoteSize,
  fitBoxWidth,
  geoScale,
  FRAME_PAD_INNER,
  FRAME_TITLE_PX,
  type Align,
  type Direction,
  type LayoutMode,
} from "./defaults.js";
import { attachNotes } from "./attach.js";
import { arrowLabelLineHeight, arrowLabelWidth } from "./glyph-metrics.js";

const DEFAULT_GAP = 40;
const SKIP_ROW_GAP_FACTOR = 2;
const SKIP_ROW_GAP_MAX = 4;
const TARGET_ASPECT = 16 / 9;
/** tldraw `arrowLabel.ts`'s squish margin: a straight arrow's body must be at least `label width + 64` before its label renders unsquished. */
const ARROW_LABEL_MARGIN = 64;
/** tldraw `ARROW_LABEL_PADDING` (`default-shape-constants.ts:55`), added on every side of the label box. */
const ARROW_LABEL_PADDING = 4.25;

type Rect = { x: number; y: number; w: number; h: number };
type FlowMode = "row" | "col" | "grid";
type Pad = { left: number; top: number; right: number; bottom: number };
type FlowEl = IRBoxPositioned | IRNotePositioned | IRFramePositioned;
type FanGroup = { sourceId: string; targetIds: string[] };
type FanBlock = { source: FlowEl; targets: FlowEl[]; w: number; h: number; rowH: number };
type AutoEdge = { from: string; to: string; label?: string; font?: StyleFont; size?: StyleFontSize };

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
  const allEdges: AutoEdge[] = [];
  collectEdgesDeep(ir.children, allEdges);
  const docLabeledEdges = allEdges.filter((e) => e.label !== undefined);
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
    docLabeledEdges,
  );
  return attachNotes({
    ...ir,
    layout: usedMode,
    ...(usedCols === undefined ? {} : { cols: usedCols }),
    children,
  });
}

function resolveMode(mode: LayoutMode | undefined): LayoutMode {
  return mode ?? "col";
}

async function sizeElement(
  el: IRBox | IRNote | IRFrame,
  placeAuto: AutoPlacer,
  docLabeledEdges: readonly AutoEdge[],
): Promise<IRBoxPositioned | IRNotePositioned | IRFramePositioned> {
  switch (el.kind) {
    case "box": {
      const size = estimatedBoxSize(el.label, el.maxW, el);
      return { ...el, x: el.x ?? 0, y: el.y ?? 0, w: el.w ?? size.w, h: el.h ?? size.h };
    }
    case "note": {
      if (el.sticky) {
        const size = estimatedNoteSize(el.text, el);
        return { ...el, x: el.x ?? 0, y: el.y ?? 0, w: el.w ?? size.w, h: el.h ?? size.h };
      }
      const w = el.w ?? fitBoxWidth(el.text, undefined, el);
      const h = el.h ?? boxHeightForWidth(el.text, w, el);
      return { ...el, x: el.x ?? 0, y: el.y ?? 0, w, h };
    }
    case "frame":
      return sizeFrame(el, placeAuto, docLabeledEdges);
  }
}

async function sizeFrame(
  frame: IRFrame,
  placeAuto: AutoPlacer,
  docLabeledEdges: readonly AutoEdge[],
): Promise<IRFramePositioned> {
  const mode = resolveMode(frame.layout);
  const gap = frame.gap ?? DEFAULT_GAP;
  const pad = frame.pad ?? FRAME_PAD_INNER;
  const hasFrameChild = frame.children.some((c) => c.kind === "frame" && c.group !== true);
  const padTop = pad + (hasFrameChild ? FRAME_TITLE_PX : 0);
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
    docLabeledEdges,
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
  docLabeledEdges: readonly AutoEdge[],
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
      return sizeElement(c, placeAuto, docLabeledEdges);
    }),
  );

  const flowedIndices = children
    .map((_, i) => i)
    .filter((i) => {
      const c = children[i]!;
      if (c.kind === "edge" || c.kind === "doc") return false;
      if (c.kind === "note" && c.on !== undefined) return false;
      return !(c.x !== undefined && c.y !== undefined);
    });

  if (mode === "row" || mode === "col" || mode === "grid") {
    applyContainerBoxSizing(children, sized, flowedIndices, mode);
  }

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
    const edges = collectAutoEdges(children);

    const fanGroups = mayAutoGrid ? findFanGroups(flowedIds, edges) : [];
    const { collapsedEls, collapsedIds, blocks, targetOwner } = collapseFanGroups(
      flowedEls,
      fanGroups,
      gap,
    );

    if (mayAutoGrid && mode === "col") {
      const childIds = children
        .filter((c) => c.kind !== "edge" && c.kind !== "doc")
        .map((c) => c.id);
      if (!formsChain(childIds, edges)) {
        flowMode = "grid";
        const preGap = hasSkipEdge(collapsedIds, edges) ? gap * SKIP_ROW_GAP_FACTOR : gap;
        flowCols = bestGridCols(collapsedEls, gap, TARGET_ASPECT, preGap);
      }
    }
    const clearanceEdges = resolveEdgeOwners(children, docLabeledEdges);
    const effectiveGap = labelClearanceGap(flowMode, flowCols, collapsedIds, clearanceEdges, gap);
    const rowGaps =
      flowMode === "grid"
        ? skipRowGaps(collapsedIds, edges, resolveCols(flowCols, collapsedEls.length), effectiveGap)
        : [];
    const positions = computeFlowPositions(
      collapsedEls,
      flowMode,
      flowCols,
      effectiveGap,
      rowGaps,
      pad.left,
      pad.top,
      align,
    );
    expandFanBlocks(sized, flowedIndices, positions, collapsedIds, blocks, targetOwner, effectiveGap);
    const bbox = boundingBox(children, sized);
    w = bbox.maxX + pad.right;
    h = bbox.maxY + pad.bottom;
    usedMode = flowMode;
    usedCols = flowCols;
  }

  const out: IRElementPositioned[] = children.map((c, i) => (c.kind === "edge" ? c : sized[i]!));
  return { children: out, w, h, mode: usedMode, cols: usedCols };
}

/**
 * Container-aware box sizing: a `col`/`grid` gives every flowed `box` child
 * (no explicit `w`) the same width - the widest natural (aspect-bounded)
 * width in the container, capped per-box by `maxW` if set - then re-wraps
 * each to its final width; a `row` leaves widths alone. Either way, every
 * flowed box (no explicit `h`) then gets the same height, the tallest in the
 * container. Frames keep their content-derived size and sticky notes their
 * fixed sticky width; stretching either would blow the aspect target or
 * can't be emitted at all, so only `box` children vote on the shared size.
 *
 * A geo `<Note>` (non-sticky) *receives* the container's shared box width in
 * `col`/`grid` (so it lines up with its siblings) but never votes on it, and
 * never receives the shared height - its height is always re-derived from
 * its own text at whatever width it lands on. Otherwise every box in a
 * grid like `release-pipeline` (62px-tall boxes) would inherit a note's
 * multi-line height and balloon to ~300px.
 */
function applyContainerBoxSizing(
  children: readonly IRElement[],
  sized: (IRBoxPositioned | IRNotePositioned | IRFramePositioned | null)[],
  flowedIndices: readonly number[],
  mode: "row" | "col" | "grid",
): void {
  const boxIdx = flowedIndices.filter((i) => children[i]!.kind === "box");
  if (boxIdx.length === 0) return;

  if (mode === "col" || mode === "grid") {
    let sharedW = 0;
    for (const i of boxIdx) {
      const box = children[i] as IRBox;
      if (box.w !== undefined) continue;
      const k = geoScale(box.label, box.maxW, box);
      sharedW = Math.max(sharedW, Math.ceil(fitBoxWidth(box.label, box.maxW, box) * k));
    }
    for (const i of boxIdx) {
      const box = children[i] as IRBox;
      if (box.w !== undefined) continue;
      const w = box.maxW === undefined ? sharedW : Math.min(sharedW, box.maxW);
      const k = geoScale(box.label, box.maxW, box);
      const h = Math.ceil(boxHeightForWidth(box.label, w / k, box) * k);
      sized[i] = { ...sized[i]!, w, h };
    }
    if (sharedW === 0) {
      for (const i of boxIdx) sharedW = Math.max(sharedW, sized[i]!.w);
    }

    const geoNoteIdx = flowedIndices.filter((i) => {
      const c = children[i]!;
      return c.kind === "note" && !(c as IRNote).sticky;
    });
    for (const i of geoNoteIdx) {
      const noteEl = children[i] as IRNote;
      if (noteEl.w !== undefined) continue;
      sized[i] = { ...sized[i]!, w: sharedW, h: boxHeightForWidth(noteEl.text, sharedW, noteEl) };
    }
  }

  let sharedH = 0;
  for (const i of boxIdx) sharedH = Math.max(sharedH, sized[i]!.h);
  for (const i of boxIdx) {
    const box = children[i] as IRBox;
    if (box.h === undefined) sized[i] = { ...sized[i]!, h: sharedH };
  }
}

function boundingBox(
  children: readonly IRElement[],
  sized: readonly (IRBoxPositioned | IRNotePositioned | IRFramePositioned | null)[],
): { maxX: number; maxY: number } {
  let maxX = 0;
  let maxY = 0;
  children.forEach((c, i) => {
    if (c.kind === "edge" || c.kind === "doc") return;
    if (c.kind === "note" && c.on !== undefined) return;
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
function collectAutoEdges(children: readonly IRElement[]): AutoEdge[] {
  const rawEdges: AutoEdge[] = [];
  collectEdgesDeep(children, rawEdges);
  return resolveEdgeOwners(children, rawEdges);
}

/**
 * Resolves each of `edges` to the pair of direct children of `children` that
 * contain (or are) its endpoints - regardless of where in the whole document
 * the edge itself was declared. Drops an edge whose endpoint isn't anywhere
 * in `children`'s subtree, or whose two endpoints resolve to the same direct
 * child (self-loop at this container's level).
 */
function resolveEdgeOwners(
  children: readonly IRElement[],
  edges: readonly AutoEdge[],
): AutoEdge[] {
  const owner = new Map<string, string>();
  for (const c of children) {
    if (c.kind === "edge" || c.kind === "doc") continue;
    owner.set(c.id, c.id);
    if (c.kind === "frame") indexDescendants(c.children, c.id, owner);
  }

  const out: AutoEdge[] = [];
  for (const e of edges) {
    const from = owner.get(e.from);
    const to = owner.get(e.to);
    if (from !== undefined && to !== undefined && from !== to) out.push({ ...e, from, to });
  }
  return out;
}

/**
 * A container's gap must clear any labeled edge between two consecutive
 * flowed siblings along the main axis (`grid`: consecutive within the same
 * row) - the space tldraw needs to render the label unsquished (T12). One
 * uniform gap per container: the declared gap, or the widest clearance any
 * qualifying edge needs, whichever is larger.
 */
function labelClearanceGap(
  flowMode: FlowMode,
  cols: number | undefined,
  ids: readonly string[],
  edges: readonly AutoEdge[],
  gap: number,
): number {
  if (ids.length < 2) return gap;
  const pos = new Map<string, number>();
  ids.forEach((id, i) => pos.set(id, i));
  const rowSize = flowMode === "grid" ? resolveCols(cols, ids.length) : ids.length;
  let effective = gap;
  for (const e of edges) {
    if (e.label === undefined) continue;
    const from = pos.get(e.from);
    const to = pos.get(e.to);
    if (from === undefined || to === undefined || Math.abs(from - to) !== 1) continue;
    if (flowMode === "grid" && Math.floor(from / rowSize) !== Math.floor(to / rowSize)) continue;
    const clearance =
      flowMode === "col"
        ? arrowLabelLineHeight(e) + 2 * ARROW_LABEL_PADDING
        : arrowLabelWidth(e.label, e) + ARROW_LABEL_MARGIN;
    effective = Math.max(effective, clearance);
  }
  return effective;
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

/**
 * Groups a source with `>= minOutDegree` distinct leaf targets - targets
 * whose only edge (in or out) connects back to the source - into one fan
 * group per source. Walks `flowedIds` in order so earlier sources claim
 * first; a candidate group touching an already-consumed source or target is
 * dropped whole, not partially formed. Parallel edges between the same pair
 * collapse into one neighbour (a fan is about distinct targets, not edge
 * count).
 */
export function findFanGroups(
  flowedIds: readonly string[],
  edges: readonly { from: string; to: string }[],
  minOutDegree = 4,
): FanGroup[] {
  const idSet = new Set(flowedIds);
  const neighbors = new Map<string, Set<string>>();
  for (const id of flowedIds) neighbors.set(id, new Set());
  for (const e of edges) {
    if (!idSet.has(e.from) || !idSet.has(e.to) || e.from === e.to) continue;
    neighbors.get(e.from)!.add(e.to);
    neighbors.get(e.to)!.add(e.from);
  }

  const consumed = new Set<string>();
  const groups: FanGroup[] = [];
  for (const s of flowedIds) {
    if (consumed.has(s)) continue;
    const sNeighbors = neighbors.get(s)!;
    const targetIds = flowedIds.filter((t) => {
      if (!sNeighbors.has(t)) return false;
      const tNeighbors = neighbors.get(t)!;
      return tNeighbors.size === 1 && tNeighbors.has(s);
    });
    if (targetIds.length < minOutDegree || targetIds.some((t) => consumed.has(t))) continue;
    groups.push({ sourceId: s, targetIds });
    consumed.add(s);
    for (const t of targetIds) consumed.add(t);
  }
  return groups;
}

/**
 * Replaces each fan group with one synthetic `Rect` at the source's index in
 * flowed order - source and its targets laid out left to right in a single
 * row (T6) - so every fan edge shares the source's axis and the parent flow
 * lays the whole fan out as a single unit. Targets are dropped from the
 * collapsed list; `expandFanBlocks` puts them back.
 */
function collapseFanGroups(
  flowedEls: readonly FlowEl[],
  groups: readonly FanGroup[],
  gap: number,
): {
  collapsedEls: Rect[];
  collapsedIds: string[];
  blocks: Map<string, FanBlock>;
  targetOwner: Map<string, { sourceId: string; index: number }>;
} {
  const byId = new Map(flowedEls.map((el) => [el.id, el]));
  const consumedTargets = new Set(groups.flatMap((g) => g.targetIds));
  const groupBySource = new Map(groups.map((g) => [g.sourceId, g]));
  const blocks = new Map<string, FanBlock>();
  const targetOwner = new Map<string, { sourceId: string; index: number }>();

  const collapsedEls: Rect[] = [];
  const collapsedIds: string[] = [];
  for (const el of flowedEls) {
    if (consumedTargets.has(el.id)) continue;
    const group = groupBySource.get(el.id);
    if (group === undefined) {
      collapsedEls.push({ x: el.x, y: el.y, w: el.w, h: el.h });
      collapsedIds.push(el.id);
      continue;
    }
    const targets = group.targetIds.map((id) => byId.get(id)!);
    const rowH = targets.reduce((m, t) => Math.max(m, t.h), el.h);
    const targetsW = targets.reduce((s, t) => s + t.w, 0);
    const w = el.w + targetsW + gap * targets.length;
    blocks.set(el.id, { source: el, targets, w, h: rowH, rowH });
    targets.forEach((t, index) => targetOwner.set(t.id, { sourceId: el.id, index }));
    collapsedEls.push({ x: 0, y: 0, w, h: rowH });
    collapsedIds.push(el.id);
  }
  return { collapsedEls, collapsedIds, blocks, targetOwner };
}

/**
 * Writes final positions back into `sized` for every flowed index: plain
 * elements take their collapsed position verbatim, a fan block's source and
 * targets are laid out left to right in the block's row, each vertically
 * centred against the row height.
 */
function expandFanBlocks(
  sized: (FlowEl | null)[],
  flowedIndices: readonly number[],
  positions: readonly { x: number; y: number }[],
  collapsedIds: readonly string[],
  blocks: ReadonlyMap<string, FanBlock>,
  targetOwner: ReadonlyMap<string, { sourceId: string; index: number }>,
  gap: number,
): void {
  const posById = new Map(collapsedIds.map((id, k) => [id, positions[k]!]));
  flowedIndices.forEach((i) => {
    const el = sized[i]!;
    const block = blocks.get(el.id);
    if (block !== undefined) {
      const p = posById.get(el.id)!;
      sized[i] = { ...el, x: p.x, y: p.y + Math.round((block.rowH - block.source.h) / 2) };
      return;
    }
    const owner = targetOwner.get(el.id);
    if (owner !== undefined) {
      const ownerBlock = blocks.get(owner.sourceId)!;
      const p = posById.get(owner.sourceId)!;
      const before = ownerBlock.targets.slice(0, owner.index).reduce((s, t) => s + t.w, 0);
      sized[i] = {
        ...el,
        x: p.x + ownerBlock.source.w + gap * (owner.index + 1) + before,
        y: p.y + Math.round((ownerBlock.rowH - el.h) / 2),
      };
      return;
    }
    const p = posById.get(el.id)!;
    sized[i] = { ...el, x: p.x, y: p.y };
  });
}

/**
 * Per-row-boundary version of the skip widening: for a `cols`-wide grid over
 * `flowedIds`, returns one gap per row boundary, scaled by how many edges
 * cross it (`gap * min(SKIP_ROW_GAP_MAX, 1 + crossings)`) - any edge whose
 * endpoints resolve to different grid rows, not just flow-order skip edges,
 * since row membership is already known here (`cols` is resolved).
 */
export function skipRowGaps(
  flowedIds: readonly string[],
  edges: readonly { from: string; to: string }[],
  cols: number,
  gap: number,
): number[] {
  if (cols <= 0) return [];
  const rows = Math.ceil(flowedIds.length / cols);
  if (rows < 2) return [];
  const pos = new Map<string, number>();
  flowedIds.forEach((id, i) => pos.set(id, i));
  const crossings = new Array<number>(rows - 1).fill(0);
  for (const e of edges) {
    const from = pos.get(e.from);
    const to = pos.get(e.to);
    if (from === undefined || to === undefined) continue;
    const lo = Math.min(Math.floor(from / cols), Math.floor(to / cols));
    const hi = Math.max(Math.floor(from / cols), Math.floor(to / cols));
    for (let b = lo; b < hi; b++) crossings[b] = crossings[b]! + 1;
  }
  return crossings.map((count) => gap * Math.min(SKIP_ROW_GAP_MAX, 1 + count));
}

function resolveCols(cols: number | undefined, n: number): number {
  return cols !== undefined && cols > 0 ? Math.floor(cols) : n || 1;
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

function collectEdgesDeep(children: readonly IRElement[], out: AutoEdge[]): void {
  for (const c of children) {
    if (c.kind === "edge") {
      out.push({
        from: c.from,
        to: c.to,
        ...(c.label === undefined ? {} : { label: c.label }),
        ...(c.font === undefined ? {} : { font: c.font }),
        ...(c.size === undefined ? {} : { size: c.size }),
      });
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
  rowGaps: readonly number[],
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
    const n = resolveCols(cols, els.length);
    return gridPositions(els, n, gap, rowGaps, padLeft, padTop);
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
  rowGaps: readonly number[],
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
    y += rowHeights[r]! + (rowGaps[r] ?? gap);
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
