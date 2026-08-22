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
 *
 * Skip edges sharing a container, axis, and side whose spans overlap are
 * assigned to distinct lanes (see `docs/plan.md` T5) so they bow by visibly
 * different amounts instead of stacking into one stroke, the longest chord
 * taking the outermost lane. A lane's extra sag is dropped a step at a time
 * if it isn't viable (would bow into a neighbouring shape).
 */

import type { IRDocPositioned, IREdge, IRElementPositioned } from "../ir/index.js";
import { ARROW_LABEL_PADDING, arrowLabelLineHeight, arrowLabelWidth } from "./glyph-metrics.js";

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

export type EdgeRoute = { bend: number; startAnchor?: Point; endAnchor?: Point; labelPosition?: number };

/** Extra sag, in px, per lane a skip edge is pushed out from its innermost sibling. */
const LANE_STEP = 20;

/** Self-edge loop bend, clamped between a visible minimum and a cap so it doesn't dwarf a small shape. */
const LOOP_MIN = 36;
const LOOP_MAX = 90;
const LOOP_SHAPE_FACTOR = 0.6;

/** Perpendicular displacement per lane when fanning edges that share a pair with nothing between them. */
const FAN_STEP_MIN = 36;
const FAN_STEP_MAX = 72;
const FAN_STEP_CHORD_FACTOR = 0.3;

type RouteCandidate = {
  edgeId: string;
  axis: Axis;
  side: Side;
  parentId: string;
  baseSag: number;
  gap: number;
  slack: number;
  chordAxisMin: number;
  chordAxisMax: number;
  startPoint: Point;
  endPoint: Point;
};

export function computeEdgeRoutes(ir: IRDocPositioned): Map<string, EdgeRoute> {
  const { shapes, edges } = collect(ir);
  const byId = new Map(shapes.map((s) => [s.id, s]));

  const routes = new Map<string, EdgeRoute>();
  const selfEdges = new Set<string>();
  for (const edge of edges) {
    if (edge.from !== edge.to) continue;
    selfEdges.add(edge.id);
    const shape = byId.get(edge.from);
    if (!shape) continue;
    const loop = Math.max(LOOP_MIN, Math.min(LOOP_SHAPE_FACTOR * shape.w, LOOP_MAX));
    routes.set(edge.id, { bend: loop, startAnchor: { x: 0.75, y: 0 }, endAnchor: { x: 0.25, y: 0 } });
  }

  const otherEdges = edges.filter((edge) => !selfEdges.has(edge.id));

  const candidates: RouteCandidate[] = [];
  for (const edge of otherEdges) {
    const candidate = computeCandidate(edge, byId, shapes);
    if (candidate !== null) candidates.push(candidate);
  }

  const rankOf = assignLanes(candidates);

  for (const candidate of candidates) {
    const route = finalizeRoute(candidate, rankOf.get(candidate.edgeId) ?? 0);
    if (route !== null) routes.set(candidate.edgeId, route);
  }

  fanSharedPairs(otherEdges, byId, routes);

  placeLabels(edges, byId, shapes, routes);

  return routes;
}

/** Candidate `t` positions along an arrow, ordered nearest-to-midpoint first (first-wins tie-break). */
const LABEL_CANDIDATE_TS = [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8];

type LabelBox = { x: number; y: number; w: number; h: number };

type LabelSlot = {
  edge: IREdge;
  start: Point;
  end: Point;
  perp: Point;
  bend: number;
  w: number;
  h: number;
  box: LabelBox;
};

/**
 * Slides each labelled edge's label along its own arrow (via `labelPosition`)
 * to the nearest-to-midpoint spot clear of the other edge labels and of any
 * non-endpoint box/note. Every label starts at its own midpoint and every
 * label is a blocker for every other, so an edge moved off a shape does not
 * land on a label that has not been placed yet; mutates `routes` in place.
 */
