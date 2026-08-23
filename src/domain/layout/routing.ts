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
 *
 * The candidate/lane pass's `crossed`/`gap` heuristics are analytic
 * estimates, not ground truth - they only reason about shapes their own
 * band-overlap test finds, so a shape that partially overlaps that band
 * (rather than sitting fully inside or outside it) can be invisible to them
 * and their sag can come up short of what the real render needs. Every
 * non-self edge - whatever bend the candidate/lane pass, the fan, or neither
 * proposed - therefore goes through one more, final check:
 * `clearObstaclesOnEveryRoute` re-tests the edge's *actual* rendered arc
 * against every non-endpoint box/note and grows the bend (`growBendClear`)
 * if it doesn't clear. An edge with no committed side yet (the
 * cross-container case, endpoints sharing no layout axis, where
 * `computeCandidate` has nothing to work with) tries both sides and keeps
 * whichever clears or comes closest; an edge whose side is already chosen
 * only grows further on that same side. An edge whose straight chord is
 * already clear is left alone, so short hops stay straight lines.
 * `growBendClear` is the one growth loop this module has - `placeLabels`'s
 * own last-resort label-driven growth reuses it too.
 *
 * Every one of those passes only ever grows a bend until its own predicate
 * passes, then stops - none of them cost bend magnitude or re-minimise once
 * every constraint is met, so the bend a route ends up with is the sum of
 * whatever each pass independently decided it needed (B12). `minimizeBends`
 * runs last and bisects each edge's committed bend back toward zero, keeping
 * the smallest magnitude that still clears every real predicate the earlier
 * passes were enforcing - see its own header for the exact list.
 */

import type { IRDocPositioned, IREdge, IRElementPositioned } from "../ir/index.js";
import type { StyleGeo } from "../ir/styles.js";

import {
  ARROW_LABEL_FONT_PX,
  ARROW_LABEL_PADDING,
  arrowLabelLineHeight,
  arrowLabelWidth,
  DEFAULT_FONT_SIZE,
} from "./glyph-metrics.js";

/** tldraw's own MIN_ARROW_BEND: anything smaller renders as a straight line, so round down to 0. */
const MIN_BEND = 8;
const CLEAR_MARGIN = 12;

/**
 * tldraw `arrowLabel.ts`'s own squish margin (64: a horizontal-ish arrow's
 * body must be at least `label width + 64` wide before its label renders on
 * one line, else it's re-measured at the squished width and wraps) plus the
 * same body-vs-terminal margin `stack.ts`'s `ARROW_LABEL_MARGIN` reserves
 * for a labelled edge between adjacent siblings (T12/D9: `BOUND_ARROW_OFFSET`
 * plus half the arrow's stroke and half the bound shape's). `stack.ts` only
 * ever sees same-container adjacent edges, though - it has no gap to widen
 * for a labelled edge that skips across `<Group>`/`<Frame>` boundaries, so
 * `growBendForLabelSquish` reserves the identical budget here, post-layout,
 * by growing the edge's own bend instead (B4).
 */
const SQUISH_MARGIN = 64 + 13.5;

/**
 * How much of an edge's own chord `growBendForLabelSquish` may spend trying
 * to unsquish a label (B12). The pass exists for a genuine three-line wrap;
 * it is not worth paying a near-semicircle to turn a two-line wrap into one
 * line, so the budget is deliberately smaller than `clearObstaclesOnEveryRoute`'s
 * full chord-length latitude. `LABEL_SQUISH_MIN_BUDGET` keeps a short chord
 * from getting a budget too small to matter at all.
 */
const LABEL_SQUISH_BUDGET_FACTOR = 0.18;
const LABEL_SQUISH_MIN_BUDGET = 32;

/**
 * Same crowding rule `tools/arrow-truth.mts` uses to flag two rendered arcs
 * as one visual stroke (`CROWD_PX`/`CROWD_FRACTION` there) - reused by
 * `minimizeBends` so shrinking one edge's bend can never quietly collide it
 * with a sibling `fanSharedPairs` (or a lane) had already pulled apart.
 */
const PAIR_CLEARANCE_PX = 12;
const PAIR_CLEARANCE_FRACTION = 1 / 3;

/** Rounds of bisection `minimizeBends` runs per edge - the chord-scale search range needs nowhere near this many to reach sub-pixel precision. */
const MINIMIZE_ROUNDS = 18;

/** Below this, a shrink isn't worth committing - avoids replacing an already-minimal bend with a numerically-noisy near-duplicate. */
const MINIMIZE_MEANINGFUL_PX = 1;

/**
 * Margin `minimizeBends` inflates a label box by before comparing it against
 * another edge's label - larger than `CLEAR_MARGIN` because this pass
 * bisects for the *tightest* passing value, and `approxLabelBox`'s parabola
 * approximation of tldraw's real circular arc (see this module's own header)
 * has more slop at a label's position than it does on the arc's own path.
 * A margin sized for "don't graze a box" isn't enough headroom for "don't
 * let two labels this model calls clear actually touch in the real render".
 */
const MINIMIZE_LABEL_MARGIN = 24;

type ShapeKind = "frame" | "box" | "note";

type AbsShape = {
  id: string;
  kind: ShapeKind;
  parentId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Only set for `kind: "box"` - a diamond/ellipse's real outline sits inside its bounding box (B10). */
  geo?: StyleGeo;
};

type Axis = "horizontal" | "vertical";
type Side = "neg" | "pos";
type Point = { x: number; y: number };

export type LabelBox = { x: number; y: number; w: number; h: number };

export type EdgeRoute = {
  bend: number;
  startAnchor?: Point;
  endAnchor?: Point;
  labelPosition?: number;
  /** Final placed label rect (page space), for every labelled edge - occlusion checks read this. */
  labelBox?: LabelBox;
};

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
/** Ceiling on the wider, label-aware fan step - see `labelAwareFanStep`. */
const FAN_STEP_LABEL_MAX = 160;

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
    routes.set(edge.id, {
      bend: loop,
      startAnchor: edge.fromAnchor ?? { x: 0.75, y: 0 },
      endAnchor: edge.toAnchor ?? { x: 0.25, y: 0 },
    });
  }

  const otherEdges = edges.filter((edge) => !selfEdges.has(edge.id));

  // An authored `fromSide`/`toSide` (B9) wins over anything the router would
  // otherwise compute - seed it before the candidate/lane pass so
  // `finalizeRoute` never overwrites it, and before every later pass so each
  // one treats the author's choice as a fixed constraint to route around
  // (`clearObstaclesOnEveryRoute`, `growBendForLabelSquish`) rather than
  // something to override. `fanSharedPairs` already skips any edge that
  // already has a route entry, so it never touches one of these either.
  for (const edge of otherEdges) {
    if (edge.fromAnchor === undefined && edge.toAnchor === undefined) continue;
    routes.set(edge.id, {
      bend: 0,
      ...(edge.fromAnchor === undefined ? {} : { startAnchor: edge.fromAnchor }),
      ...(edge.toAnchor === undefined ? {} : { endAnchor: edge.toAnchor }),
    });
  }

  const candidates: RouteCandidate[] = [];
  for (const edge of otherEdges) {
    if (routes.has(edge.id)) continue;
    const candidate = computeCandidate(edge, byId, shapes);
    if (candidate !== null) candidates.push(candidate);
  }

  const rankOf = assignLanes(candidates);

  for (const candidate of candidates) {
    routes.set(candidate.edgeId, finalizeRoute(candidate, rankOf.get(candidate.edgeId) ?? 0));
  }

  fanSharedPairs(otherEdges, byId, shapes, routes);

  attachFacingProximity(otherEdges, byId, routes);

  clearObstaclesOnEveryRoute(otherEdges, byId, shapes, routes);

  growBendForLabelSquish(otherEdges, byId, shapes, routes);

  placeLabels(edges, byId, shapes, routes);

  minimizeBends(otherEdges, byId, shapes, routes);

  return routes;
}

