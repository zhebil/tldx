/**
 * IR-with-positions -> occlusion diagnostics. Scene-JSON-computable checks
 * only: geometry and glyph metrics already available at layout time, no
 * browser. Everything here is a warning, since a deliberate overlap must still
 * compile. `tools/layout-report.mts` shares `walkShapes`/`isAncestor`/
 * `overlapArea` so the report and `check` agree.
 */

import { warning } from "../diagnostics/index.js";
import type { Diagnostic, SourceSpan } from "../diagnostics/index.js";
import type {
  IRAnchor,
  IRBoxPositioned,
  IRDocPositioned,
  IREdge,
  IRElementPositioned,
} from "../ir/index.js";

import { labelOverflow } from "./defaults.js";
import { computeEdgeRoutes } from "./routing.js";
import type { LabelBox } from "./routing.js";

export type ShapeKind = "frame" | "box" | "note";

export type AbsShape = {
  id: string;
  kind: ShapeKind;
  label: string;
  parentId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ancestorFrameIds: string[];
  span?: SourceSpan;
};

/** Walks positioned IR into absolute-coordinate shapes (frames, boxes, notes). */
export function walkShapes(doc: IRDocPositioned): AbsShape[] {
  const shapes: AbsShape[] = [];

  function visit(
    parentId: string,
    children: IRElementPositioned[],
    offX: number,
    offY: number,
    ancestorFrameIds: string[],
  ): void {
    for (const child of children) {
      if (child.kind === "edge" || child.kind === "doc") continue;
      const absX = offX + child.x;
      const absY = offY + child.y;
      if (child.kind === "frame") {
        shapes.push({
          id: child.id,
          kind: "frame",
          label: child.name ?? child.id,
          parentId,
          x: absX,
          y: absY,
          w: child.w,
          h: child.h,
          ancestorFrameIds,
          span: child.span,
        });
        visit(child.id, child.children, absX, absY, [...ancestorFrameIds, child.id]);
      } else if (child.kind === "box") {
        shapes.push({
          id: child.id,
          kind: "box",
          label: child.label ?? child.id,
          parentId,
          x: absX,
          y: absY,
          w: child.w,
          h: child.h,
          ancestorFrameIds,
          span: child.span,
        });
      } else {
        shapes.push({
          id: child.id,
          kind: "note",
          label: child.text,
          parentId,
          x: absX,
          y: absY,
          w: child.w,
          h: child.h,
          ancestorFrameIds,
          span: child.span,
        });
      }
    }
  }

  visit(doc.id, doc.children, 0, 0, []);
  return shapes;
}

/**
 * One end of an edge, resolved to page coordinates. `side` names the face of
 * the shape the arrow leaves or arrives at, which is the part a human reasons
 * about - a raw `normalizedAnchor` fraction is not.
 */
export type AbsTerminal = { side: string; x: number; y: number };

export type AbsEdge = {
  id: string;
  from: string;
  to: string;
  /**
   * Absent where the router left the terminal unbound: tldraw then aims at the
   * shape's centre and clips the arrow at its outline, so there is no anchor
   * to report.
   */
  start?: AbsTerminal;
  end?: AbsTerminal;
  bend: number;
  label?: string;
  labelBox?: LabelBox;
};

/** `{x:0.5,y:0}` -> `top`, `{x:1,y:1}` -> `bottom-right` - `lower.ts`'s `ANCHOR_SIDES` read backwards. */
function sideOf(a: IRAnchor): string {
  const vertical = a.y <= 0 ? "top" : a.y >= 1 ? "bottom" : "";
  const horizontal = a.x <= 0 ? "left" : a.x >= 1 ? "right" : "";
  const named = [vertical, horizontal].filter((s) => s !== "").join("-");
  if (named !== "") return named;
  return a.x === 0.5 && a.y === 0.5 ? "center" : "inside";
}

function resolveTerminal(
  shape: AbsShape | undefined,
  a: IRAnchor | undefined,
): AbsTerminal | undefined {
  if (shape === undefined || a === undefined) return undefined;
  return { side: sideOf(a), x: shape.x + a.x * shape.w, y: shape.y + a.y * shape.h };
}

/**
 * Walks positioned IR into what the router decided about each edge, in page
 * coordinates - the arrow-shaped counterpart to `walkShapes`. `measure` prints
 * it; the numbers are the same ones emit hands tldraw.
 */
