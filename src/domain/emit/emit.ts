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
 * - Notes drop their IR `w` (tldraw stickies are always 200 wide) but keep
 *   `h` as `growY` above tldraw's 200 base height, so the drawn note is as
 *   tall as layout reserved.
 * - Edges become an `arrow` shape (`x: 0, y: 0`, parented to the page) plus
 *   two `binding` records anchoring start/end to the referenced shapes with
 *   default-center attach. The 13-anchor scheme is phase 1.
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
import type {
  IRBoxPositioned,
  IRDocPositioned,
  IREdge,
  IRElementPositioned,
  IRFramePositioned,
  IRNotePositioned,
} from "../ir/index.js";

const PAGE_ID = "page:main";

type Rect = { x: number; y: number; w: number; h: number };

export function emit(ir: IRDocPositioned): SceneJSON {
  const records: TLRecord[] = [
    documentRecord(),
    pageRecord({ id: PAGE_ID }),
  ];

  const rects = new Map<string, Rect>();
  collectRects(ir.children, 0, 0, rects);

  const ancestors = new Map<string, string[]>();
  collectAncestors(ir.children, [ir.id], ancestors);
  const allEdges: IREdge[] = [];
  collectEdgesDeep(ir.children, allEdges);
  const elbowDecisions = computeElbowDecisions(allEdges, ancestors, ir.id);

  for (const child of ir.children) {
    emitElement(child, PAGE_ID, rects, elbowDecisions, records);
  }

  return sceneJson(records);
}

/**
 * Ancestor container-id chain (root first) for every box/note/frame, keyed
 * by IR id. The doc root itself counts as a container, so every chain
 * starts with `docId`.
 */
function collectAncestors(
  children: IRElementPositioned[],
  chain: string[],
  ancestors: Map<string, string[]>,
): void {
  for (const el of children) {
    switch (el.kind) {
      case "box":
      case "note":
        ancestors.set(el.id, chain);
        break;
      case "frame":
        ancestors.set(el.id, chain);
        collectAncestors(el.children, [...chain, el.id], ancestors);
        break;
      case "edge":
      case "doc":
        break;
    }
  }
}

function collectEdgesDeep(children: IRElementPositioned[], out: IREdge[]): void {
  for (const el of children) {
    if (el.kind === "edge") {
      out.push(el);
    } else if (el.kind === "frame") {
      collectEdgesDeep(el.children, out);
    }
  }
}

/**
 * Per-edge elbow/arc decision (B27, docs/ralph-plan.md). An edge's owning
 * container is the deepest container common to both endpoints' ancestor
 * chains; each endpoint's representative there is the next id down its own
 * chain (or the endpoint itself when its chain ends at the owner). Edges
 * are grouped by owning container and deduped to distinct (fromRep, toRep)
 * pairs - parallel edges between the same two representatives count once.
 * A container is fan-shaped iff some representative's deduped out-degree
 * exceeds 3; edges owned by a fan-shaped container fall back to arc + centre
 * anchors, exactly as before this hypothesis.
 */
function computeElbowDecisions(
  edges: readonly IREdge[],
  ancestors: Map<string, string[]>,
  docId: string,
): Map<string, boolean> {
  const owners = new Map<string, { ownerContainer: string; fromRep: string; toRep: string }>();
  for (const edge of edges) {
    const chainFrom = ancestors.get(edge.from) ?? [docId];
    const chainTo = ancestors.get(edge.to) ?? [docId];
    let i = 0;
    while (i < chainFrom.length && i < chainTo.length && chainFrom[i] === chainTo[i]) i++;
    const ownerContainer = chainFrom[i - 1] ?? docId;
    const fromRep = i < chainFrom.length ? chainFrom[i]! : edge.from;
    const toRep = i < chainTo.length ? chainTo[i]! : edge.to;
    owners.set(edge.id, { ownerContainer, fromRep, toRep });
  }

  const pairsByContainer = new Map<string, Set<string>>();
  for (const { ownerContainer, fromRep, toRep } of owners.values()) {
    if (fromRep === toRep) continue;
    let pairs = pairsByContainer.get(ownerContainer);
    if (!pairs) {
      pairs = new Set();
      pairsByContainer.set(ownerContainer, pairs);
    }
    pairs.add(`${fromRep} ${toRep}`);
  }

  const fanContainers = new Set<string>();
  for (const [container, pairs] of pairsByContainer) {
    const outDegree = new Map<string, number>();
    for (const pair of pairs) {
      const from = pair.slice(0, pair.indexOf(" "));
      outDegree.set(from, (outDegree.get(from) ?? 0) + 1);
    }
    if ([...outDegree.values()].some((deg) => deg > 3)) fanContainers.add(container);
  }

  const decisions = new Map<string, boolean>();
  for (const edge of edges) {
    const owner = owners.get(edge.id)!;
    decisions.set(edge.id, !fanContainers.has(owner.ownerContainer));
  }
  return decisions;
}