/** Candidate `t` positions along an arrow, ordered nearest-to-midpoint first (first-wins tie-break). */
const LABEL_CANDIDATE_TS = [0.5, 0.38, 0.62, 0.28, 0.72, 0.2, 0.8];

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
 *
 * Sliding along the arc isn't always enough - a label wider than the arc's
 * whole clearance band can overlap a shape at every candidate `t` (the same
 * arc-vs-label mismatch `labelAwareFanStep` documents, but here there's no
 * reciprocal sibling to fan against). When that happens, this grows the
 * edge's own `bend` via `growBendClear` - the same growth loop every other
 * obstacle-avoiding bend in this module now shares - re-testing the label at
 * the arc's own midpoint, and keeps the result only if it's actually better.
 * See the `if (best.shapeScore > 0)` block below for why growth checks only
 * the midpoint and never an offset `t` on top of it.
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

    // `terminalPoint` (an edge's real anchor when one was chosen, or the
    // same ray-toward-the-other-centre fallback `bodyExitPoint` always used)
    // - not `bodyExitPoint` unconditionally, which ignores a route's real
    // `normalizedAnchor` and, for a vertically-stacked pair carrying an
    // explicit left/right anchor, can collapse to a near-zero-width chord
    // (flagged pre-existing, B5; B9 makes an authored anchor common enough
    // that this module now has to get it right).
    const route = routes.get(edge.id);
    const start = terminalPoint(from, route?.startAnchor, to);
    const end = terminalPoint(to, route?.endAnchor, from);
    const u = unit(start, end);
    const slot: LabelSlot = {
      edge,
      start,
      end,
      perp: { x: -u.y, y: u.x },
      bend: route?.bend ?? 0,
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
    const slotRoute = routes.get(slot.edge.id);

    const scoreAt = (box: LabelBox): { score: number; shapeScore: number } => {
      let shapeScore = 0;
      for (const s of blockers) if (boxesOverlap(box, s)) shapeScore++;
      let score = shapeScore;
      for (const o of others) if (boxesOverlap(box, o.box)) score++;
      return { score, shapeScore };
    };

    const search = (bend: number): { t: number; box: LabelBox; score: number; shapeScore: number } => {
      const probe = { ...slot, bend };
      let bestT = 0.5;
      let bestScore = Infinity;
      let bestShapeScore = Infinity;
      let bestBox = boxAt(probe, 0.5);
      for (const t of LABEL_CANDIDATE_TS) {
        const box = boxAt(probe, t);
        const { score, shapeScore } = scoreAt(box);
        if (score < bestScore) {
          bestScore = score;
          bestShapeScore = shapeScore;
          bestT = t;
          bestBox = box;
        }
        if (score === 0) break;
      }
      return { t: bestT, box: bestBox, score: bestScore, shapeScore: bestShapeScore };
    };

    let best = search(slot.bend);
    let bestBend = slot.bend;

    // A label wider than the arc's own clearance band can cover a shape at
    // every `t` `search` tries - sliding along the arc can't fix that, only
    // moving the arc can. Scoped to an actual shape blocker (`shapeScore`),
    // not a label-vs-label clash: those already have their own established
    // fix (`fanSharedPairs`/`labelAwareFanStep`), and growing the bend here
    // for a clash `search`'s `t` already resolved (`shapeScore === 0`) would
    // just add an unforced detour. Growth only widens `bend`'s existing side
    // (or, for a currently-straight edge, tries both) so it never undoes a
    // side a candidate/detour pass already chose to avoid crossing a shape,
    // and it only ever tests the arc's own midpoint (`t = 0.5`, no
    // `labelPosition` offset): combining a widened bend with an offset `t`
    // measurably reintroduces a label/label collision `search`'s own
    // approximation misses (confirmed against `tools/arrow-truth.mts`'s
    // rendered ground truth) - the same tldraw own-midpoint clamp this
    // module's header already warns about, just triggered by the interaction
    // rather than the offset alone.
    if (best.shapeScore > 0) {
      const otherLabelBoxes = others
        .map((o) => {
          const r = routes.get(o.edge.id);
          return approxLabelBox(o.edge, byId, r?.bend ?? 0, r?.startAnchor, r?.endAnchor);
        })
        .filter((b): b is LabelBox => b !== null);
      const signs: (1 | -1)[] = slot.bend !== 0 ? [Math.sign(slot.bend) as 1 | -1] : [1, -1];

      const grownBend = growBendClear(
        slot.edge,
        slot.bend,
        byId,
        blockerPool,
        otherLabelBoxes,
        signs,
        slotRoute?.startAnchor,
        slotRoute?.endAnchor,
        false,
      );
      if (grownBend !== slot.bend) {
        const box = boxAt({ ...slot, bend: grownBend }, 0.5);
        const { score, shapeScore } = scoreAt(box);
        if (shapeScore < best.shapeScore || (shapeScore === best.shapeScore && score < best.score)) {
          best = { t: 0.5, box, score, shapeScore };
          bestBend = grownBend;
        }
      }
    }

    slot.bend = bestBend;
    slot.box = best.box;
    const existing = routes.get(slot.edge.id);
    routes.set(slot.edge.id, {
      ...(existing ?? { bend: 0 }),
      bend: bestBend,
      labelBox: best.box,
      ...(best.t === 0.5 ? {} : { labelPosition: best.t }),
    });
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
/**
 * `diamond`'s outline (tldraw `getGeoShapePath.ts`) is the 4-point polygon
 * top/right/bottom/left-mid of the box - the L1 ("taxicab") unit ball scaled
 * by the box's half-extents. A ray from centre in direction `(dx, dy)` hits
 * it at `t = 1 / (|dx|/rx + |dy|/ry)`.
 */
function diamondExitT(dx: number, dy: number, rx: number, ry: number): number {
  return 1 / (Math.abs(dx) / rx + Math.abs(dy) / ry);
}

/** `ellipse`'s outline is the standard ellipse inscribed in the box; ray-ellipse intersection from the centre. */
function ellipseExitT(dx: number, dy: number, rx: number, ry: number): number {
  return 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
}

/**
 * Where the ray from `s`'s centre toward `other`'s centre exits `s`'s real
 * outline - tldraw's actual arrow terminal (`straight-arrow.ts`'s
 * `updateArrowheadPointWithBoundShape` intersects against the bound shape's
 * own geometry, not its bounding box). `diamond`/`ellipse` get their real
 * outline; every other `geo` (most of them concave or many-sided - star,
 * cloud, hexagon, ...) falls back to the bounding box, same as an unset
 * `geo` (plain rectangle) - none of those appear in a routing-sensitive
 * position in the corpus this was measured against (B10).
 */
function bodyExitPoint(s: AbsShape, other: AbsShape): Point {
  const centre: Point = { x: s.x + s.w / 2, y: s.y + s.h / 2 };
  const otherCentre: Point = { x: other.x + other.w / 2, y: other.y + other.h / 2 };
  const dx = otherCentre.x - centre.x;
  const dy = otherCentre.y - centre.y;
  if (dx === 0 && dy === 0) return centre;

  if (s.geo === "diamond" || s.geo === "ellipse") {
    const rx = s.w / 2;
    const ry = s.h / 2;
    const t = s.geo === "diamond" ? diamondExitT(dx, dy, rx, ry) : ellipseExitT(dx, dy, rx, ry);
    return { x: centre.x + t * dx, y: centre.y + t * dy };
  }

  let t = Infinity;
  if (dx !== 0) t = Math.min(t, ((dx > 0 ? s.x + s.w : s.x) - centre.x) / dx);
  if (dy !== 0) t = Math.min(t, ((dy > 0 ? s.y + s.h : s.y) - centre.y) / dy);
  if (!Number.isFinite(t)) return centre;
  return { x: centre.x + t * dx, y: centre.y + t * dy };
}

/**
 * A route's actual terminal on `s`: the fixed `normalizedAnchor` face
 * `finalizeRoute` chose for a candidate/lane edge, when one was chosen, or
 * `bodyExitPoint`'s default ray-toward-`other`'s-centre point for every edge
 * that never got an explicit anchor (fan, detour, unrouted). Obstacle checks
 * that don't use the edge's actual terminal test the wrong line entirely.
 */
function terminalPoint(s: AbsShape, anchor: Point | undefined, other: AbsShape): Point {
  return anchor ? { x: s.x + anchor.x * s.w, y: s.y + anchor.y * s.h } : bodyExitPoint(s, other);
}

function boxesOverlap(a: LabelBox, b: LabelBox): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function inflate(box: LabelBox, margin: number): LabelBox {
  return { x: box.x - margin, y: box.y - margin, w: box.w + 2 * margin, h: box.h + 2 * margin };
}

function fanSharedPairs(
  edges: IREdge[],
  byId: Map<string, AbsShape>,
  shapes: AbsShape[],
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
    const baseStep = Math.min(FAN_STEP_MAX, Math.max(FAN_STEP_MIN, FAN_STEP_CHORD_FACTOR * chord));
    const step = labelAwareFanStep(group, loId, baseStep, byId, shapes, edges, routes);
    const n = group.length;
    group.forEach((edge, i) => {
      const offset = (i - (n - 1) / 2) * step;
      const bend = round1(offset * (edge.from === loId ? 1 : -1));
      if (Math.abs(bend) < MIN_BEND) return;
      routes.set(edge.id, { bend });
    });
  }
}

