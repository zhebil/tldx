/**
 * `attachNotes`: places every `<Note on="...">` / `<Sticky on="...">` beside
 * the element it annotates, after `hybridLayout`'s placement has finished.
 * `stack.ts` sizes an attached note but leaves it out of the flow, so it
 * arrives here correctly sized and parked at its parent's origin.
 *
 * Every attached note is re-parented to the document root. Deliberate: tldraw
 * frames clip their children, so a note parented to a frame but placed outside
 * that frame's bounds would be invisible. `on` naming an `<edge>` resolves to a
 * 1x1 rect at the midpoint of its endpoints' centres, ignoring any arc bow -
 * the note only has to land near the edge, not trace its curve.
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

function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/**
 * A note's initial candidate (24px off the target, centred on the other axis)
 * is only room if the target is isolated - when it sits inside a tightly
 * wrapped container, that spot is inside the container's footprint too. So
 * slide the candidate along the side's axis past whatever it still touches.
 * Bounded by `obstacles.size` pushes: each push clears at least the obstacle
 * that triggered it, so it cannot cycle.
 */
function pushClear(
  side: Side,
  initial: Rect,
  obstacles: ReadonlyMap<string, Rect>,
  exclude: ReadonlySet<string>,
): Rect {
  let rect = initial;
  const maxPushes = obstacles.size + 1;
  for (let i = 0; i < maxPushes; i++) {
    const blockers = [...obstacles.entries()]
      .filter(([id]) => !exclude.has(id))
      .map(([, r]) => r)
      .filter((r) => rectsOverlap(rect, r));
    if (blockers.length === 0) break;
    if (side === "right") {
      const x = Math.max(...blockers.map((r) => r.x + r.w + GAP));
      if (x <= rect.x) break;
      rect = { ...rect, x };
    } else if (side === "left") {
      const x = Math.min(...blockers.map((r) => r.x - GAP - rect.w));
      if (x >= rect.x) break;
      rect = { ...rect, x };
    } else if (side === "below") {
      const y = Math.max(...blockers.map((r) => r.y + r.h + GAP));
      if (y <= rect.y) break;
      rect = { ...rect, y };
    } else {
      const y = Math.min(...blockers.map((r) => r.y - GAP - rect.h));
      if (y >= rect.y) break;
      rect = { ...rect, y };
    }
  }
  return rect;
}

function pickPlacement(
  note: { id: string; w: number; h: number },
  target: Rect,
  targetId: string | undefined,
  obstacles: ReadonlyMap<string, Rect>,
): Rect {
  const candidates = candidateRects(note, target);
  const exclude = new Set<string>([note.id, ...(targetId !== undefined ? [targetId] : [])]);

  const pushed = SIDES.map((side) => pushClear(side, candidates[side], obstacles, exclude));
  const viable = pushed.filter((r) => r.x >= 0 && r.y >= 0);
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
  const right = pushed[0]!;
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
