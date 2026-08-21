/**
 * IR-with-positions -> per-edge tldraw arrow route (bend + terminal anchors).
 *
 * `arrowShape` draws a straight chord by default (`bend: 0`) between shape
 * centres, which passes straight through any box/note sitting between an
 * edge's endpoints on the same layout axis (a "same-axis skip" edge - see
 * `docs/plan.md` T3/T4). This module computes, for each such edge, a route:
 * a non-zero `bend` that bows the arrow around the shapes it would otherwise
 * cross, plus a `normalizedAnchor` on each terminal that moves the exit/entry
 * point to the side of the shape perpendicular to the layout axis (top/bottom
 * for a row, left/right for a column) so the arrow doesn't cut back through
 * the neighbouring box before it starts bowing. Edges with no intervening
 * shapes (or where no side has room to bow) stay straight with centre
 * anchors, which callers signal by simply not having an entry in the
 * returned map.
 */

import type { IRDocPositioned, IREdge, IRElementPositioned } from "../ir/index.js";

/** tldraw's own MIN_ARROW_BEND: anything smaller renders as a straight line, so round down to 0. */
const MIN_BEND = 8;
const CLEAR_MARGIN = 12;

type ShapeKind = "frame" | "box" | "note";

type AbsShape = {
  id: string;
  kind: ShapeKind;
  parentId: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type Axis = "horizontal" | "vertical";
type Side = "neg" | "pos";
type Point = { x: number; y: number };

export type EdgeRoute = { bend: number; startAnchor: Point; endAnchor: Point };

export function computeEdgeRoutes(ir: IRDocPositioned): Map<string, EdgeRoute> {
  const { shapes, edges } = collect(ir);
  const byId = new Map(shapes.map((s) => [s.id, s]));

  const routes = new Map<string, EdgeRoute>();
  for (const edge of edges) {
    const route = computeRoute(edge, byId, shapes);
    if (route !== null) routes.set(edge.id, route);
  }
  return routes;
}

function collect(ir: IRDocPositioned): { shapes: AbsShape[]; edges: IREdge[] } {
  const shapes: AbsShape[] = [];
  const edges: IREdge[] = [];

  function visit(parentId: string, children: IRElementPositioned[], offX: number, offY: number): void {
    for (const child of children) {
      if (child.kind === "edge") {
        edges.push(child);
        continue;
      }
      if (child.kind === "doc") continue;
      const absX = offX + child.x;
      const absY = offY + child.y;
      shapes.push({ id: child.id, kind: child.kind, parentId, x: absX, y: absY, w: child.w, h: child.h });
      if (child.kind === "frame") {
        visit(child.id, child.children, absX, absY);
      }
    }
  }

  visit(ir.id, ir.children, 0, 0);
  return { shapes, edges };
}

function computeRoute(edge: IREdge, byId: Map<string, AbsShape>, allShapes: AbsShape[]): EdgeRoute | null {
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  if (!from || !to) return null;
  if (from.parentId !== to.parentId) return null;

  const axis = deriveAxis(from, to);
  if (axis === null) return null;

  const crossed = allShapes.filter(
    (s) =>
      s.parentId === from.parentId &&
      s.id !== from.id &&
      s.id !== to.id &&
      (s.kind === "box" || s.kind === "note") &&
      isCrossing(axis, from, to, s),
  );
  if (crossed.length === 0) return null;

  const axisFrom = axisCentre(axis, from);
  const axisTo = axisCentre(axis, to);

  const requiredSag = (side: Side): number => {
    const perpFrom = anchorPerp(axis, side, from);
    const perpTo = anchorPerp(axis, side, to);
    let maxSag = 0;
    for (const c of crossed) {
      const rawT = (axisCentre(axis, c) - axisFrom) / (axisTo - axisFrom);
      const t = Math.min(1 - 1e-6, Math.max(1e-6, rawT));
      const f = 4 * t * (1 - t);
      const chordPerp = perpFrom + t * (perpTo - perpFrom);
      const need =
        side === "pos"
          ? perpMax(axis, c) + CLEAR_MARGIN - chordPerp
          : chordPerp - (perpMin(axis, c) - CLEAR_MARGIN);
      maxSag = Math.max(maxSag, Math.max(0, need) / f);
    }
    return maxSag;
  };

  const bandMin = Math.min(perpMin(axis, from), perpMin(axis, to), ...crossed.map((c) => perpMin(axis, c)));
  const bandMax = Math.max(perpMax(axis, from), perpMax(axis, to), ...crossed.map((c) => perpMax(axis, c)));
  const chordAxisMin = Math.min(axisFrom, axisTo);
  const chordAxisMax = Math.max(axisFrom, axisTo);

  const excluded = new Set([from.id, to.id, ...crossed.map((c) => c.id)]);
  const others = allShapes.filter((s) => (s.kind === "box" || s.kind === "note") && !excluded.has(s.id));

  const gap = (side: Side): number => {
    let best = Infinity;
    for (const s of others) {
      if (!rangesOverlap(axisMin(axis, s), axisMax(axis, s), chordAxisMin, chordAxisMax)) continue;
      if (side === "neg" && perpMax(axis, s) <= bandMin) {
        best = Math.min(best, bandMin - perpMax(axis, s));
      } else if (side === "pos" && perpMin(axis, s) >= bandMax) {
        best = Math.min(best, perpMin(axis, s) - bandMax);
      }
    }
    return best;
  };

  const midPerp = (side: Side): number => (anchorPerp(axis, side, from) + anchorPerp(axis, side, to)) / 2;

  const negSag = requiredSag("neg");
  const posSag = requiredSag("pos");
  const negGap = gap("neg");
  const posGap = gap("pos");
  // The arc's peak reaches roughly midPerp +/- sag; only the part of that
  // which pokes past the swept band actually needs clear room.
  const negOvershoot = Math.max(0, negSag - (midPerp("neg") - bandMin));
  const posOvershoot = Math.max(0, posSag - (bandMax - midPerp("pos")));
  const negViable = negGap >= negOvershoot;
  const posViable = posGap >= posOvershoot;

  let chosen: Side | null = null;
  if (negViable && posViable) {
    chosen = negGap >= posGap ? "neg" : "pos";
  } else if (negViable) {
    chosen = "neg";
  } else if (posViable) {
    chosen = "pos";
  }
  if (chosen === null) return null;

  const sag = chosen === "neg" ? negSag : posSag;
  const startPoint = anchorPoint(axis, chosen, from);
  const endPoint = anchorPoint(axis, chosen, to);
  const u = unit(startPoint, endPoint);
  const p: Point = { x: -u.y, y: u.x };
  const sideDir = sideDirection(axis, chosen);
  const sign = p.x * sideDir.x + p.y * sideDir.y >= 0 ? 1 : -1;

  const bend = round1(sag * sign);
  if (Math.abs(bend) < MIN_BEND) return null;

  const anchor = normalizedAnchor(axis, chosen);
  return { bend, startAnchor: anchor, endAnchor: { ...anchor } };
}

function deriveAxis(from: AbsShape, to: AbsShape): Axis | null {
  if (rangesOverlap(from.y, from.y + from.h, to.y, to.y + to.h)) return "horizontal";
  if (rangesOverlap(from.x, from.x + from.w, to.x, to.x + to.w)) return "vertical";
  return null;
}

function isCrossing(axis: Axis, from: AbsShape, to: AbsShape, s: AbsShape): boolean {
  if (!rangesOverlap(perpMin(axis, from), perpMax(axis, from), perpMin(axis, s), perpMax(axis, s))) {
    return false;
  }
  if (!rangesOverlap(perpMin(axis, to), perpMax(axis, to), perpMin(axis, s), perpMax(axis, s))) {
    return false;
  }
  const c = axisCentre(axis, s);
  const a = axisCentre(axis, from);
  const b = axisCentre(axis, to);
  return c > Math.min(a, b) && c < Math.max(a, b);
}

function rangesOverlap(aMin: number, aMax: number, bMin: number, bMax: number): boolean {
  return aMin < bMax && bMin < aMax;
}

function axisCentre(axis: Axis, s: AbsShape): number {
  return axis === "horizontal" ? s.x + s.w / 2 : s.y + s.h / 2;
}

function perpMin(axis: Axis, s: AbsShape): number {
  return axis === "horizontal" ? s.y : s.x;
}

function perpMax(axis: Axis, s: AbsShape): number {
  return axis === "horizontal" ? s.y + s.h : s.x + s.w;
}

function anchorPerp(axis: Axis, side: Side, s: AbsShape): number {
  return side === "neg" ? perpMin(axis, s) : perpMax(axis, s);
}

function anchorPoint(axis: Axis, side: Side, s: AbsShape): Point {
  const axisCoord = axisCentre(axis, s);
  const perpCoord = anchorPerp(axis, side, s);
  return axis === "horizontal" ? { x: axisCoord, y: perpCoord } : { x: perpCoord, y: axisCoord };
}

function normalizedAnchor(axis: Axis, side: Side): Point {
  if (axis === "horizontal") return side === "neg" ? { x: 0.5, y: 0 } : { x: 0.5, y: 1 };
  return side === "neg" ? { x: 0, y: 0.5 } : { x: 1, y: 0.5 };
}

function axisMin(axis: Axis, s: AbsShape): number {
  return axis === "horizontal" ? s.x : s.y;
}

function axisMax(axis: Axis, s: AbsShape): number {
  return axis === "horizontal" ? s.x + s.w : s.y + s.h;
}

function unit(a: Point, b: Point): Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  return len === 0 ? { x: 0, y: 0 } : { x: dx / len, y: dy / len };
}

function sideDirection(axis: Axis, side: Side): Point {
  if (axis === "horizontal") return side === "neg" ? { x: 0, y: -1 } : { x: 0, y: 1 };
  return side === "neg" ? { x: -1, y: 0 } : { x: 1, y: 0 };
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