/**
 * B13: the nearest-facing-edge attach point for every edge the candidate/
 * lane pass and `fanSharedPairs` left untouched - no crossing to bow
 * around, no shared pair to fan, straight chord, still at the ray-toward-
 * the-other-centre default `terminalPoint` falls back to. That ray only
 * lands on the right face when both terminals are roughly centred on each
 * other; once one is much wider or taller than the other (a source box
 * sitting above one end of a wide bar, say), the ray toward the wide
 * shape's centre cuts in diagonally and can exit through the wrong side
 * entirely, which is what B12's bend-growth then bows even further around.
 * Mutates `routes` in place; `edges` here already excludes self-edges.
 */
function attachFacingProximity(edges: IREdge[], byId: Map<string, AbsShape>, routes: Map<string, EdgeRoute>): void {
  for (const edge of edges) {
    if (routes.has(edge.id)) continue;
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;
    const anchors = facingAnchors(from, to);
    if (anchors === null) continue;
    routes.set(edge.id, { bend: 0, startAnchor: anchors.from, endAnchor: anchors.to });
  }
}

/**
 * `null` unless `from`/`to` are unambiguously stacked (no y-overlap, some
 * x-overlap) or side by side (no x-overlap, some y-overlap) - the diagonal
 * case (neither axis overlaps) has no single pair of faces that "faces"
 * the other, so it's left alone the same way `deriveAxis` leaves it alone.
 * Both anchors share one coordinate along the facing edges (one shared x
 * for a stacked pair, one shared y for a side-by-side pair) so the chord
 * is a straight drop, not just two independently-nudged points that still
 * cut diagonally. That shared coordinate starts from the *narrower* (for a
 * stacked pair) or *shorter* (side by side) shape's own centre - the more
 * specific, already-well-placed terminal - clamped into the strip where
 * both extents overlap, so it never asks either shape to attach past its
 * own edge. When the shapes are already comparably sized and aligned this
 * reduces to the old centred point, which is why no separate size-ratio
 * threshold is needed on top of it.
 */
function facingAnchors(from: AbsShape, to: AbsShape): { from: Point; to: Point } | null {
  const yOverlap = rangesOverlap(from.y, from.y + from.h, to.y, to.y + to.h);
  const xOverlap = rangesOverlap(from.x, from.x + from.w, to.x, to.x + to.w);

  if (!yOverlap && xOverlap) {
    const overlapMin = Math.max(from.x, to.x);
    const overlapMax = Math.min(from.x + from.w, to.x + to.w);
    const preferred = from.w <= to.w ? centreX(from) : centreX(to);
    const sharedX = clampTo(preferred, overlapMin, overlapMax);
    const fromFace: 0 | 1 = from.y < to.y ? 1 : 0;
    const toFace: 0 | 1 = fromFace === 1 ? 0 : 1;
    return {
      from: { x: (sharedX - from.x) / from.w, y: fromFace },
      to: { x: (sharedX - to.x) / to.w, y: toFace },
    };
  }
  if (!xOverlap && yOverlap) {
    const overlapMin = Math.max(from.y, to.y);
    const overlapMax = Math.min(from.y + from.h, to.y + to.h);
    const preferred = from.h <= to.h ? centreY(from) : centreY(to);
    const sharedY = clampTo(preferred, overlapMin, overlapMax);
    const fromFace: 0 | 1 = from.x < to.x ? 1 : 0;
    const toFace: 0 | 1 = fromFace === 1 ? 0 : 1;
    return {
      from: { x: fromFace, y: (sharedY - from.y) / from.h },
      to: { x: toFace, y: (sharedY - to.y) / to.h },
    };
  }
  return null;
}

function centreX(s: AbsShape): number {
  return s.x + s.w / 2;
}

function centreY(s: AbsShape): number {
  return s.y + s.h / 2;
}

