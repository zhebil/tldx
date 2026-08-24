/**
 * Positioned IR to tldraw scene JSON. Pure; composes over
 * `src/contracts/builders.ts` and never hand-rolls record JSON.
 *
 * Shape ids are `shape:<irId>` and `parentId` follows the IR tree. Edges
 * become an arrow plus two bindings, parented to the common ancestor of their
 * endpoints so tldraw's `reparentArrow` never rewrites them - see
 * `arrowPlacement`.
 */

import {
  arrowBinding,
  arrowShape,
  boxShape,
  documentRecord,
  frameShape,
  noteShape,
  pageRecord,
  sceneJson,
  textShape,
} from "../../contracts/builders.js";
import type { SceneJSON, TLRecord } from "../../contracts/scene-json.js";
import { NOTE_SIZE } from "../layout/defaults.js";
import { computeEdgeRoutes } from "../layout/routing.js";
import type { EdgeRoute } from "../layout/routing.js";
import { drawsChrome } from "../ir/index.js";
import type {
  IRBoxPositioned,
  IRDocPositioned,
  IREdge,
  IRElementPositioned,
  IRFramePositioned,
  IRNotePositioned,
} from "../ir/index.js";

const PAGE_ID = "page:main";

/**
 * The digit alphabet tldraw's fractional-index generator uses for a
 * single-character index slot (`base62CharSet`: `0-9A-Za-z`, ascending).
 * Copied as a literal because domain cannot depend on tldraw's runtime. All
 * that matters is the ordering guarantee: fixed-length strings built from it
 * compare correctly with plain `<`/`>`.
 */
const INDEX_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

// ponytail: caps a container at 31 non-arrow children (odd slots 1..61 of
// INDEX_ALPHABET, arrows take the even slots between them). Real diagrams
// don't come close; if one ever does, extend indexAt to a second digit
// rather than raising this silently.
function indexAt(slot: number): string {
  if (slot < 0 || slot >= INDEX_ALPHABET.length) {
    throw new Error(
      `emit: index slot ${slot} exceeds ${INDEX_ALPHABET.length} shapes under one parent`,
    );
  }
  return `a${INDEX_ALPHABET[slot]}`;
}

/** The arrow slot directly above a sibling's index - `a3` -> `a4`. */
function slotAfter(index: string): string {
  const pos = INDEX_ALPHABET.indexOf(index[1] ?? "");
  return indexAt(pos + 1);
}

type EmitContext = {
  /** Next unassigned slot number, per emitted parentId. */
  siblingCounters: Map<string, number>;
  /** IR id -> chain of ancestor chrome-frame shape ids (root-first, self excluded). */
  chainOf: Map<string, string[]>;
  /** shapeId -> its assigned index. */
  indexOf: Map<string, string>;
  /** Edges collected during the tree walk, emitted once every index is known. */
  edges: IREdge[];
};

function nextIndex(ctx: EmitContext, parentId: string): string {
  const slot = ctx.siblingCounters.get(parentId) ?? 0;
  ctx.siblingCounters.set(parentId, slot + 1);
  return indexAt(2 * slot + 1);
}

/**
 * `fallbackName` names the page when the document declares no `title` - the
 * CLI passes the file name. The page name is what tldraw's page menu shows and
 * what the viewer puts in the browser tab.
 */
export function emit(ir: IRDocPositioned, fallbackName?: string): SceneJSON {
  const name = ir.title ?? fallbackName;
  const records: TLRecord[] = [
    documentRecord(),
    pageRecord({ id: PAGE_ID, ...(name === undefined ? {} : { name }) }),
  ];
  const routes = computeEdgeRoutes(ir);
  const ctx: EmitContext = {
    siblingCounters: new Map(),
    chainOf: new Map(),
    indexOf: new Map(),
    edges: [],
  };

  for (const child of ir.children) {
    emitElement(child, PAGE_ID, [], records, ctx);
  }
  // Deferred until every non-arrow shape has an index: an edge's placement
  // depends on its endpoints' indices, which may be assigned later in emit
  // order than the edge itself appears in the IR tree.
  for (const edge of ctx.edges) {
    emitEdge(edge, records, routes.get(edge.id), ctx);
  }

  return sceneJson(records);
}

/**
 * `offsetX`/`offsetY` fold in the origin of enclosing chrome-free frames -
 * such a frame draws no shape, so its children must carry its position into
 * their own coords. `chain` only grows at a chrome-drawing frame, the only
 * kind with a shape id an arrow could be parented to.
 */
