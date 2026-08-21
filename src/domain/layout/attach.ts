/**
 * `attachNotes`: places every `<Note on="...">` / `<Sticky on="...">` beside
 * the element it annotates, after `hybridLayout`'s normal flow/auto/free
 * placement has finished. Pure and stateless - no `node:*`, no `infra/`, no
 * `app/` imports.
 *
 * An attached note is excluded from its container's flow in `stack.ts` (it
 * is still sized there, just not arranged or counted toward a bounding
 * box), so by the time this runs it is a correctly-sized, wrongly-placed
 * leaf sitting wherever `sizeElement` parked it (0,0 relative to its
 * declared parent). This pass:
 *
 *  1. Walks the positioned tree once to record every box/frame/note's
 *     absolute rect (child `x`/`y` are parent-relative; frames nest).
 *  2. Removes every attached note from wherever it was declared and
 *     re-parents it to the document root. Deliberate, not a bug: tldraw
 *     frames clip their children, so a note parented to a frame and placed
 *     beside that frame (outside its bounds) would be invisible.
 *  3. Picks a side (right/below/left/above, in that preference order) 24px
 *     off the target, centred on the target on the other axis, rejecting
 *     any candidate with a negative x or y and preferring the first
 *     zero-overlap candidate against every other absolute rect in the
 *     document (excluding the note itself and its target).
 *
 * `on` naming an `<edge>` resolves to a degenerate 1x1 rect at the midpoint
 * of the two endpoint shapes' absolute centres. This deliberately ignores
 * the arc bow `routing.ts` (T3-T5) may add to a same-axis skip edge - a
 * cheap approximation that's fine because the note only has to land near
 * the edge, not trace its exact curve.
 *
 * Canvas bounds are computed downstream from whatever shapes exist (there
 * is no `w`/`h` stored on `IRDoc`), so re-parenting a note with its final
 * absolute rect is all that's needed for it to count.
 */

import type {
  IRDocPositioned,
  IREdge,
  IRElementPositioned,
  IRNotePositioned,
} from "../ir/index.js";

const GAP = 24;

type Rect = { x: number; y: number; w: number; h: number };
type Side = "right" | "below" | "left" | "above";
const SIDES: readonly Side[] = ["right", "below", "left", "above"];

export function attachNotes(doc: IRDocPositioned): IRDocPositioned {
  const rectById = collectRects(doc);
  const edges = collectEdges(doc.children);
  const { children: stripped, removed } = stripAttached(doc.children);
  if (removed.length === 0) return doc;

  const obstacles = new Map(rectById);
  for (const note of removed) obstacles.delete(note.id);

  const placed: IRNotePositioned[] = [];
  for (const note of removed) {
    const target = resolveTarget(note.on!, rectById, edges);
    if (target === undefined) {
      throw new Error(
        `attach: note '${note.id}' has 'on' target '${note.on}' that does not resolve ` +
          `(should have been caught at IR validation)`,
      );
    }
    const rect = pickPlacement(note, target.rect, target.id, obstacles);
    const note2: IRNotePositioned = { ...note, x: rect.x, y: rect.y };
    placed.push(note2);
    obstacles.set(note.id, rect);
  }

  return { ...doc, children: [...stripped, ...placed] };
}

/** Every box/frame/note's absolute rect, keyed by id (frames nest, child coordinates are parent-relative). */
function collectRects(doc: IRDocPositioned): Map<string, Rect> {
  const rects = new Map<string, Rect>();
  function visit(children: readonly IRElementPositioned[], offX: number, offY: number): void {
    for (const c of children) {
      if (c.kind === "edge" || c.kind === "doc") continue;
      const x = offX + c.x;
      const y = offY + c.y;
      rects.set(c.id, { x, y, w: c.w, h: c.h });
      if (c.kind === "frame") visit(c.children, x, y);
    }
  }
  visit(doc.children, 0, 0);
  return rects;
}

