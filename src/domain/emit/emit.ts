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
 *   IR carries (`color`, `fill`, `dash`, `arrowheadStart`, `arrowheadEnd`,
 *   and on `box`/`note` also `textAlign`, `verticalAlign`, `labelColor`,
 *   `font`, `size` - see `domain/ir/styles.ts`) verbatim onto the shape when
 *   present; `font`/`size` already fed sizing at layout time (`glyph-metrics.ts`),
 *   this is just the wire-format echo.
 * - Edges become an `arrow` shape (`x: 0, y: 0`, parented to the page) plus
 *   two `binding` records anchoring start/end to the referenced shapes with
 *   default-center attach. The 13-anchor scheme is phase 1. A same-axis skip
 *   edge (see `domain/layout/routing.ts`) gets a non-zero `bend` so it bows
 *   around the shapes between its endpoints instead of drawing through them.
 * - Synthetic-id elements (notes / edges that didn't author an `id`) inherit
 *   IR's content-hash ids (ADR-12), so emit is deterministic across reorder.
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
import type {
  IRBoxPositioned,
  IRDocPositioned,
  IREdge,
  IRElementPositioned,
  IRFramePositioned,
  IRNotePositioned,
} from "../ir/index.js";

const PAGE_ID = "page:main";

export function emit(ir: IRDocPositioned): SceneJSON {
  const records: TLRecord[] = [
    documentRecord(),
    pageRecord({ id: PAGE_ID }),
  ];
  const routes = computeEdgeRoutes(ir);

  for (const child of ir.children) {
    emitElement(child, PAGE_ID, records, routes);
  }

  return sceneJson(records);
}

function emitElement(
  el: IRElementPositioned,
  parentId: string,
  out: TLRecord[],
  routes: Map<string, EdgeRoute>,
): void {
  switch (el.kind) {
    case "box":
      out.push(emitBox(el, parentId));
      return;
    case "note":
      out.push(emitNote(el, parentId));
      return;
    case "frame":
      out.push(emitFrame(el, parentId));
      for (const child of el.children) {
        emitElement(child, shapeId(el.id), out, routes);
      }
      return;
    case "edge":
      emitEdge(el, out, routes.get(el.id));
      return;
    case "doc":
      // Nested <doc> is rejected at IR-lowering; defend in depth.
      throw new Error("emit: nested <doc> is not permitted");
  }
}

function emitBox(box: IRBoxPositioned, parentId: string): TLRecord {
  return boxShape({
    id: shapeId(box.id),
    parentId,
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    ...(box.label === undefined ? {} : { text: box.label }),
    ...(box.color === undefined ? {} : { color: box.color }),
    ...(box.fill === undefined ? {} : { fill: box.fill }),
    ...(box.dash === undefined ? {} : { dash: box.dash }),
    ...(box.textAlign === undefined ? {} : { textAlign: box.textAlign }),
    ...(box.verticalAlign === undefined ? {} : { verticalAlign: box.verticalAlign }),
    ...(box.labelColor === undefined ? {} : { labelColor: box.labelColor }),
    ...(box.font === undefined ? {} : { font: box.font }),
    ...(box.size === undefined ? {} : { size: box.size }),
  });
}

function emitNote(note: IRNotePositioned, parentId: string): TLRecord {
  if (note.sticky) {
    return noteShape({
      id: shapeId(note.id),
      parentId,
      x: note.x,
      y: note.y,
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
    x: note.x,
    y: note.y,
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

function emitFrame(frame: IRFramePositioned, parentId: string): TLRecord {
  return frameShape({
    id: shapeId(frame.id),
    parentId,
    x: frame.x,
    y: frame.y,
    w: frame.w,
    h: frame.h,
    ...(frame.name === undefined ? {} : { name: frame.name }),
    ...(frame.color === undefined ? {} : { color: frame.color }),
  });
}

// `isExact` skips tldraw's arc-vs-outline clipping, which is unstable when the
// anchor already sits on the outline and can trim a bowed arrow to a 10px stub.
function emitEdge(edge: IREdge, out: TLRecord[], route: EdgeRoute | undefined): void {
  const arrowId = shapeId(edge.id);
  out.push(
    arrowShape({
      id: arrowId,
      parentId: PAGE_ID,
      x: 0,
      y: 0,
      bend: route?.bend ?? 0,
      ...(edge.color === undefined ? {} : { color: edge.color }),
      ...(edge.dash === undefined ? {} : { dash: edge.dash }),
      ...(edge.arrowheadStart === undefined ? {} : { arrowheadStart: edge.arrowheadStart }),
      ...(edge.arrowheadEnd === undefined ? {} : { arrowheadEnd: edge.arrowheadEnd }),
    }),
  );
  out.push(
    arrowBinding({
      id: `binding:${edge.id}-start`,
      arrowId,
      shapeId: shapeId(edge.from),
      terminal: "start",
      ...(route === undefined ? {} : { normalizedAnchor: route.startAnchor, isPrecise: true, isExact: true }),
    }),
  );
  out.push(
    arrowBinding({
      id: `binding:${edge.id}-end`,
      arrowId,
      shapeId: shapeId(edge.to),
      terminal: "end",
      ...(route === undefined ? {} : { normalizedAnchor: route.endAnchor, isPrecise: true, isExact: true }),
    }),
  );
}

function shapeId(irId: string): string {
  return `shape:${irId}`;
}
