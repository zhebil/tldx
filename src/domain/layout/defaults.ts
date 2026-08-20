/**
 * Shared layout heuristics consumed by both layout adapters
 * (`StubLayout` fake and `ElkLayoutAdapter` real). Sharing them keeps
 * `tldsl check` and `tldsl serve` producing identical scene JSON for the
 * same input - the contract is "no DOM, deterministic, identical sizes".
 *
 * The size estimators are intentionally generous upper bounds: tldraw's real
 * text metrics can differ slightly from our flat per-char estimate, but the
 * estimate is wide enough that labels don't clip in practice. Browser-side
 * re-measurement is deferred (issue tldsl-6ek out-of-scope).
 */

const AVG_CHAR_PX = 9;
const BOX_PAD_X = 24;
const BOX_PAD_Y = 16;
const BOX_LINE_H = 24;
const BOX_MIN_W = 120;
const BOX_MIN_H = 60;

const NOTE_LINE_H = 24;
const NOTE_MIN_W = 200;
const NOTE_MIN_H = 80;

/** Tldraw frame title chrome. The first row of children must clear it. */
export const FRAME_TITLE_PX = 32;
/** Inner padding inside a frame, applied uniformly except top (see below). */
export const FRAME_PAD_INNER = 32;
/** Top padding = chrome + inner so children don't sit under the title bar. */
export const FRAME_PAD_TOP = FRAME_TITLE_PX + FRAME_PAD_INNER;

export type Direction = "RIGHT" | "DOWN" | "LEFT" | "UP";
export const DIRECTIONS: readonly Direction[] = ["RIGHT", "DOWN", "LEFT", "UP"];
export const DEFAULT_DIRECTION: Direction = "RIGHT";

export function isDirection(s: string): s is Direction {
  return (DIRECTIONS as readonly string[]).includes(s);
}

export type LayoutMode = "row" | "col" | "grid" | "auto" | "free";
export const LAYOUT_MODES: readonly LayoutMode[] = ["row", "col", "grid", "auto", "free"];

export function isLayoutMode(s: string): s is LayoutMode {
  return (LAYOUT_MODES as readonly string[]).includes(s);
}

export type Align = "start" | "center" | "end";
export const ALIGNS: readonly Align[] = ["start", "center", "end"];
export const DEFAULT_ALIGN: Align = "center";

export function isAlign(s: string): s is Align {
  return (ALIGNS as readonly string[]).includes(s);
}

export function estimatedBoxSize(label: string | undefined): {
  w: number;
  h: number;
} {
  const text = label ?? "";
  const w = Math.max(BOX_MIN_W, text.length * AVG_CHAR_PX + BOX_PAD_X * 2);
  const h = Math.max(BOX_MIN_H, BOX_LINE_H + BOX_PAD_Y * 2);
  return { w, h };
}

export function estimatedNoteSize(): { w: number; h: number } {
  // Notes wrap; we don't know the wrap width, so use a fixed footprint. The
  // note's IR w/h is ignored at emit time anyway (tldraw fits stickies), but
  // layout still needs a rect to reserve space for routing.
  return { w: NOTE_MIN_W, h: Math.max(NOTE_MIN_H, NOTE_LINE_H + 32) };
}