function collectEdges(children: readonly IRElementPositioned[], out: IREdge[] = []): IREdge[] {
  for (const c of children) {
    if (c.kind === "edge") {
      out.push(c);
      continue;
    }
    if (c.kind === "frame") collectEdges(c.children, out);
  }
  return out;
}

/** Removes every note with `on` set from the tree, wherever declared, in document order. */
function stripAttached(
  children: readonly IRElementPositioned[],
): { children: IRElementPositioned[]; removed: IRNotePositioned[] } {
  const removed: IRNotePositioned[] = [];
  const kept: IRElementPositioned[] = [];
  for (const c of children) {
    if (c.kind === "note" && c.on !== undefined) {
      removed.push(c);
      continue;
    }
    if (c.kind === "frame") {
      const sub = stripAttached(c.children);
      removed.push(...sub.removed);
      kept.push({ ...c, children: sub.children });
      continue;
    }
    kept.push(c);
  }
  return { children: kept, removed };
}

function resolveTarget(
  on: string,
  rectById: ReadonlyMap<string, Rect>,
  edges: readonly IREdge[],
): { rect: Rect; id: string | undefined } | undefined {
  const direct = rectById.get(on);
  if (direct !== undefined) return { rect: direct, id: on };
  const edge = edges.find((e) => e.id === on);
  if (edge === undefined) return undefined;
  const from = rectById.get(edge.from);
  const to = rectById.get(edge.to);
  if (from === undefined || to === undefined) return undefined;
  const cx = (from.x + from.w / 2 + to.x + to.w / 2) / 2;
  const cy = (from.y + from.h / 2 + to.y + to.h / 2) / 2;
  return { rect: { x: cx, y: cy, w: 1, h: 1 }, id: undefined };
}

function candidateRects(note: { w: number; h: number }, target: Rect): Record<Side, Rect> {
  const centerX = target.x + (target.w - note.w) / 2;
  const centerY = target.y + (target.h - note.h) / 2;
  return {
    right: { x: target.x + target.w + GAP, y: centerY, w: note.w, h: note.h },
    below: { x: centerX, y: target.y + target.h + GAP, w: note.w, h: note.h },
    left: { x: target.x - GAP - note.w, y: centerY, w: note.w, h: note.h },
    above: { x: centerX, y: target.y - GAP - note.h, w: note.w, h: note.h },
  };
}

function pickPlacement(
  note: { id: string; w: number; h: number },
  target: Rect,
  targetId: string | undefined,
  obstacles: ReadonlyMap<string, Rect>,
): Rect {
  const candidates = candidateRects(note, target);
  const exclude = new Set<string>([note.id, ...(targetId !== undefined ? [targetId] : [])]);

  const viable = SIDES.map((side) => candidates[side]).filter((r) => r.x >= 0 && r.y >= 0);
  let best: { rect: Rect; overlap: number } | undefined;
  for (const rect of viable) {
    const overlap = overlapArea(rect, obstacles, exclude);
    if (overlap === 0) return rect;
    if (best === undefined || overlap < best.overlap) best = { rect, overlap };
  }
  if (best !== undefined) return best.rect;

  // Every candidate had a negative coordinate (a small target near the
  // origin with a note taller/wider than it). `right`'s x is always >= 0
  // when target.x/w are, so clamp its y instead of inventing a new side.
  const right = candidates.right;
  return { ...right, y: Math.max(0, right.y) };
}

function overlapArea(rect: Rect, obstacles: ReadonlyMap<string, Rect>, exclude: ReadonlySet<string>): number {
  let total = 0;
  for (const [id, r] of obstacles) {
    if (exclude.has(id)) continue;
    const w = Math.max(0, Math.min(rect.x + rect.w, r.x + r.w) - Math.max(rect.x, r.x));
    const h = Math.max(0, Math.min(rect.y + rect.h, r.y + r.h) - Math.max(rect.y, r.y));
    total += w * h;
  }
  return total;
}