function placeLabels(
  edges: IREdge[],
  byId: Map<string, AbsShape>,
  shapes: AbsShape[],
  routes: Map<string, EdgeRoute>,
): void {
  const blockerPool = shapes.filter((s) => s.kind === "box" || s.kind === "note");

  const slots: LabelSlot[] = [];
  for (const edge of edges) {
    if (!edge.label || edge.from === edge.to) continue;
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;

    const start = bodyExitPoint(from, to);
    const end = bodyExitPoint(to, from);
    const u = unit(start, end);
    const slot: LabelSlot = {
      edge,
      start,
      end,
      perp: { x: -u.y, y: u.x },
      bend: routes.get(edge.id)?.bend ?? 0,
      w: arrowLabelWidth(edge.label, edge) + 2 * ARROW_LABEL_PADDING,
      h: arrowLabelLineHeight(edge) + 2 * ARROW_LABEL_PADDING,
      box: { x: 0, y: 0, w: 0, h: 0 },
    };
    slot.box = boxAt(slot, 0.5);
    slots.push(slot);
  }

  for (const slot of slots) {
    const blockers = blockerPool.filter((s) => s.id !== slot.edge.from && s.id !== slot.edge.to);
    const others = slots.filter((o) => o !== slot);

    let bestT = 0.5;
    let bestScore = Infinity;
    let bestBox = slot.box;

    for (const t of LABEL_CANDIDATE_TS) {
      const box = boxAt(slot, t);
      let score = 0;
      for (const s of blockers) if (boxesOverlap(box, s)) score++;
      for (const o of others) if (boxesOverlap(box, o.box)) score++;
      if (score < bestScore) {
        bestScore = score;
        bestT = t;
        bestBox = box;
      }
      if (score === 0) break;
    }

    slot.box = bestBox;
    if (bestT !== 0.5) {
      const existing = routes.get(slot.edge.id);
      routes.set(
        slot.edge.id,
        existing === undefined ? { bend: 0, labelPosition: bestT } : { ...existing, labelPosition: bestT },
      );
    }
  }
}