export function walkEdges(doc: IRDocPositioned): AbsEdge[] {
  const byId = new Map(walkShapes(doc).map((s) => [s.id, s]));
  const routes = computeEdgeRoutes(doc);
  return collectEdges(doc).map((edge) => {
    const route = routes.get(edge.id);
    const start = resolveTerminal(byId.get(edge.from), route?.startAnchor);
    const end = resolveTerminal(byId.get(edge.to), route?.endAnchor);
    return {
      id: edge.id,
      from: edge.from,
      to: edge.to,
      bend: route?.bend ?? 0,
      ...(start === undefined ? {} : { start }),
      ...(end === undefined ? {} : { end }),
      ...(edge.label === undefined ? {} : { label: edge.label }),
      ...(route?.labelBox === undefined ? {} : { labelBox: route.labelBox }),
    };
  });
}

/** True if either shape is a frame ancestor of the other - containment, not occlusion. */
export function isAncestor(a: AbsShape, b: AbsShape): boolean {
  return b.ancestorFrameIds.includes(a.id) || a.ancestorFrameIds.includes(b.id);
}

export function overlapArea(a: AbsShape, b: AbsShape): number {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function collectEdges(doc: IRDocPositioned): IREdge[] {
  const edges: IREdge[] = [];
  function visit(children: IRElementPositioned[]): void {
    for (const child of children) {
      if (child.kind === "edge") edges.push(child);
      else if (child.kind === "frame") visit(child.children);
    }
  }
  visit(doc.children);
  return edges;
}

function shapeOverlapDiagnostics(shapes: AbsShape[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i]!;
      const b = shapes[j]!;
      if (isAncestor(a, b)) continue;
      if (overlapArea(a, b) <= 0) continue;
      diagnostics.push(
        warning(
          "layout/shape-overlap",
          `"${a.label}" (${a.id}) covers "${b.label}" (${b.id})`,
          a.span,
        ),
      );
    }
  }
  return diagnostics;
}

function labelOverlapDiagnostics(doc: IRDocPositioned, shapes: AbsShape[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const blockers = shapes.filter((s) => s.kind !== "frame");
  const routes = computeEdgeRoutes(doc);

  for (const edge of collectEdges(doc)) {
    if (!edge.label) continue;
    const labelBox: LabelBox | undefined = routes.get(edge.id)?.labelBox;
    if (!labelBox) continue;
    for (const s of blockers) {
      if (s.id === edge.from || s.id === edge.to) continue;
      if (!rectsOverlap(labelBox, s)) continue;
      diagnostics.push(
        warning(
          "layout/label-overlap",
          `label "${edge.label}" on ${edge.from} -> ${edge.to} covers "${s.label}" (${s.id})`,
          edge.span,
        ),
      );
    }
  }
  return diagnostics;
}

function collectBoxes(doc: IRDocPositioned): IRBoxPositioned[] {
  const boxes: IRBoxPositioned[] = [];
  function visit(children: IRElementPositioned[]): void {
    for (const child of children) {
      if (child.kind === "frame") visit(child.children);
      else if (child.kind === "box") boxes.push(child);
    }
  }
  visit(doc.children);
  return boxes;
}

/**
 * A box's label clips silently when something other than the sizing pass
 * decided the box's final size (an explicit `w`/`h`, a container's shared-size
 * vote). `labelOverflow` is `estimatedBoxSize`'s containment math run in
 * reverse, against a box that already has a size.
 */
function labelOverflowDiagnostics(boxes: readonly IRBoxPositioned[]): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  for (const box of boxes) {
    if (!box.label) continue;
    const overflow = labelOverflow(box.label, box.w, box.h, box);
    if (!overflow) continue;
    diagnostics.push(
      warning(
        "layout/label-overflow",
        `"${box.label}" (${box.id}) does not fit its box - needs ${overflow.neededW}x${overflow.neededH}px, box is ${box.w}x${box.h}px`,
        box.span,
      ),
    );
  }
  return diagnostics;
}

export function computeOcclusionDiagnostics(doc: IRDocPositioned): Diagnostic[] {
  const shapes = walkShapes(doc);
  const boxes = collectBoxes(doc);
  return [
    ...shapeOverlapDiagnostics(shapes),
    ...labelOverlapDiagnostics(doc, shapes),
    ...labelOverflowDiagnostics(boxes),
  ];
}