function emitElement(
  el: IRElementPositioned,
  parentId: string,
  chain: string[],
  out: TLRecord[],
  ctx: EmitContext,
  offsetX = 0,
  offsetY = 0,
): void {
  switch (el.kind) {
    case "box": {
      const index = nextIndex(ctx, parentId);
      ctx.chainOf.set(el.id, chain);
      ctx.indexOf.set(shapeId(el.id), index);
      out.push(
        el.text
          ? emitText(el, parentId, index, offsetX, offsetY)
          : emitBox(el, parentId, index, offsetX, offsetY),
      );
      return;
    }
    case "note": {
      const index = nextIndex(ctx, parentId);
      ctx.chainOf.set(el.id, chain);
      ctx.indexOf.set(shapeId(el.id), index);
      out.push(emitNote(el, parentId, index, offsetX, offsetY));
      return;
    }
    case "frame":
      if (!drawsChrome(el)) {
        for (const child of el.children) {
          emitElement(child, parentId, chain, out, ctx, offsetX + el.x, offsetY + el.y);
        }
        return;
      }
      {
        const index = nextIndex(ctx, parentId);
        const id = shapeId(el.id);
        ctx.chainOf.set(el.id, chain);
        ctx.indexOf.set(id, index);
        out.push(emitFrame(el, parentId, index, offsetX, offsetY));
        const childChain = [...chain, id];
        for (const child of el.children) {
          emitElement(child, id, childChain, out, ctx);
        }
      }
      return;
    case "edge":
      ctx.edges.push(el);
      return;
    case "doc":
      // Nested <doc> is rejected at IR-lowering; defend in depth.
      throw new Error("emit: nested <doc> is not permitted");
  }
}

function emitBox(
  box: IRBoxPositioned,
  parentId: string,
  index: string,
  offsetX: number,
  offsetY: number,
): TLRecord {
  return boxShape({
    id: shapeId(box.id),
    parentId,
    index,
    x: box.x + offsetX,
    y: box.y + offsetY,
    w: box.w,
    h: box.h,
    ...(box.label === undefined ? {} : { text: box.label }),
    ...(box.color === undefined ? {} : { color: box.color }),
    ...(box.fill === undefined ? {} : { fill: box.fill }),
    ...(box.dash === undefined ? {} : { dash: box.dash }),
    ...(box.geo === undefined ? {} : { geo: box.geo }),
    ...(box.textAlign === undefined ? {} : { textAlign: box.textAlign }),
    ...(box.verticalAlign === undefined ? {} : { verticalAlign: box.verticalAlign }),
    ...(box.labelColor === undefined ? {} : { labelColor: box.labelColor }),
    ...(box.font === undefined ? {} : { font: box.font }),
    ...(box.size === undefined ? {} : { size: box.size }),
  });
}

/**
 * Borderless caption (`<Text>`): a real tldraw `text` shape, not a `geo`
 * rectangle. `box.w` is the wrap width layout already computed, so a `<Text>`
 * with no `w`/`maxW` still gets a bounded width. There is no `h` on the wire -
 * a text shape's height is derived from its wrapped content.
 */
function emitText(
  box: IRBoxPositioned,
  parentId: string,
  index: string,
  offsetX: number,
  offsetY: number,
): TLRecord {
  return textShape({
    id: shapeId(box.id),
    parentId,
    index,
    x: box.x + offsetX,
    y: box.y + offsetY,
    w: box.w,
    text: box.label ?? "",
    ...(box.color === undefined ? {} : { color: box.color }),
    ...(box.textAlign === undefined ? {} : { textAlign: box.textAlign }),
    ...(box.font === undefined ? {} : { font: box.font }),
    ...(box.size === undefined ? {} : { size: box.size }),
  });
}

/** Always a real tldraw sticky note; `w` is dropped because tldraw stickies are a fixed 200 wide. */
function emitNote(
  note: IRNotePositioned,
  parentId: string,
  index: string,
  offsetX: number,
  offsetY: number,
): TLRecord {
  return noteShape({
    id: shapeId(note.id),
    parentId,
    index,
    x: note.x + offsetX,
    y: note.y + offsetY,
    text: note.text,
    growY: Math.max(0, note.h - NOTE_SIZE),
    ...(note.color === undefined ? {} : { color: note.color }),
    ...(note.textAlign === undefined ? {} : { textAlign: note.textAlign }),
    ...(note.verticalAlign === undefined ? {} : { verticalAlign: note.verticalAlign }),
    ...(note.labelColor === undefined ? {} : { labelColor: note.labelColor }),
    ...(note.font === undefined ? {} : { font: note.font }),
    ...(note.size === undefined ? {} : { size: note.size }),
  });
}

