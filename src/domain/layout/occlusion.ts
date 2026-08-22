/**
 * IR-with-positions -> occlusion diagnostics. Scene-JSON-computable checks
 * only (geometry + glyph metrics already available at layout time - no
 * browser). See `docs/diagram-defects.md` D15: `check` validated the IR and
 * said nothing about the picture, so a `<Note>` could cover three of four
 * topics and `check` stayed silent.
 *
 * Two checks, both warnings (a deliberate overlap must still compile):
 * - a shape's rect covers another shape's rect, neither containing the other.
 * - a labelled edge's placed label rect (`routing.ts`'s `EdgeRoute.labelBox`,
 *   the same geometry `emit` uses) covers a shape the edge doesn't connect to.
 *
 * `walkShapes`/`isAncestor`/`overlapArea` are the geometry `tools/layout-report.mts`
 * already used to compute "overlapping shape pairs" - moved here so `check`
 * and the report share one implementation instead of two.
 */

import { warning } from "../diagnostics/index.js";
import type { Diagnostic, SourceSpan } from "../diagnostics/index.js";
import type { IRDocPositioned, IREdge, IRElementPositioned } from "../ir/index.js";

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

export function computeOcclusionDiagnostics(doc: IRDocPositioned): Diagnostic[] {
  const shapes = walkShapes(doc);
  return [...shapeOverlapDiagnostics(shapes), ...labelOverlapDiagnostics(doc, shapes)];
}