/**
 * Absolute page-space rects for every box/note/frame, keyed by IR id. IR
 * x/y are frame-relative under a frame, so the frame's own absolute origin
 * accumulates as the walk descends into its children.
 */
function collectRects(
  children: IRElementPositioned[],
  originX: number,
  originY: number,
  rects: Map<string, Rect>,
): void {
  for (const el of children) {
    switch (el.kind) {
      case "box":
      case "note":
        rects.set(el.id, {
          x: originX + el.x,
          y: originY + el.y,
          w: el.w,
          h: el.h,
        });
        break;
      case "frame": {
        const rect = { x: originX + el.x, y: originY + el.y, w: el.w, h: el.h };
        rects.set(el.id, rect);
        collectRects(el.children, rect.x, rect.y, rects);
        break;
      }
      case "edge":
      case "doc":
        break;
    }
  }
}

function emitElement(
  el: IRElementPositioned,
  parentId: string,
  rects: Map<string, Rect>,
  elbowDecisions: Map<string, boolean>,
  out: TLRecord[],
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
        emitElement(child, shapeId(el.id), rects, elbowDecisions, out);
      }
      return;
    case "edge":
      emitEdge(el, rects, elbowDecisions, out);
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
  });
}

function emitNote(note: IRNotePositioned, parentId: string): TLRecord {
  return noteShape({
    id: shapeId(note.id),
    parentId,
    x: note.x,
    y: note.y,
    text: note.text,
    growY: Math.max(0, note.h - NOTE_SIZE),
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
  });
}

const CENTER_ANCHOR = { x: 0.5, y: 0.5 };
const SIDE_ANCHORS = {
  left: { x: 0, y: 0.5 },
  right: { x: 1, y: 0.5 },
  top: { x: 0.5, y: 0 },
  bottom: { x: 0.5, y: 1 },
} as const;

function centerOf(rect: Rect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/**
 * Which side of a rect a centre-to-centre ray exits through, given the
 * ray's delta and that rect's own w/h. Null means "no side can be picked"
 * (zero-size rect, or coincident centres) - caller falls back to centre.
 */
function sideAnchor(
  dx: number,
  dy: number,
  w: number,
  h: number,
): { x: number; y: number } | null {
  if (w === 0 || h === 0) return null;
  if (dx === 0 && dy === 0) return null;
  const ratioW = Math.abs(dx) / w;
  const ratioH = Math.abs(dy) / h;
  const side =
    ratioW >= ratioH
      ? dx > 0
        ? "right"
        : "left"
      : dy > 0
        ? "bottom"
        : "top";
  return SIDE_ANCHORS[side];
}

function emitEdge(
  edge: IREdge,
  rects: Map<string, Rect>,
  elbowDecisions: Map<string, boolean>,
  out: TLRecord[],
): void {
  const isElbow = elbowDecisions.get(edge.id) ?? false;
  const arrowId = shapeId(edge.id);
  out.push(
    arrowShape({ id: arrowId, parentId: PAGE_ID, x: 0, y: 0, kind: isElbow ? "elbow" : "arc" }),
  );

  let startAnchor: { x: number; y: number } = CENTER_ANCHOR;
  let startPrecise = false;
  let endAnchor: { x: number; y: number } = CENTER_ANCHOR;
  let endPrecise = false;

  const sourceRect = isElbow ? rects.get(edge.from) : undefined;
  const targetRect = isElbow ? rects.get(edge.to) : undefined;
  if (sourceRect && targetRect) {
    const sourceCenter = centerOf(sourceRect);
    const targetCenter = centerOf(targetRect);
    const dx = targetCenter.x - sourceCenter.x;
    const dy = targetCenter.y - sourceCenter.y;

    const start = sideAnchor(dx, dy, sourceRect.w, sourceRect.h);
    if (start) {
      startAnchor = start;
      startPrecise = true;
    }

    // Target terminal faces back toward the source, so the ray is reversed.
    const end = sideAnchor(-dx, -dy, targetRect.w, targetRect.h);
    if (end) {
      endAnchor = end;
      endPrecise = true;
    }
  }

  out.push(
    arrowBinding({
      id: `binding:${edge.id}-start`,
      arrowId,
      shapeId: shapeId(edge.from),
      terminal: "start",
      normalizedAnchor: startAnchor,
      isPrecise: startPrecise,
    }),
  );
  out.push(
    arrowBinding({
      id: `binding:${edge.id}-end`,
      arrowId,
      shapeId: shapeId(edge.to),
      terminal: "end",
      normalizedAnchor: endAnchor,
      isPrecise: endPrecise,
    }),
  );
}

function shapeId(irId: string): string {
  return `shape:${irId}`;
}
