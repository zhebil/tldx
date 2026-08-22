/**
 * Shared layout heuristics consumed by both layout adapters
 * (`StubLayout` fake and `ElkLayoutAdapter` real). Sharing them keeps
 * `tldsl check` and `tldsl serve` producing identical scene JSON for the
 * same input - the contract is "no DOM, deterministic, identical sizes".
 *
 * Box sizing is three passes against measured tldraw text metrics
 * (`glyph-metrics.ts`: per-(font, size) advance widths, `lineHeightPx`):
 * `fitBoxWidth` picks each label's natural, unwrapped width, bounded by
 * `BOX_ASPECT_TARGET` rather than a pixel cap so long labels wrap onto more
 * lines instead of growing arbitrarily wide; `layoutContainer` (in
 * `stack.ts`) then picks one shared width (`col`, `grid`) or height (`row`)
 * across a container's flowed boxes; and `boxHeightForWidth` re-wraps each
 * label to that shared width for its final height. A real greedy wrap never
 * splits a word mid-line. Browser-side re-measurement is deferred (issue
 * tldsl-6ek out-of-scope).
 */

import { fontScale, lineHeightPx, textWidth, type TextStyle } from "./glyph-metrics.js";
import type { StyleGeo } from "../ir/styles.js";

const BOX_PAD_Y = 16;
const BOX_MIN_W = 120;

/** tldraw's `LABEL_PADDING` - size-independent, so this stays a constant. Measured: every wrapped label reports labelW === shapeW - 32. */
const BOX_LABEL_PAD_X = 32;
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
function wrapLineWidths(text: string, maxContentW: number, ts?: TextStyle): number[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [0];

  const lineWidths: number[] = [];
  let curWords: string[] = [];
  for (const word of words) {
    const candidate = curWords.length === 0 ? word : `${curWords.join(" ")} ${word}`;
    if (curWords.length > 0 && textWidth(candidate, ts) > maxContentW) {
      lineWidths.push(textWidth(curWords.join(" "), ts));
      curWords = [word];
    } else {
      curWords.push(word);
    }
  }
  lineWidths.push(textWidth(curWords.join(" "), ts));
  return lineWidths;
}

export function boxWidthForContent(contentW: number): number {
  return Math.max(BOX_MIN_W, Math.ceil(contentW) + BOX_LABEL_PAD_X);
}

export function boxHeightForWidth(label: string | undefined, w: number, ts?: TextStyle): number {
  const lines = wrapLineWidths(label ?? "", w - BOX_LABEL_PAD_X, ts).length;
  return lines * lineHeightPx(ts) + BOX_PAD_Y * 2;
}

/**
 * The aspect-bounded natural width of a label: unwrapped width, unless that
 * would exceed `BOX_ASPECT_TARGET` times the height it implies, in which
 * case it wraps onto more lines instead. Width always comes from the
 * longest *resulting* line (never a raw search budget), so a label never
 * splits mid-word.
 */
export function fitBoxWidth(label: string | undefined, maxW?: number, ts?: TextStyle): number {
  const text = label ?? "";

  if (maxW !== undefined) {
    const budget = Math.max(1, maxW - BOX_LABEL_PAD_X);
    return boxWidthForContent(Math.max(...wrapLineWidths(text, budget, ts)));
  }

  const wordCount = text.split(/\s+/).filter((w) => w.length > 0).length;
  const maxLines = Math.max(1, wordCount);
  const hiBudget = Math.max(1, Math.ceil(textWidth(text, ts)));
  const lineH = lineHeightPx(ts);

  let lastW = boxWidthForContent(0);
  for (let n = 1; n <= maxLines; n++) {
    let lo = 1;
    let hi = hiBudget;
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (wrapLineWidths(text, mid, ts).length <= n) hi = mid;
      else lo = mid + 1;
    }
    const w = boxWidthForContent(Math.max(...wrapLineWidths(text, lo, ts)));
    const h = n * lineH + BOX_PAD_Y * 2;
    lastW = w;
    if (w <= BOX_ASPECT_TARGET * h) return w;
  }
  return lastW;
}

/** Rendered extent of `label` after greedy-wrapping it into a box `w` wide. */
export function labelExtent(label: string, w: number, ts?: TextStyle): { wl: number; hl: number } {
  const lines = wrapLineWidths(label, w - BOX_LABEL_PAD_X, ts);
  return { wl: Math.max(...lines), hl: lines.length * lineHeightPx(ts) };
}

export type BoxStyle = TextStyle & { geo?: StyleGeo };

type GeoModel = "rect" | "ellipse" | "diamond" | "triangle" | "arrow";

/**
 * Maps each of tldraw's 20 `geo` values to the outline model closest to its
 * label-containment shape. `hexagon`/`octagon`/`pentagon`/`heart` are
 * roomier than an ellipse and `star` is tighter than a diamond - both are
 * approximations, not exact fits.
 */
