/**
 * Shared layout heuristics consumed by both layout adapters
 * (`StubLayout` fake and `ElkLayoutAdapter` real). Sharing them keeps
 * `tldsl check` and `tldsl serve` producing identical scene JSON for the
 * same input - the contract is "no DOM, deterministic, identical sizes".
 *
 * Box sizing is three passes against measured tldraw text metrics
 * (`glyph-metrics.ts`: per-glyph advance widths, 32px total label padding,
 * 29.69px line height): `fitBoxWidth` picks each label's natural, unwrapped
 * width, bounded by `BOX_ASPECT_TARGET` rather than a pixel cap so long
 * labels wrap onto more lines instead of growing arbitrarily wide;
 * `layoutContainer` (in `stack.ts`) then picks one shared width (`col`,
 * `grid`) or height (`row`) across a container's flowed boxes; and
 * `boxHeightForWidth` re-wraps each label to that shared width for its final
 * height. A real greedy wrap never splits a word mid-line. Browser-side
 * re-measurement is deferred (issue tldsl-6ek out-of-scope).
 */

import { textWidth } from "./glyph-metrics.js";

const BOX_PAD_Y = 16;
const BOX_MIN_W = 120;

/** tldraw's own box label padding, measured: every wrapped label reports labelW === shapeW - 32. */
const BOX_LABEL_PAD_X = 32;
/** Measured line height (29.69px), rounded up for integer geometry. */
const BOX_LINE_H = 30;
/**
 * Max width:height ratio a box may take before wrapping onto another line
 * instead. Tuned from renders: 4 forced every label in `sequence` onto two
 * lines, 6 keeps them all on one and shortens that diagram 23% - and no other
 * corpus file is sensitive to the value at all.
 */
export const BOX_ASPECT_TARGET = 6;

/** tldraw draws every sticky 200 wide and 200 tall before growY. */
export const NOTE_SIZE = 200;
const NOTE_PAD = 16;
const NOTE_CHAR_PX = 15;
const NOTE_LINE_H = 30;

/**
 * Tldraw draws the frame heading rect at y in [-30, -6] relative to the
 * frame's own top edge - outside the frame, not inside it. So this is the
 * clearance a frame needs *above* it, reserved only by a frame that contains
 * a nested frame.
 */
export const FRAME_TITLE_PX = 30;
/** Inner padding inside a frame, applied uniformly except top (see below). */
export const FRAME_PAD_INNER = 32;
/** Inner padding plus clearance for a nested frame's heading. */
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

/** Greedy word-wrap: rendered width of each resulting line, given a usable content width in px. */
function wrapLineWidths(text: string, maxContentW: number): number[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [0];

  const lineWidths: number[] = [];
  let curWords: string[] = [];
  for (const word of words) {
    const candidate = curWords.length === 0 ? word : `${curWords.join(" ")} ${word}`;
    if (curWords.length > 0 && textWidth(candidate) > maxContentW) {
      lineWidths.push(textWidth(curWords.join(" ")));
      curWords = [word];
    } else {
      curWords.push(word);
    }
  }
  lineWidths.push(textWidth(curWords.join(" ")));
  return lineWidths;
}

export function boxWidthForContent(contentW: number): number {
  return Math.max(BOX_MIN_W, Math.ceil(contentW) + BOX_LABEL_PAD_X);
}

export function boxHeightForWidth(label: string | undefined, w: number): number {
  const lines = wrapLineWidths(label ?? "", w - BOX_LABEL_PAD_X).length;
  return lines * BOX_LINE_H + BOX_PAD_Y * 2;
}

/**
 * The aspect-bounded natural width of a label: unwrapped width, unless that
 * would exceed `BOX_ASPECT_TARGET` times the height it implies, in which
 * case it wraps onto more lines instead. Width always comes from the
 * longest *resulting* line (never a raw search budget), so a label never
 * splits mid-word.
 */
export function fitBoxWidth(label: string | undefined, maxW?: number): number {
  const text = label ?? "";

  if (maxW !== undefined) {
    const budget = Math.max(1, maxW - BOX_LABEL_PAD_X);
    return boxWidthForContent(Math.max(...wrapLineWidths(text, budget)));
  }

  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
  const maxLines = Math.max(1, wordCount);
  const hiBudget = Math.max(1, Math.ceil(textWidth(text)));

  let lastW = boxWidthForContent(0);
  for (let n = 1; n <= maxLines; n++) {
    let lo = 1;
    let hi = hiBudget;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (wrapLineWidths(text, mid).length <= n) hi = mid;
      else lo = mid + 1;
    }
    const w = boxWidthForContent(Math.max(...wrapLineWidths(text, lo)));
    const h = n * BOX_LINE_H + BOX_PAD_Y * 2;
    lastW = w;
    if (w <= BOX_ASPECT_TARGET * h) return w;
  }
  return lastW;
}

export function estimatedBoxSize(
  label: string | undefined,
  maxW?: number,
): {
  w: number;
  h: number;
} {
  const w = fitBoxWidth(label, maxW);
  return { w, h: boxHeightForWidth(label, w) };
}

/**
 * A deliberately generous upper bound over a naive character wrap - real
 * tldraw text metrics wrap differently, but never past this reservation.
 * Emit turns the reserved height into `growY` so the drawn sticky matches.
 */
export function estimatedNoteSize(text: string | undefined): { w: number; h: number } {
  const perLine = Math.max(1, Math.floor((NOTE_SIZE - NOTE_PAD * 2) / NOTE_CHAR_PX));
  const lines = Math.ceil((text ?? "").length / perLine);
  return { w: NOTE_SIZE, h: Math.max(NOTE_SIZE, lines * NOTE_LINE_H + NOTE_PAD * 2) };
}
