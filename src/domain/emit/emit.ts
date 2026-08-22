/**
 * IR-with-positions → tldraw scene JSON.
 *
 * Pure function that the compileFile / watchAndServe use cases call after
 * layout. Composes over `src/contracts/builders.ts`; never hand-rolls record
 * JSON. The wire shape (and the tldraw pin behind it) is documented in
 * `docs/scene-json.md`.
 *
 * MVP behavior:
 * - One `document` record + one `page:main` record per scene.
 * - Visual elements (`box`, `note`, `frame`) become tldraw shapes whose ids
 *   are `shape:<irId>`. Their `parentId` follows the IR tree: top-level
 *   shapes parent to `page:main`, frame children parent to the frame's
 *   shape id. Shape `x | y` is whatever layout produced (frame-relative when
 *   nested), preserved verbatim.
 * - `<Note>` (non-sticky) emits as a `geo` rectangle sized like a box (IR
 *   `w`/`h` pass through verbatim), warm-filled by default (`color: "yellow",
 *   fill: "semi"`, overridden by IR `note.color` when set) to read as an
 *   annotation. `<Sticky>` (`note.sticky`) keeps the old path: drops IR `w`
 *   (tldraw stickies are always 200 wide) and keeps `h` as `growY` above
 *   tldraw's 200 base height; `note.color` passes through the same way.
 * - `box`/`frame`/`note`/`edge` also pass through the raw tldraw style props
 *   IR carries (`color`, `fill`, `dash`, `geo` (`box` only), `arrowheadStart`, `arrowheadEnd`,
 *   and on `box`/`note`/`edge` also `labelColor`, `font`, `size`, and on
 *   `box`/`note` also `textAlign`, `verticalAlign` - see `domain/ir/styles.ts`)
 *   verbatim onto the shape when present; `font`/`size` already fed sizing at
 *   layout time on `box`/`note` (`glyph-metrics.ts`), and on `edge` drive
 *   tldraw's own arrow stroke/label sizing directly - this is just the
 *   wire-format echo.
 * - Edges become an `arrow` shape (`x: 0, y: 0`) plus two `binding` records
 *   anchoring start/end to the referenced shapes with default-center attach.
 *   The arrow is parented to the common ancestor of its two endpoints (the
 *   page, or the nearest enclosing named `<Frame>` both endpoints share) -
 *   matching what tldraw's own `ArrowBindingUtil.reparentArrow` would parent
 *   it to on first touch, so it never rewrites `parentId` under us (R1). The
 *   13-anchor scheme is phase 1. A same-axis skip edge (see
 *   `domain/layout/routing.ts`) gets a non-zero `bend` so it bows around the
 *   shapes between its endpoints instead of drawing through them.
 *   `edge.label` becomes the arrow's `text` prop (empty string when absent).
 * - Synthetic-id elements (notes / edges that didn't author an `id`) inherit
 *   IR's content-hash ids (ADR-12), so emit is deterministic across reorder.
 * - Every shape gets a real `index`: non-arrow shapes get one per parent, in
 *   emit order, with a gap (`a1`, `a3`, `a5`, ...); each arrow gets the slot
 *   right above its higher-indexed endpoint sibling (`a4` between `a3`/`a5`).
 *   See the comment above `arrowPlacement` for why this satisfies tldraw's
 *   `reparentArrow` and never gets rewritten (R1, `docs/round-trip-scope.md`
 *   §7).
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
 * The digit alphabet tldraw's own fractional-index generator uses for a
 * single-character index slot (`fractional-indexing-jittered`'s
 * `base62CharSet`: `0-9A-Za-z`, ascending). Copied as a literal, not
 * imported - domain/contracts cannot depend on tldraw's runtime (see the
 * note on `richText` in `contracts/builders.ts`). We only need the ordering
 * guarantee it gives: fixed-length strings built from this alphabet compare
 * correctly with plain `<`/`>`, which is all `ArrowBindingUtil.reparentArrow`
 * ever does with `.index`.
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

export function emit(ir: IRDocPositioned): SceneJSON {
  const records: TLRecord[] = [
    documentRecord(),
    pageRecord({ id: PAGE_ID }),
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
 * `offsetX`/`offsetY` fold in the origin of any enclosing chrome-free-frame
 * ancestors between this element and its emitted parent - a chrome-free
 * frame draws no frame shape, so its children must carry its position into
 * their own coords. `chain` is the same idea for ancestry: it only grows at
 * a chrome-drawing frame (the ones that actually get a shape id an arrow
 * could be parented to).
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
      out.push(emitBox(el, parentId, index, offsetX, offsetY));
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

function emitNote(
  note: IRNotePositioned,
  parentId: string,
  index: string,
  offsetX: number,
  offsetY: number,
): TLRecord {
  if (note.sticky) {
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
  return boxShape({
    id: shapeId(note.id),
    parentId,
    index,
    x: note.x + offsetX,
    y: note.y + offsetY,
    w: note.w,
    h: note.h,
    text: note.text,
    color: note.color ?? "yellow",
    fill: "semi",
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
 * Where an arrow belongs, mirroring `ArrowBindingUtil.reparentArrow`
 * (`node_modules/tldraw/src/lib/bindings/arrow/ArrowBindingUtil.ts`):
 *
 * - `parentId` is the closest common ancestor of the two endpoints (walking
 *   up through chrome-drawing frames only - a chrome-free frame never gets a
 *   shape id, so it's never anyone's parent on the wire).
 * - `index` must sit strictly above the higher-indexed of the two "nearest
 *   siblings" (the endpoint itself, or the ancestor frame that sits directly
 *   under the common ancestor on the way down to it) and strictly below the
 *   next non-arrow sibling above that. Because non-arrow shapes are indexed
 *   in emit order with a gap of 2 (`a1`, `a3`, `a5`, ...), the slot
 *   immediately above a sibling's index (`slotAfter`) always lands there:
 *   nothing else occupies it, and the next non-arrow shape at that parent
 *   (if any) got the next odd slot up.
 *
 * `reparentArrow`'s early-return check only runs once the arrow already has
 * a higher index than its highest-bound sibling (otherwise it takes the
 * unconditional `getIndexAbove` branch and always rewrites) - `slotAfter`
 * guarantees that. Two arrows sharing a highest sibling get the same index;
 * `reparentArrow` checks bounds, not uniqueness, so that's fine.
 */