const GEO_MODEL: Record<StyleGeo, GeoModel> = {
  rectangle: "rect",
  "check-box": "rect",
  "x-box": "rect",
  cloud: "rect",
  ellipse: "ellipse",
  oval: "ellipse",
  hexagon: "ellipse",
  octagon: "ellipse",
  pentagon: "ellipse",
  heart: "ellipse",
  diamond: "diamond",
  rhombus: "diamond",
  "rhombus-2": "diamond",
  star: "diamond",
  trapezoid: "diamond",
  "arrow-up": "arrow",
  "arrow-down": "arrow",
  "arrow-left": "arrow",
  "arrow-right": "arrow",
  triangle: "triangle",
};

/**
 * How far the label overflows the outline, as a multiplier on the box: `1`
 * means it exactly fits. `a`/`b` are the label's width and height as
 * fractions of the box's.
 *
 * `arrow` uses tldraw's own shaft geometry from `getGeoShapePath.ts`: the
 * shaft is 0.68 of the cross-axis, and the head eats 0.38 of the long axis,
 * leaving the centred label 0.24 of the box height before it hits the head.
 */
const GEO_FIT: Record<Exclude<GeoModel, "rect">, (a: number, b: number) => number> = {
  ellipse: (a, b) => Math.hypot(a, b),
  diamond: (a, b) => a + b,
  triangle: (a, b) => 2 * a + b,
  arrow: (a, b) => Math.max(a / 0.68, b / 0.24),
};

/**
 * Per-box scale `k >= 1` applied to both width and height so a label still
 * fits inside a non-rectangular outline, centred - tldraw's own label
 * measurement is geo-independent (`getUnscaledLabelSize` wraps at
 * `w - LABEL_PADDING * 2` for every geo and `getGeometry` centres the label
 * rect in the full bounding box), so without this a diamond or triangle
 * would draw its label spilling past the drawn shape.
 *
 * Solved as a fixed point rather than in closed form: the box scales but the
 * label does not, so growing the box re-wraps the label onto fewer lines and
 * changes the very fractions the scale was derived from. Each pass multiplies
 * `k` by the residual overflow, which converges in two or three steps.
 */
export function geoScale(label: string | undefined, maxW: number | undefined, style?: BoxStyle): number {
  if (label === undefined || label.length === 0) return 1;
  const model = GEO_MODEL[style?.geo ?? "rectangle"];
  if (model === "rect") return 1;

  const rw = fitBoxWidth(label, maxW, style);
  const rh = boxHeightForWidth(label, rw, style);
  const fit = GEO_FIT[model];

  let k = 1;
  for (let pass = 0; pass < 8; pass++) {
    const { wl, hl } = labelExtent(label, rw * k, style);
    const overflow = fit(wl / (rw * k), hl / (rh * k));
    if (overflow <= 1.001) break;
    k *= overflow;
  }
  return k;
}

export function estimatedBoxSize(
  label: string | undefined,
  maxW?: number,
  style?: BoxStyle,
): {
  w: number;
  h: number;
} {
  const k = geoScale(label, maxW, style);
  const rw = fitBoxWidth(label, maxW, style);
  const naturalW = Math.ceil(rw * k);
  const naturalH = Math.ceil(boxHeightForWidth(label, rw, style) * k);
  // geoScale's k inflates width and height together (uniformly) so the label
  // fits inside a non-rect outline (diamond, ellipse, ...) - that inflation is
  // what makes the scaled width overshoot maxW even though rw itself respected
  // it as a wrap budget. Re-clamping only the width and leaving height as-is
  // (or re-deriving it from a narrower re-wrap) breaks the aspect the fit was
  // solved for and inflates height further instead of shrinking it. Scaling
  // the whole box down by the same factor keeps that aspect and brings both
  // dimensions down together.
  if (maxW === undefined || naturalW <= maxW) return { w: naturalW, h: naturalH };
  const scale = maxW / naturalW;
  return { w: maxW, h: Math.max(1, Math.ceil(naturalH * scale)) };
}

/**
 * A deliberately generous upper bound over a naive character wrap - real
 * tldraw text metrics wrap differently, but never past this reservation.
 * Emit turns the reserved height into `growY` so the drawn sticky matches.
 * The bound scales with `size` (via `fontScale`) but stays font-independent
 * - it's a crude char-count budget, not a real per-glyph measurement.
 */
export function estimatedNoteSize(
  text: string | undefined,
  ts?: TextStyle,
): { w: number; h: number } {
  const scale = fontScale(ts);
  const perLine = Math.max(1, Math.floor((NOTE_SIZE - NOTE_PAD * 2) / (NOTE_CHAR_PX * scale)));
  const lines = Math.ceil((text ?? "").length / perLine);
  return { w: NOTE_SIZE, h: Math.max(NOTE_SIZE, lines * (NOTE_LINE_H * scale) + NOTE_PAD * 2) };
}