function clampTo(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * `FAN_STEP_MAX` bows two antiparallel arcs far enough apart to read as
 * distinct strokes, but their labels - each much wider than the line is
 * thick, and each still anchored near the arc's own midpoint - can stay
 * close enough to overprint (D14 "half fixed": the arc separation landed,
 * the label separation didn't; `placeLabels`'s own fix for this, biasing
 * `labelPosition` towards one end, is a no-op here - tldraw clamps a
 * label's position range to the arc's own midpoint once the label is wider
 * than the arc has room for, which a short reciprocal pair with a long
 * label routinely is). Widening the fan step is the only remaining lever,
 * but it moves the arc itself, so it's only taken as far as it stays clear
 * of every obstacle the narrower, unchecked step was already clear of.
 */
function labelAwareFanStep(
  group: IREdge[],
  loId: string,
  baseStep: number,
  byId: Map<string, AbsShape>,
  shapes: AbsShape[],
  allEdges: IREdge[],
  routes: Map<string, EdgeRoute>,
): number {
  const labelled = group.filter((e) => e.label !== undefined);
  if (labelled.length === 0) return baseStep;

  const labelClearance = labelled.reduce((max, e) => {
    const w = arrowLabelWidth(e.label!, e) + 2 * ARROW_LABEL_PADDING;
    const h = arrowLabelLineHeight(e) + 2 * ARROW_LABEL_PADDING;
    return Math.max(max, Math.hypot(w, h) * 0.7);
  }, 0);
  const wanted = Math.min(FAN_STEP_LABEL_MAX, Math.max(baseStep, labelClearance));
  if (wanted <= baseStep) return baseStep;

  const groupIds = new Set(group.map((e) => e.id));
  const otherLabels = allEdges.filter((e) => e.label !== undefined && !groupIds.has(e.id));

  for (const step of [wanted, baseStep + (wanted - baseStep) * 0.66, baseStep + (wanted - baseStep) * 0.33]) {
    if (fanStepClearsObstacles(group, loId, step, byId, shapes, otherLabels, routes)) return step;
  }
  return baseStep;
}

/**
 * Whether every edge in `group`, fanned at `step`, clears every box/note it
 * doesn't itself connect, and doesn't land its own label on top of another
 * edge's - `otherLabels` is every other labelled edge in the diagram (not
 * just this pair), approximated at its own already-committed bend (or
 * straight, if it hasn't been routed yet), so widening one reciprocal pair
 * can't quietly stamp its label onto an unrelated sibling's.
 */
function fanStepClearsObstacles(
  group: IREdge[],
  loId: string,
  step: number,
  byId: Map<string, AbsShape>,
  shapes: AbsShape[],
  otherLabels: IREdge[],
  routes: Map<string, EdgeRoute>,
): boolean {
  const blockerPool = shapes.filter((s) => s.kind === "box" || s.kind === "note");
  const otherLabelBoxes = otherLabels
    .map((e) => approxLabelBox(e, byId, routes.get(e.id)?.bend ?? 0))
    .filter((b): b is LabelBox => b !== null);
  const n = group.length;
  for (let i = 0; i < n; i++) {
    const edge = group[i]!;
    const offset = (i - (n - 1) / 2) * step;
    const bend = offset * (edge.from === loId ? 1 : -1);
    if (Math.abs(bend) < MIN_BEND) continue;
    if (!edgeBendClearsObstacles(edge, bend, byId, blockerPool, otherLabelBoxes)) return false;
  }
  return true;
}

/**
 * Whether `edge`, bowed to `bend`, keeps its line clear of every box/note it
 * doesn't connect and - if labelled - keeps its own approximate midpoint
 * label clear of `otherLabelBoxes`. The single-edge check both
 * `fanStepClearsObstacles` (fanning a whole shared-pair group) and
 * `placeLabels` (growing one edge's bend to clear a label off a shape) build
 * on, so a candidate bend is judged the same way in both places.
 */
function edgeBendClearsObstacles(
  edge: IREdge,
  bend: number,
  byId: Map<string, AbsShape>,
  blockerPool: AbsShape[],
  otherLabelBoxes: LabelBox[],
  startAnchor?: Point,
  endAnchor?: Point,
): boolean {
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  if (!from || !to) return true;
  const start = terminalPoint(from, startAnchor, to);
  const end = terminalPoint(to, endAnchor, from);
  const blockers = blockerPool.filter((s) => s.id !== from.id && s.id !== to.id);
  const path = arcPolyline(start, end, bend);
  if (blockers.some((b) => polylineHitsBox(path, b))) return false;

  if (edge.label !== undefined) {
    const box = approxLabelBox(edge, byId, bend, startAnchor, endAnchor);
    // Inflated by `CLEAR_MARGIN`: the model this checks against is the same
    // approximation that missed the original overprint, so a near-miss here
    // is treated as a miss and this step is rejected in favour of a smaller one.
    if (box !== null && otherLabelBoxes.some((o) => boxesOverlap(inflate(box, CLEAR_MARGIN), o))) return false;
  }
  return true;
}

/**
 * Approximate label box at `t` along `edge`'s arc for a given `bend` -
 * `null` for an unlabelled or self edge. `t` defaults to the arc's own
 * midpoint (where the parabola's sag reduces to `bend` exactly) for every
 * caller that reasons about the edge's default position; `minimizeBends`
 * passes the edge's actual committed `labelPosition` so it tests the label
 * where `placeLabels` really put it, not wherever the default would be.
 */
function approxLabelBox(
  edge: IREdge,
  byId: Map<string, AbsShape>,
  bend: number,
  startAnchor?: Point,
  endAnchor?: Point,
  t = 0.5,
): LabelBox | null {
  if (!edge.label || edge.from === edge.to) return null;
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  if (!from || !to) return null;
  const start = terminalPoint(from, startAnchor, to);
  const end = terminalPoint(to, endAnchor, from);
  const u = unit(start, end);
  const perp: Point = { x: -u.y, y: u.x };
  const w = arrowLabelWidth(edge.label, edge) + 2 * ARROW_LABEL_PADDING;
  const h = arrowLabelLineHeight(edge) + 2 * ARROW_LABEL_PADDING;
  const bow = bend * 4 * t * (1 - t);
  const cx = start.x + (end.x - start.x) * t + perp.x * bow;
  const cy = start.y + (end.y - start.y) * t + perp.y * bow;
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Clearance an obstacle-avoiding detour keeps between the arc and the box it swings around. */
const DETOUR_MARGIN = 20;
/** Points sampled along the arc when testing it against a box. */
const DETOUR_SAMPLES = 48;

/** Minimum growth per round, so the search always makes progress even when `requiredDetourSag` reports 0 (a label-only violation, nothing in the arc's own path). */
const GROW_STEP = 24;
const GROW_MAX_ROUNDS = 12;

/**
 * The single obstacle-clearance decision every non-self edge goes through
 * once the candidate/lane pass and the shared-pair fan (`fanSharedPairs`)
 * have each proposed an initial bend - or left the edge at its default
 * straight chord, the cross-container case of `docs/diagram-defects.md` D21
 * where the two endpoints share no layout axis and `computeCandidate` has
 * nothing to work with. Re-tests the edge's *actual* rendered arc against
 * every non-endpoint box/note, using the same accurate circular-arc check
 * `placeLabels`'s own last-resort growth relies on (`edgeBendClearsObstacles`),
 * and grows the bend (`growBendClear`) if it doesn't clear.
 *
 * This exists because the analytic candidate/lane pass only ever reasons
 * about the shapes its own `crossed`/`gap` heuristics find - a shape that
 * partially (not fully) overlaps the band those heuristics already
 * established from `crossed` and the endpoints is invisible to them, so the
 * sag they compute can come up short of what the real render needs. An edge
 * that already has a committed side (candidate, lane, or fan) only grows
 * further on that same side, first - this doesn't re-litigate which side to
 * bow on, only whether the chosen side needs to go further than the earlier
 * pass assumed. Only when growing the committed side finds no improvement at
 * all (the obstacle the earlier pass never saw sits on the side it picked,
 * not just further along it) does this fall back to the other side, since at
 * that point the committed side was never going to work and there's nothing
 * to lose by trying the one nobody's picked yet. An edge nothing else has
 * touched tries both sides from the start and keeps whichever clears (or
 * comes closest).
 */
function clearObstaclesOnEveryRoute(
  edges: IREdge[],
  byId: Map<string, AbsShape>,
  shapes: AbsShape[],
  routes: Map<string, EdgeRoute>,
): void {
  const blockerPool = shapes.filter((s) => s.kind === "box" || s.kind === "note");

  for (const edge of edges) {
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;

    const route = routes.get(edge.id);
    const existing = route?.bend ?? 0;
    const startAnchor = route?.startAnchor;
    const endAnchor = route?.endAnchor;
    if (edgeBendClearsObstacles(edge, existing, byId, blockerPool, [], startAnchor, endAnchor)) continue;

    if (existing === 0) {
      const bend = growBendClear(edge, existing, byId, blockerPool, [], [1, -1], startAnchor, endAnchor);
      if (bend !== existing) routes.set(edge.id, { ...(route ?? { bend: 0 }), bend });
      continue;
    }

    const committed = Math.sign(existing) as 1 | -1;
    let bend = growBendClear(edge, existing, byId, blockerPool, [], [committed], startAnchor, endAnchor);
    if (bend === existing) {
      bend = growBendClear(
        edge,
        existing,
        byId,
        blockerPool,
        [],
        [committed === 1 ? -1 : 1],
        startAnchor,
        endAnchor,
      );
    }
    if (bend !== existing) routes.set(edge.id, { ...route, bend });
  }
}

/**
 * B4: `stack.ts`'s `labelClearanceGap` reserves enough gap between two
 * *adjacent siblings in the same container* to keep tldraw from squishing a
 * labelled edge's wrap width - but it has no way to see a labelled edge
 * whose endpoints were never siblings sharing one gap to reserve at all
 * (nested `<Group>`s/`<Frame>`s, a `layout="auto"` graph laid out by ELK
 * with no label-width awareness). That's exactly the shape of the edge this
 * grows: after obstacle clearing has already settled every route
 * (`clearObstaclesOnEveryRoute`), any labelled edge still rendering short of
 * tldraw's own unsquished-width threshold gets its bend grown further (the
 * same shared `growBendClear` primitive, so it can never give back an
 * obstacle clearance to do it - see `violationCount`'s squish term).
 *
 * A diagonal chord's bend directly widens the dimension tldraw's own
 * width-branch squish reads (`squishFraction`); a near-horizontal or
 * near-vertical chord's bend can't move *that* dimension, but can still
 * push the arc's bounding box past square, onto tldraw's other branch (a
 * fixed `16 * fontSize` cap, independent of geometry) - genuinely a no-op
 * only when the label is too wide for that cap too, or already narrower
 * than tldraw's own 64px squish floor (never squished at all, any
 * geometry). Only then does fixing this mean moving a box, which is
 * layout's job (`stack.ts`/ELK), not this module's.
 */
function growBendForLabelSquish(
  edges: IREdge[],
  byId: Map<string, AbsShape>,
  shapes: AbsShape[],
  routes: Map<string, EdgeRoute>,
): void {
  const blockerPool = shapes.filter((s) => s.kind === "box" || s.kind === "note");

  for (const edge of edges) {
    if (edge.label === undefined) continue;
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;

    const route = routes.get(edge.id);
    const bend = route?.bend ?? 0;
    const startAnchor = route?.startAnchor;
    const endAnchor = route?.endAnchor;
    const start = terminalPoint(from, startAnchor, to);
    const end = terminalPoint(to, endAnchor, from);
    if (squishFraction(arcPolyline(start, end, bend), edge) === 0) continue;

    // The committed bend already crosses an obstacle `clearObstaclesOnEveryRoute`
    // couldn't route around (an engulfing blocker, say) - the partial-credit
    // bookkeeping below ranks by a combined score that also includes the
    // soft squish term, and that term keeps shrinking as bend grows even
    // while a hard path violation never clears, which would otherwise read
    // as "progress" and move the bend for a reason this pass never earned.
    // Giving up here, not growing at all, is the correct "no room" answer.
    const blockers = blockerPool.filter((s) => s.id !== from.id && s.id !== to.id);
    if (blockers.some((b) => polylineHitsBox(arcPolyline(start, end, bend), b))) continue;

    const signs: (1 | -1)[] = bend !== 0 ? [Math.sign(bend) as 1 | -1] : [1, -1];
    const chord = Math.hypot(end.x - start.x, end.y - start.y);
    const budget = Math.max(LABEL_SQUISH_MIN_BUDGET, LABEL_SQUISH_BUDGET_FACTOR * chord);
    // A modest budget needs a proportionally finer step than the path case's
    // fixed `GROW_STEP` - otherwise a short chord's whole budget is one or
    // two samples wide and the search can miss the squish improvement
    // entirely, not because the budget was too small but because nothing in
    // it ever got tested.
    const step = budget / GROW_MAX_ROUNDS;
    const grown = growBendClear(edge, bend, byId, blockerPool, [], signs, startAnchor, endAnchor, false, budget, true, step);
    if (grown !== bend) routes.set(edge.id, { ...(route ?? { bend: 0 }), bend: grown });
  }
}

/**
 * Fraction of `a`'s sample points that land within `px` of the nearest point
 * on `b` - the same "read as one thick stroke" test `tools/arrow-truth.mts`
 * applies to the actual render, just against this module's own polyline
 * approximation so `minimizeBends` can check it before anything is committed.
 */
function arcsTooClose(a: Point[], b: Point[], px: number): boolean {
  let close = 0;
  for (const p of a) {
    let nearest = Infinity;
    for (const q of b) {
      const d = Math.hypot(p.x - q.x, p.y - q.y);
      if (d < nearest) nearest = d;
    }
    if (nearest < px) close++;
  }
  return close / a.length > PAIR_CLEARANCE_FRACTION;
}

/**
 * B12: every earlier pass in this module only ever grows a bend until its
 * own predicate passes, then stops - so the bend a route ends up with is the
 * sum of whatever each pass independently decided it needed, not the
 * smallest bend that satisfies all of them at once. This runs last and
 * bisects each edge's committed bend back toward zero, re-testing the same
 * real clearance predicates those passes enforced at every candidate:
 *
 * - path clearance vs. every non-endpoint box/note (`clearObstaclesOnEveryRoute`'s
 *   own check, `polylineHitsBox` against the real circular arc);
 * - the label, at the exact `t` `placeLabels` committed it to, still clear of
 *   every non-endpoint shape and every other edge's own placed label;
 * - no *increase* in `growBendForLabelSquish`'s squish fraction - shrinking
 *   can't be allowed to hand back a squish fix that pass already paid for,
 *   mirroring the "never give back an obstacle clearance" rule that pass
 *   itself already follows;
 * - clear of every other edge's own arc by `arcsTooClose`'s margin, so
 *   shrinking one half of a `fanSharedPairs` pair (or a lane-separated
 *   sibling) can never re-collide it with the other.
 *
 * Bisection, not a closed form: the search only needs the invariant that
 * `hi` always clears, so a non-monotonic clearance function (the same
 * "can graze at one sag and clear again at a larger one" `growBendClear`
 * already documents) is safe here too - it just may not land on the
 * global minimum, only *a* bend no worse than what was committed. An edge
 * whose committed bend does not actually pass every predicate (the
 * fallback "closest attempt" path some earlier pass can leave behind) is
 * left alone rather than bisected against a predicate it never satisfied.
 */
function minimizeBends(
  edges: IREdge[],
  byId: Map<string, AbsShape>,
  shapes: AbsShape[],
  routes: Map<string, EdgeRoute>,
): void {
  const blockerPool = shapes.filter((s) => s.kind === "box" || s.kind === "note");
  const snapshot = new Map<string, { bend: number; labelBox?: LabelBox }>();
  for (const edge of edges) {
    const r = routes.get(edge.id);
    snapshot.set(edge.id, { bend: r?.bend ?? 0, ...(r?.labelBox ? { labelBox: r.labelBox } : {}) });
  }

  for (const edge of edges) {
    const route = routes.get(edge.id);
    if (!route || route.bend === 0) continue;
    // `placeLabels` slides a label off the arc's own midpoint only when the
    // midpoint itself was not clear - `approxLabelBox` at that t is a
    // parabola standing in for tldraw's real circular arc (this module's own
    // header), and that approximation gets less trustworthy the further t
    // sits from the midpoint it was validated at. Shrinking the bend on top
    // of an already-slid label risks a false-clear this model can't see
    // (confirmed against c4-container.tldsl.jsx's `staff -> mainframe`,
    // labelPosition 0.2 - measured, not guessed), so leave those as the
    // earlier passes committed them.
    if (route.labelPosition !== undefined) continue;
    const from = byId.get(edge.from);
    const to = byId.get(edge.to);
    if (!from || !to) continue;

    const blockers = blockerPool.filter((s) => s.id !== from.id && s.id !== to.id);
    const startAnchor = route.startAnchor;
    const endAnchor = route.endAnchor;
    const start = terminalPoint(from, startAnchor, to);
    const end = terminalPoint(to, endAnchor, from);
    const t = 0.5;

    const otherLabelBoxes: LabelBox[] = [];
    const siblingArcs: Point[][] = [];
    for (const other of edges) {
      if (other.id === edge.id) continue;
      const s = snapshot.get(other.id);
      if (!s) continue;
      if (s.labelBox) otherLabelBoxes.push(s.labelBox);
      if (s.bend === 0) continue;
      const oFrom = byId.get(other.from);
      const oTo = byId.get(other.to);
      if (!oFrom || !oTo) continue;
      const oRoute = routes.get(other.id);
      const oStart = terminalPoint(oFrom, oRoute?.startAnchor, oTo);
      const oEnd = terminalPoint(oTo, oRoute?.endAnchor, oFrom);
      siblingArcs.push(arcPolyline(oStart, oEnd, s.bend));
    }

    const marginBlockers = blockers.map((b) => inflateShape(b, CLEAR_MARGIN));
    const committedSquish = squishFraction(arcPolyline(start, end, route.bend), edge);

    // The same `CLEAR_MARGIN` the candidate/lane pass itself budgets for
    // (see `requiredSag`) is applied on every check here too, not just the
    // literal zero-margin hit test `clearObstaclesOnEveryRoute` uses to
    // decide whether to grow at all - a bisection actively hunts for the
    // tightest passing value, and without this margin it will happily land
    // an arc or a label close enough to graze a shape at the render's own
    // sampling/rounding, not just at this module's.
    const clears = (bend: number): boolean => {
      const path = arcPolyline(start, end, bend);
      if (marginBlockers.some((b) => polylineHitsBox(path, b))) return false;
      if (siblingArcs.some((sp) => arcsTooClose(path, sp, PAIR_CLEARANCE_PX))) return false;
      if (edge.label !== undefined) {
        if (squishFraction(path, edge) > committedSquish + 1e-6) return false;
        const box = approxLabelBox(edge, byId, bend, startAnchor, endAnchor, t);
        if (box !== null) {
          const inflated = inflate(box, CLEAR_MARGIN);
          if (blockers.some((b) => boxesOverlap(inflated, b))) return false;
          const inflatedForLabels = inflate(box, MINIMIZE_LABEL_MARGIN);
          if (otherLabelBoxes.some((o) => boxesOverlap(inflatedForLabels, o))) return false;
        }
      }
      return true;
    };

    if (!clears(route.bend)) continue;

    const sign = Math.sign(route.bend);
    if (clears(0)) {
      applyMinimizedBend(edge, byId, routes, snapshot, route, 0, t);
      continue;
    }

    // Straight (bend 0) doesn't clear, and tldraw itself renders anything
    // under MIN_BEND as straight - so the real floor here is MIN_BEND, not 0.
    let lo = MIN_BEND;
    let hi = Math.abs(route.bend);
    for (let i = 0; i < MINIMIZE_ROUNDS; i++) {
      const mid = (lo + hi) / 2;
      if (clears(sign * mid)) hi = mid;
      else lo = mid;
    }
    // `hi` is proven safe by the loop invariant above; rounding it to the
    // module's usual one-decimal precision is not, since a bisection can
    // land arbitrarily close to the true boundary - verify the rounded
    // value and fall back to the unrounded (but proven-safe) `hi` if
    // rounding happened to cross back over it.
    const rounded = round1(sign * hi);
    const newBend = clears(rounded) ? rounded : sign * hi;
    if (Math.abs(route.bend) - Math.abs(newBend) >= MINIMIZE_MEANINGFUL_PX) {
      applyMinimizedBend(edge, byId, routes, snapshot, route, newBend, t);
    }
  }
}

/** `s` grown by `margin` on every side - same Minkowski-sum idea `inflate` applies to a `LabelBox`, for the `AbsShape` blockers a path clearance check tests against. */
function inflateShape(s: AbsShape, margin: number): AbsShape {
  return { ...s, x: s.x - margin, y: s.y - margin, w: s.w + 2 * margin, h: s.h + 2 * margin };
}

/**
 * Commits a `minimizeBends` result: the new bend, and the label box
 * recomputed at the same `t` `placeLabels` had already chosen. Also updates
 * `snapshot` - the same source `otherLabelBoxes`/`siblingArcs` read for every
 * edge processed after this one - so two edges sharing a pair (or just
 * sitting close together) shrink against each other's *actual* new position,
 * not the one both started the pass at. Processing edges against a frozen
 * snapshot for the whole pass would let two labels that were fine at their
 * starting bends both independently shrink toward the same shrunk-arc
 * midpoint and land on each other, since neither one's own check ever sees
 * the other's move.
 */
function applyMinimizedBend(
  edge: IREdge,
  byId: Map<string, AbsShape>,
  routes: Map<string, EdgeRoute>,
  snapshot: Map<string, { bend: number; labelBox?: LabelBox }>,
  route: EdgeRoute,
  bend: number,
  t: number,
): void {
  const box =
    edge.label !== undefined ? approxLabelBox(edge, byId, bend, route.startAnchor, route.endAnchor, t) : null;
  routes.set(edge.id, { ...route, bend, ...(box ? { labelBox: box } : {}) });
  snapshot.set(edge.id, { bend, ...(box ? { labelBox: box } : {}) });
}

/**
 * The one growth loop every path-obstacle-avoiding bend in this module
 * shares: starting from `initialBend`, tries each sign in `signs` (typically
 * just the side a candidate/fan/lane pass already committed to, or both when
 * nothing has picked a side yet - the old `solveDetour`'s job) and grows the
 * sag a round at a time. Not monotone - the circular arc can graze an
 * obstacle at one sag and clear it again at a larger one - so a failing
 * round doesn't stop the search, only the round cap and the chord-length cap
 * do. If nothing fully clears within the cap, keeps whichever attempt hit
 * the fewest obstacles (`violationCount`, ties to the smaller sag), which is
 * never worse than leaving `initialBend` alone.
 *
 * `useAnalyticJump` picks the step: path clearance (`clearObstaclesOnEveryRoute`)
 * has a closed form for what a *box* in the way needs - the parabola's own
 * lower-bound estimate (`requiredDetourSag`, which the real circular arc
 * always beats, so the loop re-tests and grows again) - and jumping straight
 * to it converges in far fewer rounds than a fixed step would. A *label*
 * clearing a shape has no such formula (how far a bend has to grow before a
 * wide rectangle slides off another is not a closed form the way a line
 * clearing a box's corners is), so `placeLabels`'s call leaves this off and
 * crawls `GROW_STEP` at a time - jumping by the path's own estimate there
 * would either overshoot with nothing to aim at, or - worse - if the
 * anchor-blind label geometry (see `placeLabels`'s own header) happens to
 * graze a box's *line* too, jump straight past the chord-length cap on a
 * problem the label crawl was never trying to solve.
 */
function growBendClear(
  edge: IREdge,
  initialBend: number,
  byId: Map<string, AbsShape>,
  blockerPool: AbsShape[],
  otherLabelBoxes: LabelBox[],
  signs: readonly (1 | -1)[],
  startAnchor?: Point,
  endAnchor?: Point,
  useAnalyticJump = true,
  /** Overrides the chord-length/no-cap default - `growBendForLabelSquish` passes a modest fraction of the chord so unsquishing a label can never buy a near-semicircle (B12). */
  sagCap?: number,
  /** Track the closest attempt instead of only a full clear, independent of `useAnalyticJump`'s step size - `growBendForLabelSquish` opts in (see its own call) so a capped search still keeps whatever partial squish relief it found; the other two callers keep their documented all-or-nothing/analytic behaviour. */
  partialCredit = useAnalyticJump,
  /** Overrides `GROW_STEP` for the fixed-step crawl - a modest `sagCap` needs a proportionally finer step so a short budget still gets several samples instead of one or two. */
  stepOverride?: number,
): number {
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  if (!from || !to) return initialBend;
  const blockers = blockerPool.filter((s) => s.id !== from.id && s.id !== to.id);

  let best = initialBend;
  let bestHits = violationCount(edge, initialBend, byId, blockers, otherLabelBoxes, startAnchor, endAnchor);
  if (bestHits === 0) return initialBend;

  const start = terminalPoint(from, startAnchor, to);
  const end = terminalPoint(to, endAnchor, from);
  // The chord-length cap only means something for the path-clearance case,
  // where `start`/`end` are the edge's real terminals: a detour bigger than
  // the chord itself has swung past pointless. `placeLabels`'s call has no
  // such cap (its original fixed-step loop never had one either) - `start`/
  // `end` there now come from the edge's own real anchor (or the same
  // ray-toward-the-other-centre fallback every unrouted edge gets) the same
  // way every other caller's do (B5's flagged bug, fixed for B9): a pair of
  // shapes close enough together that this chord is short can still
  // truncate the search before the label actually clears, which is exactly
  // why this branch has no cap at all.
  const cap = sagCap ?? (useAnalyticJump ? Math.hypot(end.x - start.x, end.y - start.y) : Infinity);
  if (cap < 1) return initialBend;

  for (const sign of signs) {
    let sag = Math.abs(initialBend);
    for (let round = 0; round < GROW_MAX_ROUNDS; round++) {
      // Grow before testing - `sag` at loop entry is `initialBend`'s own sag,
      // whose "does it clear" result is already known (`bestHits`, above), so
      // testing it again here would waste a round.
      if (useAnalyticJump) {
        const path = arcPolyline(start, end, sign * sag);
        const boxHits = blockers.filter((b) => polylineHitsBox(path, b));
        const need = boxHits.length > 0 ? requiredDetourSag(start, end, sign, boxHits) : 0;
        sag = Math.max(need, sag + GROW_STEP);
      } else {
        sag += stepOverride ?? GROW_STEP;
      }
      if (sag > cap) break;

      const bend = round1(sign * sag);
      const hits = violationCount(edge, bend, byId, blockers, otherLabelBoxes, startAnchor, endAnchor);
      // The path case keeps the best partial attempt when nothing fully
      // clears - always an improvement over `initialBend`'s own (nonzero)
      // hit count, the old `solveDetour`'s "give up, leave it straight"
      // replaced by "grew but still not perfect". The label case keeps the
      // original loop's all-or-nothing instead: a "hits" count that also
      // counts path obstacles (`violationCount`) can sit at the same
      // nonzero floor for every bend it tries - e.g. two shapes overlapping
      // so `bodyExitPoint` starts *inside* the neighbour it's meant to
      // clear, which no bend fixes - and a partial credit there would
      // relocate the label on the strength of a path hit `placeLabels`
      // never asked it to fix, not real label progress.
      if (partialCredit) {
        if (hits < bestHits || (hits === bestHits && Math.abs(bend) < Math.abs(best))) {
          bestHits = hits;
          best = bend;
        }
      } else if (hits === 0) {
        best = bend;
      }
      if (hits === 0) {
        // The label-growth case (`useAnalyticJump` off) stops at the first
        // side that clears, same as `placeLabels`'s original loop: its
        // "clear" is the parabola approximation `search`'s own scoring
        // already trusts, so exploring the *other* side too - hunting for a
        // smaller sag the way the path case rightly does - only risks
        // trading a value that approximation and the real render agree on
        // for one where they happen to disagree.
        if (!useAnalyticJump) return best;
        break;
      }
    }
  }
  return best;
}

/**
 * Path-obstacle hits, plus (if `edge` is labelled) a flat penalty each for a
 * still-uncleared label-over-shape or label-over-label - used only by
 * `growBendClear` to rank partial attempts when nothing fully clears within
 * its round/chord-length cap, so it can keep the closest instead of giving up.
 */
function violationCount(
  edge: IREdge,
  bend: number,
  byId: Map<string, AbsShape>,
  blockers: AbsShape[],
  otherLabelBoxes: LabelBox[],
  startAnchor?: Point,
  endAnchor?: Point,
): number {
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  if (!from || !to) return 0;
  const start = terminalPoint(from, startAnchor, to);
  const end = terminalPoint(to, endAnchor, from);
  const path = arcPolyline(start, end, bend);
  let hits = blockers.filter((b) => polylineHitsBox(path, b)).length;
  if (edge.label !== undefined) {
    const box = approxLabelBox(edge, byId, bend, startAnchor, endAnchor);
    if (box !== null) {
      if (blockers.some((b) => boxesOverlap(box, b))) hits += 1;
      if (otherLabelBoxes.some((o) => boxesOverlap(inflate(box, CLEAR_MARGIN), o))) hits += 1;
    }
    // A soft violation, scaled well under 1 so it only ever breaks a tie
    // between bends that already agree on every hard (obstacle/label)
    // count above - `growBendForLabelSquish` is the only caller that starts
    // from a nonzero value here, and it must never trade away an obstacle
    // clearance `clearObstaclesOnEveryRoute` already settled for less squish.
    hits += squishFraction(path, edge) * 0.5;
  }
  return hits;
}

/**
 * How far short this bend's rendered arc bounding box falls of the width
 * tldraw's own `arrowLabel.ts` needs to draw `edge`'s label on as few lines
 * as a same-container sibling edge would get, as a fraction of that target
 * (`0` = not squished, approaching `1` = nowhere close). Mirrors *both* of
 * `arrowLabel.ts`'s branches, not just the one a bend can influence: once a
 * bend has pushed the arc's bounding box taller than it is wide, tldraw
 * switches to its other branch, a fixed `16 * fontSize` cap that doesn't
 * depend on the arc's geometry at all - reporting that branch as "0
 * violation" just because the bend happened to cross over would let a bend
 * that fixed nothing read as fixed (confirmed against a purely horizontal
 * reciprocal pair, where a bend moves the bounding box's height but never
 * its width - growth has to be a genuine no-op there, not a false "clear").
 */
function squishFraction(path: Point[], edge: IREdge): number {
  if (edge.label === undefined || path.length === 0) return 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of path) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const w = maxX - minX;
  const h = maxY - minY;
  const natural = arrowLabelWidth(edge.label, edge);
  if (w > h) {
    // tldraw's own formula floors the squished width at `min(natural, 64)`
    // (`Math.max(Math.min(w, margin), ...)` in `arrowLabel.ts`) - a label
    // already narrower than the squish margin renders at its natural width
    // no matter how short the arrow's body is, so it's never a violation.
    if (natural <= 64) return 0;
    const target = natural + SQUISH_MARGIN;
    if (target <= w) return 0;
    return Math.min(0.99, (target - w) / target);
  }
  const cap = 16 * ARROW_LABEL_FONT_PX[edge.size ?? DEFAULT_FONT_SIZE];
  if (natural <= cap) return 0;
  return Math.min(0.99, (natural - cap) / natural);
}

/**
 * Parabola estimate of the sag needed to put every corner of `hits` (inflated
 * by the margin) on the inside of the arc. tldraw's circular arc bulges
 * further from the chord than the parabola does at every `t`, so this is a
 * lower bound the real arc always beats - the caller re-tests and grows again.
 */
function requiredDetourSag(start: Point, end: Point, sign: 1 | -1, hits: AbsShape[]): number {
  const u = unit(start, end);
  const perp: Point = { x: -u.y, y: u.x };
  const len = Math.hypot(end.x - start.x, end.y - start.y);

  let need = 0;
  for (const s of hits) {
    const xs = [s.x - DETOUR_MARGIN, s.x + s.w + DETOUR_MARGIN];
    const ys = [s.y - DETOUR_MARGIN, s.y + s.h + DETOUR_MARGIN];
    for (const cx of xs) {
      for (const cy of ys) {
        const dx = cx - start.x;
        const dy = cy - start.y;
        const off = (dx * perp.x + dy * perp.y) * sign;
        if (off <= 0) continue;
        const raw = (dx * u.x + dy * u.y) / len;
        const t = Math.min(0.95, Math.max(0.05, raw));
        need = Math.max(need, off / (4 * t * (1 - t)));
      }
    }
  }
  return need;
}

/** The arc `start -> end` with this bend, sampled as a polyline. */
function arcPolyline(start: Point, end: Point, bend: number): Point[] {
  const at = arcSampler(start, end, bend);
  const points: Point[] = [];
  for (let i = 0; i <= DETOUR_SAMPLES; i++) points.push(at(i / DETOUR_SAMPLES));
  return points;
}

function polylineHitsBox(path: Point[], s: AbsShape): boolean {
  for (let i = 1; i < path.length; i++) {
    if (segmentHitsBox(path[i - 1]!, path[i]!, s)) return true;
  }
  return false;
}

/**
 * `t -> point` along the circular arc tldraw renders for `bend` (the signed
 * sagitta at the midpoint, measured along `(-u.y, u.x)`). Uniform in angle,
 * which for a circle is uniform in arc length.
 */
function arcSampler(a: Point, b: Point, bend: number): (t: number) => Point {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  const lerp = (t: number): Point => ({ x: a.x + dx * t, y: a.y + dy * t });
  if (len === 0 || Math.abs(bend) < 0.5) return lerp;

  const perp: Point = { x: -dy / len, y: dx / len };
  const radius = (len * len) / 4 / (2 * Math.abs(bend)) + Math.abs(bend) / 2;
  const centre: Point = {
    x: a.x + dx / 2 + perp.x * (bend - Math.sign(bend) * radius),
    y: a.y + dy / 2 + perp.y * (bend - Math.sign(bend) * radius),
  };
  const a0 = Math.atan2(a.y - centre.y, a.x - centre.x);
  const a1 = Math.atan2(b.y - centre.y, b.x - centre.x);
  let delta = a1 - a0;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta <= -Math.PI) delta += 2 * Math.PI;

  // Two sweeps join the endpoints; keep the one that runs through the apex.
  const apex: Point = { x: a.x + dx / 2 + perp.x * bend, y: a.y + dy / 2 + perp.y * bend };
  const distToApex = (d: number): number => {
    const ang = a0 + d / 2;
    return Math.hypot(centre.x + radius * Math.cos(ang) - apex.x, centre.y + radius * Math.sin(ang) - apex.y);
  };
  const other = delta > 0 ? delta - 2 * Math.PI : delta + 2 * Math.PI;
  const sweep = distToApex(other) < distToApex(delta) ? other : delta;

  return (t: number) => {
    const ang = a0 + sweep * t;
    return { x: centre.x + radius * Math.cos(ang), y: centre.y + radius * Math.sin(ang) };
  };
}

