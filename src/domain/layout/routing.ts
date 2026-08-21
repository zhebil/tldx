/**
 * IR-with-positions -> per-edge tldraw `bend`.
 *
 * `arrowShape` draws a straight chord by default (`bend: 0`), which passes
 * straight through any box/note sitting between an edge's endpoints on the
 * same layout axis (a "same-axis skip" edge - see `docs/plan.md` T3). This
 * module computes the bend needed to bow such an edge around the shapes it
 * would otherwise cross, choosing whichever perpendicular side has enough
 * clear room. Cross-container edges and edges with no intervening shapes
 * stay straight (`bend: 0`), which callers signal by simply not having an
 * entry in the returned map.
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

export function computeEdgeBends(ir: IRDocPositioned): Map<string, number> {
  const { shapes, edges } = collect(ir);
  const byId = new Map(shapes.map((s) => [s.id, s]));

  const bends = new Map<string, number>();
  for (const edge of edges) {
    const bend = computeBend(edge, byId, shapes);
    if (bend !== 0) bends.set(edge.id, bend);
  }
  return bends;
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

function computeBend(edge: IREdge, byId: Map<string, AbsShape>, allShapes: AbsShape[]): number {
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  if (!from || !to) return 0;
  if (from.parentId !== to.parentId) return 0;

  const axis = deriveAxis(from, to);
  if (axis === null) return 0;

  const crossed = allShapes.filter(
    (s) =>
      s.parentId === from.parentId &&
      s.id !== from.id &&
      s.id !== to.id &&
      (s.kind === "box" || s.kind === "note") &&
      isCrossing(axis, from, to, s),
  );
  if (crossed.length === 0) return 0;

  const axisFrom = axisCentre(axis, from);
  const axisTo = axisCentre(axis, to);
  const perpFrom = perpCentre(axis, from);
  const perpTo = perpCentre(axis, to);

  const requiredSag = (side: Side): number => {
    let maxSag = 0;
    for (const c of crossed) {
      const rawT = (axisCentre(axis, c) - axisFrom) / (axisTo - axisFrom);
      const t = Math.min(1 - 1e-6, Math.max(1e-6, rawT));
      const f = 4 * t * (1 - t);
      const chordPerp = perpFrom + t * (perpTo - perpFrom);
      const farEdge = side === "neg" ? perpMin(axis, c) : perpMax(axis, c);
      const clearance = Math.abs(chordPerp - farEdge) + CLEAR_MARGIN;
      maxSag = Math.max(maxSag, clearance / f);
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

  const negSag = requiredSag("neg");
  const posSag = requiredSag("pos");
  const negGap = gap("neg");
  const posGap = gap("pos");
  const negViable = negGap >= negSag;
  const posViable = posGap >= posSag;

  let chosen: Side | null = null;
  if (negViable && posViable) {
    chosen = negGap >= posGap ? "neg" : "pos";
  } else if (negViable) {
    chosen = "neg";
  } else if (posViable) {
    chosen = "pos";
  }
  if (chosen === null) return 0;

  const sag = chosen === "neg" ? negSag : posSag;
  const u = unit(center(from), center(to));
  const p: Point = { x: -u.y, y: u.x };
  const sideDir = sideDirection(axis, chosen);
  const sign = p.x * sideDir.x + p.y * sideDir.y >= 0 ? 1 : -1;

  const bend = round1(sag * sign);
  return Math.abs(bend) < MIN_BEND ? 0 : bend;
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

function perpCentre(axis: Axis, s: AbsShape): number {
  return axis === "horizontal" ? s.y + s.h / 2 : s.x + s.w / 2;
}

function perpMin(axis: Axis, s: AbsShape): number {
  return axis === "horizontal" ? s.y : s.x;
}

function perpMax(axis: Axis, s: AbsShape): number {
  return axis === "horizontal" ? s.y + s.h : s.x + s.w;
}

function axisMin(axis: Axis, s: AbsShape): number {
  return axis === "horizontal" ? s.x : s.y;
}

function axisMax(axis: Axis, s: AbsShape): number {
  return axis === "horizontal" ? s.x + s.w : s.y + s.h;
}

function center(s: AbsShape): Point {
  return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
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