function arrowPlacement(edge: IREdge, ctx: EmitContext): { parentId: string; index: string } {
  const pathFrom = [...(ctx.chainOf.get(edge.from) ?? []), shapeId(edge.from)];
  const pathTo = [...(ctx.chainOf.get(edge.to) ?? []), shapeId(edge.to)];

  let i = 0;
  while (i < pathFrom.length && i < pathTo.length && pathFrom[i] === pathTo[i]) i++;

  const parentId = i > 0 ? pathFrom[i - 1]! : PAGE_ID;
  // Nearest sibling of each endpoint under the common ancestor. Falls back
  // to the endpoint's own shape id in the rare case one endpoint is an
  // ancestor of the other (an edge into a frame it also lives inside) -
  // `reparentArrow` special-cases that (no sibling at all) in a way not
  // worth replicating for a shape that can't occur from tldsl source today.
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
function emitEdge(edge: IREdge, out: TLRecord[], route: EdgeRoute | undefined, ctx: EmitContext): void {
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
      ...(route?.startAnchor === undefined ? {} : { normalizedAnchor: route.startAnchor, isPrecise: true, isExact: true }),
    }),
  );
  out.push(
    arrowBinding({
      id: `binding:${edge.id}-end`,
      arrowId,
      shapeId: shapeId(edge.to),
      terminal: "end",
      ...(route?.endAnchor === undefined ? {} : { normalizedAnchor: route.endAnchor, isPrecise: true, isExact: true }),
    }),
  );
}

function shapeId(irId: string): string {
  return `shape:${irId}`;
}