/** Point on the parabola approximating the arc at `t`, per `finalizeRoute`'s bend/perp convention. */
function boxAt({ start, end, perp, bend, w, h }: LabelSlot, t: number): LabelBox {
  const bow = bend * 4 * t * (1 - t);
  const cx = start.x + (end.x - start.x) * t + perp.x * bow;
  const cy = start.y + (end.y - start.y) * t + perp.y * bow;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Where the chord from `s`'s centre toward `other`'s centre exits `s`'s rectangle - tldraw's actual arrow terminal. */
function bodyExitPoint(s: AbsShape, other: AbsShape): Point {
  const centre: Point = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
  const otherCentre: Point = { x: other.x + other.w / 2, y: other.y + other.h / 2 };
  const dx = otherCentre.x - centre.x;
  const dy = otherCentre.y - centre.y;
  let t = Infinity;
  if (dx !== 0) t = Math.min(t, ((dx > 0 ? s.x + s.w : s.x) - centre.x) / dx);
  if (dy !== 0) t = Math.min(t, ((dy > 0 ? s.y + s.h : s.y) - centre.y) / dy);
  if (!Number.isFinite(t)) return centre;
  return { x: centre.x + t * dx, y: centre.y + t * dy };
}

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function fanSharedPairs(
  edges: IREdge[],
  byId: Map<string, AbsShape>,
  routes: Map<string, EdgeRoute>,
): void {
  const groups = new Map<string, { loId: string; lo: AbsShape; hi: AbsShape; edges: IREdge[] }>();
  for (const edge of edges) {
    if (routes.has(edge.id)) continue;
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const fromIsLo = edge.from < edge.to;
    const loId = fromIsLo ? edge.from : edge.to;
    const key = `${loId} ${fromIsLo ? edge.to : edge.from}`;
    const group = groups.get(key);
    if (group) group.edges.push(edge);
    else {
      groups.set(key, {
        loId,
        lo: fromIsLo ? from : to,
        hi: fromIsLo ? to : from,
        edges: [edge],
      });
    }
  }

  for (const { loId, lo, hi, edges: group } of groups.values()) {
    if (group.length < 2) continue;

    const chord = Math.hypot(
      axisCentre("horizontal", lo) - axisCentre("horizontal", hi),
      axisCentre("vertical", lo) - axisCentre("vertical", hi),
    );
    const step = Math.min(FAN_STEP_MAX, Math.max(FAN_STEP_MIN, FAN_STEP_CHORD_FACTOR * chord));
    const n = group.length;
    group.forEach((edge, i) => {
      const offset = (i - (n - 1) / 2) * step;
      const bend = round1(offset * (edge.from === loId ? 1 : -1));
      if (Math.abs(bend) < MIN_BEND) return;
      routes.set(edge.id, { bend });
    });
  }
}

function assignLanes(candidates: RouteCandidate[]): Map<string, number> {
  const groups = new Map<string, RouteCandidate[]>();
  for (const c of candidates) {
    const key = `${c.parentId} ${c.axis} ${c.side}`;
    const group = groups.get(key);
    if (group) group.push(c);
    else groups.set(key, [c]);
  }

  const rankOf = new Map<string, number>();
  for (const group of groups.values()) {
    group.sort((a, b) => {
      const spanA = a.chordAxisMax - a.chordAxisMin;
      const spanB = b.chordAxisMax - b.chordAxisMin;
      return spanA !== spanB ? spanA - spanB : (a.edgeId < b.edgeId ? -1 : 1);
    });

    const assigned: { rank: number; min: number; max: number }[] = [];
    for (const c of group) {
      let maxRank = -1;
      for (const a of assigned) {
        if (rangesOverlap(a.min, a.max, c.chordAxisMin, c.chordAxisMax)) {
          maxRank = Math.max(maxRank, a.rank);
        }
      }
      const rank = maxRank + 1;
      assigned.push({ rank, min: c.chordAxisMin, max: c.chordAxisMax });
      rankOf.set(c.edgeId, rank);
    }
  }
  return rankOf;
}

function finalizeRoute(candidate: RouteCandidate, assignedRank: number): EdgeRoute | null {
  const { axis, side, baseSag, gap, slack, startPoint, endPoint } = candidate;

  let rank = assignedRank;
  while (rank > 0 && gap < Math.max(0, baseSag + rank * LANE_STEP - slack)) {
    rank--;
  }
  const sag = baseSag + rank * LANE_STEP;

  const u = unit(startPoint, endPoint);
  const p: Point = { x: -u.y, y: u.x };
  const sideDir = sideDirection(axis, side);
  const sign = p.x * sideDir.x + p.y * sideDir.y >= 0 ? 1 : -1;

  const bend = round1(sag * sign);
  if (Math.abs(bend) < MIN_BEND) return null;

  const anchor = normalizedAnchor(axis, side);
  return { bend, startAnchor: anchor, endAnchor: { ...anchor } };
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

function computeCandidate(edge: IREdge, byId: Map<string, AbsShape>, allShapes: AbsShape[]): RouteCandidate | null {
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  if (!from || !to) return null;

  const axis = deriveAxis(from, to);
  if (axis === null) return null;

  const crossed = allShapes.filter(
    (s) =>
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
  const chosenGap = chosen === "neg" ? negGap : posGap;
  const slack = chosen === "neg" ? midPerp("neg") - bandMin : bandMax - midPerp("pos");
  const startPoint = anchorPoint(axis, chosen, from);
  const endPoint = anchorPoint(axis, chosen, to);

  return {
    edgeId: edge.id,
    axis,
    side: chosen,
    parentId: lowestCommonAncestor(from.parentId, to.parentId, byId),
    baseSag: sag,
    gap: chosenGap,
    slack,
    chordAxisMin,
    chordAxisMax,
    startPoint,
    endPoint,
  };
}

/** Container ids from `containerId` up to the document root, inclusive. */
function ancestorChain(containerId: string, byId: Map<string, AbsShape>): string[] {
  const chain: string[] = [];
  let cur: string | undefined = containerId;
  while (cur !== undefined) {
    chain.push(cur);
    cur = byId.get(cur)?.parentId;
  }
  return chain;
}

/** Lowest common ancestor container of two edge endpoints' immediate parents, used as the lane-grouping key. */
function lowestCommonAncestor(aParentId: string, bParentId: string, byId: Map<string, AbsShape>): string {
  const bChain = new Set(ancestorChain(bParentId, byId));
  for (const id of ancestorChain(aParentId, byId)) {
    if (bChain.has(id)) return id;
  }
  return aParentId;
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