/** Liang-Barsky segment/rect clip - same rule `tools/arrow-truth.mts` counts crossings with. */
function segmentHitsBox(p: Point, q: Point, s: AbsShape): boolean {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const checks: [number, number][] = [
    [-dx, p.x - s.x],
    [dx, s.x + s.w - p.x],
    [-dy, p.y - s.y],
    [dy, s.y + s.h - p.y],
  ];
  let t0 = 0;
  let t1 = 1;
  for (const [pk, qk] of checks) {
    if (pk === 0) {
      if (qk < 0) return false;
      continue;
    }
    const r = qk / pk;
    if (pk < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 <= t1;
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

function finalizeRoute(candidate: RouteCandidate, assignedRank: number): EdgeRoute {
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

  // A sag under tldraw's MIN_ARROW_BEND renders straight, but the face anchors
  // still matter: they are what lifts the chord off the boxes in between.
  const bend = round1(sag * sign);
  const anchor = normalizedAnchor(axis, side);
  return { bend: Math.abs(bend) < MIN_BEND ? 0 : bend, startAnchor: anchor, endAnchor: { ...anchor } };
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
      shapes.push({
        id: child.id,
        kind: child.kind,
        parentId,
        x: absX,
        y: absY,
        w: child.w,
        h: child.h,
        ...(child.kind === "box" && child.geo !== undefined ? { geo: child.geo } : {}),
      });
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