function emitFrame(
  frame: IRFramePositioned,
  parentId: string,
  index: string,
  offsetX: number,
  offsetY: number,
): TLRecord {
  return frameShape({
    id: shapeId(frame.id),
    parentId,
    index,
    x: frame.x + offsetX,
    y: frame.y + offsetY,
    w: frame.w,
    h: frame.h,
    ...(frame.name === undefined ? {} : { name: frame.name }),
    ...(frame.color === undefined ? {} : { color: frame.color }),
  });
}

/**
 * Where an arrow belongs, mirroring tldraw's `ArrowBindingUtil.reparentArrow`.
 * `parentId` is the closest common ancestor of the two endpoints, walking up
 * chrome-drawing frames only. `index` must sit strictly above the higher-
 * indexed of the two nearest siblings and strictly below the next non-arrow
 * sibling above that; since non-arrow shapes are indexed in emit order with a
 * gap of 2, `slotAfter` always lands there. That also keeps `reparentArrow` on
 * its early-return path, so it never rewrites the arrow. Two arrows sharing a
 * highest sibling get the same index, which it tolerates - it checks bounds,
 * not uniqueness.
 */
function arrowPlacement(edge: IREdge, ctx: EmitContext): { parentId: string; index: string } {
  const pathFrom = [...(ctx.chainOf.get(edge.from) ?? []), shapeId(edge.from)];
  const pathTo = [...(ctx.chainOf.get(edge.to) ?? []), shapeId(edge.to)];

  let i = 0;
  while (i < pathFrom.length && i < pathTo.length && pathFrom[i] === pathTo[i]) i++;

  const parentId = i > 0 ? pathFrom[i - 1]! : PAGE_ID;
  // Nearest sibling of each endpoint under the common ancestor. The fallback
  // covers one endpoint being an ancestor of the other, which tldx source
  // cannot produce today.
  const siblingFrom = pathFrom[i] ?? pathFrom[pathFrom.length - 1]!;
  const siblingTo = pathTo[i] ?? pathTo[pathTo.length - 1]!;

  const indexFrom = ctx.indexOf.get(siblingFrom);
  const indexTo = ctx.indexOf.get(siblingTo);
  const highest =
    indexFrom !== undefined && indexTo !== undefined
      ? indexFrom > indexTo
        ? indexFrom
        : indexTo
      : (indexFrom ?? indexTo);

  if (highest === undefined) {
    // Defensive: lower validates edge.from/to against addressable elements,
    // so every sibling should already have an index by the time edges run.
    return { parentId, index: indexAt(1) };
  }
  return { parentId, index: slotAfter(highest) };
}

// `isExact` skips tldraw's arc-vs-outline clipping, which is unstable when the
// anchor already sits on the outline and can trim a bowed arrow to a 10px stub.
function emitEdge(
  edge: IREdge,
  out: TLRecord[],
  route: EdgeRoute | undefined,
  ctx: EmitContext,
): void {
  const arrowId = shapeId(edge.id);
  const { parentId, index } = arrowPlacement(edge, ctx);
  out.push(
    arrowShape({
      id: arrowId,
      parentId,
      index,
      x: 0,
      y: 0,
      bend: route?.bend ?? 0,
      ...(edge.color === undefined ? {} : { color: edge.color }),
      ...(edge.dash === undefined ? {} : { dash: edge.dash }),
      ...(edge.arrowheadStart === undefined ? {} : { arrowheadStart: edge.arrowheadStart }),
      ...(edge.arrowheadEnd === undefined ? {} : { arrowheadEnd: edge.arrowheadEnd }),
      ...(edge.label === undefined ? {} : { text: edge.label }),
      ...(edge.labelColor === undefined ? {} : { labelColor: edge.labelColor }),
      ...(edge.font === undefined ? {} : { font: edge.font }),
      ...(edge.size === undefined ? {} : { size: edge.size }),
      ...(route?.labelPosition === undefined ? {} : { labelPosition: route.labelPosition }),
    }),
  );
  out.push(
    arrowBinding({
      id: `binding:${edge.id}-start`,
      arrowId,
      shapeId: shapeId(edge.from),
      terminal: "start",
      ...(route?.startAnchor === undefined
        ? {}
        : { normalizedAnchor: route.startAnchor, isPrecise: true, isExact: true }),
    }),
  );
  out.push(
    arrowBinding({
      id: `binding:${edge.id}-end`,
      arrowId,
      shapeId: shapeId(edge.to),
      terminal: "end",
      ...(route?.endAnchor === undefined
        ? {}
        : { normalizedAnchor: route.endAnchor, isPrecise: true, isExact: true }),
    }),
  );
}

function shapeId(irId: string): string {
  return `shape:${irId}`;
}
