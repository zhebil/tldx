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
    routes.set(candidate.edgeId, finalizeRoute(candidate, rankOf.get(candidate.edgeId) ?? 0));
  }

  fanSharedPairs(otherEdges, byId, shapes, routes);

  clearObstaclesOnEveryRoute(otherEdges, byId, shapes, routes);

  placeLabels(edges, byId, shapes, routes);

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
        .map((o) => approxLabelBox(o.edge, byId, routes.get(o.edge.id)?.bend ?? 0))
        .filter((b): b is LabelBox => b !== null);
      const signs: (1 | -1)[] = slot.bend !== 0 ? [Math.sign(slot.bend) as 1 | -1] : [1, -1];

      const grownBend = growBendClear(slot.edge, slot.bend, byId, blockerPool, otherLabelBoxes, signs, undefined, false);
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
  anchor?: Point,
): boolean {
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  if (!from || !to) return true;
  const start = terminalPoint(from, anchor, to);
  const end = terminalPoint(to, anchor, from);
  const blockers = blockerPool.filter((s) => s.id !== from.id && s.id !== to.id);
  const path = arcPolyline(start, end, bend);
  if (blockers.some((b) => polylineHitsBox(path, b))) return false;

  if (edge.label !== undefined) {
    const box = approxLabelBox(edge, byId, bend, anchor);
    // Inflated by `CLEAR_MARGIN`: the model this checks against is the same
    // approximation that missed the original overprint, so a near-miss here
    // is treated as a miss and this step is rejected in favour of a smaller one.
    if (box !== null && otherLabelBoxes.some((o) => boxesOverlap(inflate(box, CLEAR_MARGIN), o))) return false;
  }
  return true;
}

/** Approximate label box at an edge's own midpoint for a given `bend` - `null` for an unlabelled or self edge. */
function approxLabelBox(edge: IREdge, byId: Map<string, AbsShape>, bend: number, anchor?: Point): LabelBox | null {
  if (!edge.label || edge.from === edge.to) return null;
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  if (!from || !to) return null;
  const start = terminalPoint(from, anchor, to);
  const end = terminalPoint(to, anchor, from);
  const u = unit(start, end);
  const perp: Point = { x: -u.y, y: u.x };
  const w = arrowLabelWidth(edge.label, edge) + 2 * ARROW_LABEL_PADDING;
  const h = arrowLabelLineHeight(edge) + 2 * ARROW_LABEL_PADDING;
  // At the arc's own midpoint (t=0.5) the parabola's sag reduces to `bend` exactly.
  const cx = start.x + (end.x - start.x) * 0.5 + perp.x * bend;
  const cy = start.y + (end.y - start.y) * 0.5 + perp.y * bend;
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
    const anchor = route?.startAnchor;
    if (edgeBendClearsObstacles(edge, existing, byId, blockerPool, [], anchor)) continue;

    if (existing === 0) {
      const bend = growBendClear(edge, existing, byId, blockerPool, [], [1, -1], anchor);
      if (bend !== existing) routes.set(edge.id, { ...(route ?? { bend: 0 }), bend });
      continue;
    }

    const committed = Math.sign(existing) as 1 | -1;
    let bend = growBendClear(edge, existing, byId, blockerPool, [], [committed], anchor);
    if (bend === existing) {
      bend = growBendClear(edge, existing, byId, blockerPool, [], [committed === 1 ? -1 : 1], anchor);
    }
    if (bend !== existing) routes.set(edge.id, { ...route, bend });
  }
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
  anchor?: Point,
  useAnalyticJump = true,
): number {
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  if (!from || !to) return initialBend;
  const blockers = blockerPool.filter((s) => s.id !== from.id && s.id !== to.id);

  let best = initialBend;
  let bestHits = violationCount(edge, initialBend, byId, blockers, otherLabelBoxes, anchor);
  if (bestHits === 0) return initialBend;

  const start = terminalPoint(from, anchor, to);
  const end = terminalPoint(to, anchor, from);
  // The chord-length cap only means something for the path-clearance case,
  // where `start`/`end` are the edge's real terminals: a detour bigger than
  // the chord itself has swung past pointless. `placeLabels`'s call has no
  // such cap (its original fixed-step loop never had one either) - `start`/
  // `end` there are `bodyExitPoint`'s anchor-blind fallback (see this
  // function's own header), which for e.g. a vertically-stacked pair with an
  // explicit left/right anchor collapses to a near-zero-width chord that
  // would truncate the search long before the label actually clears.
  const cap = useAnalyticJump ? Math.hypot(end.x - start.x, end.y - start.y) : Infinity;
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
        sag += GROW_STEP;
      }
      if (sag > cap) break;

      const bend = round1(sign * sag);
      const hits = violationCount(edge, bend, byId, blockers, otherLabelBoxes, anchor);
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
      if (useAnalyticJump) {
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
  anchor?: Point,
): number {
  const from = byId.get(edge.from);
  const to = byId.get(edge.to);
  if (!from || !to) return 0;
  const start = terminalPoint(from, anchor, to);
  const end = terminalPoint(to, anchor, from);
  const path = arcPolyline(start, end, bend);
  let hits = blockers.filter((b) => polylineHitsBox(path, b)).length;
  if (edge.label !== undefined) {
    const box = approxLabelBox(edge, byId, bend, anchor);
    if (box !== null) {
      if (blockers.some((b) => boxesOverlap(box, b))) hits += 1;
      if (otherLabelBoxes.some((o) => boxesOverlap(inflate(box, CLEAR_MARGIN), o))) hits += 1;
    }
  }
  return hits;
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
