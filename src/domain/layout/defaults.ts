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
 * Default reading measure for an attached `<Note>` (not `<Sticky>`), in px.
 * A note is placed beside a single target after layout, not shared across a
 * row/col like a box - `fitBoxWidth`'s `BOX_ASPECT_TARGET` (6:1) is tuned for
 * that flow case and given a free line budget produces a near-unwrapped
 * single line (D3: 549px for one sentence), which is both unreadable and too
 * wide to park next to anything. This caps the same wrap algorithm at a
 * paragraph-ish measure instead, same order as `NOTE_SIZE` so a plain note
 * reads like an annotation, not a banner.
 */
export const NOTE_MEASURE_PX = 260;

/**
 * Tldraw draws the frame heading rect at y in [-30, -6] relative to the
 * frame's own top edge - outside the frame, not inside it. So this is the
 * clearance a frame needs *above* it, reserved only by a frame that contains
 * a nested frame that itself draws chrome (see `domain/ir/ir.ts`'s
 * `drawsChrome` - a chrome-free frame draws no heading, so nothing needs
 * clearance for it).
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

export type Align = "start" | "center" | "end" | "stretch";
export const ALIGNS: readonly Align[] = ["start", "center", "end", "stretch"];
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

/** How much room a label that overflows its box actually needs, in px. */
export type LabelOverflow = { neededW: number; neededH: number };

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
 * Target w:h ratio a non-rect geo's *natural* (unpinned) box is pulled
 * toward - a short label on a diamond/ellipse/hexagon otherwise inherits
 * `fitBoxWidth`'s rectangle-tuned `BOX_ASPECT_TARGET` (6:1) and comes out a
 * flat lozenge instead of reading as the shape it claims to be (C4). Tighter
 * for the pointier outlines (diamond, triangle - narrow tips eat more of a
 * tall box than a wide one), roomier for the ellipse family. Approximations,
 * same spirit as `GEO_MODEL`'s comment above; arrows and rectangles are
 * absent on purpose (`geoNaturalSize` falls back to `BOX_ASPECT_TARGET`,
 * i.e. unchanged - arrows are directional by design, not "square-ish").
 */
const GEO_ASPECT_TARGET: Partial<Record<StyleGeo, number>> = {
  diamond: 1.6,
  rhombus: 1.6,
  "rhombus-2": 1.6,
  trapezoid: 1.8,
  star: 1.4,
  ellipse: 2.2,
  oval: 2.2,
  hexagon: 1.8,
  octagon: 1.4,
  pentagon: 1.4,
  heart: 1.2,
  triangle: 1.8,
};

/**
 * `rawH` (a label wrapped to some width `w`), grown - never shrunk, so this
 * can't clip a label that already wraps onto several lines - toward
 * `GEO_ASPECT_TARGET` for `geo`. Exported so `stack.ts`'s shared-width vote
 * (a `col`/`grid` box re-wrapped to the container's shared width, not its
 * own natural one) can apply the same target `geoNaturalSize` below does for
 * the natural-width case - without this, a non-rect box's height and its
 * `geoScale` factor `k` (which also moved once `geoNaturalSize` changed)
 * drift out of sync by rounding, and the label spills past its outline by a
 * pixel or two (regression caught by `tests/corpus/multi-file.test.ts`).
 */
export function geoTargetHeight(rawH: number, w: number, geo: StyleGeo | undefined): number {
  const target = GEO_ASPECT_TARGET[geo ?? "rectangle"] ?? BOX_ASPECT_TARGET;
  return Math.max(rawH, w / target);
}

/**
 * The natural (pre-`geoScale`) box for a label: `fitBoxWidth`'s width, and a
 * height grown - never shrunk, so this can't clip a label that already wraps
 * onto several lines - toward `GEO_ASPECT_TARGET`. `geoScale` then scales
 * this pair uniformly by `k`, so whatever `rw`:`rh` ratio comes out of here
 * *is* the final box's ratio; a long label's own `rw` (already wide because
 * `fitBoxWidth` capped how many lines its word count can wrap onto) still
 * wins over the target, which is the point - the target is a floor on
 * height, not a ceiling on width.
 */
function geoNaturalSize(
  label: string | undefined,
  maxW: number | undefined,
  style: BoxStyle | undefined,
): { rw: number; rh: number } {
  const rw = fitBoxWidth(label, maxW, style);
  const rawRh = boxHeightForWidth(label, rw, style);
  return { rw, rh: geoTargetHeight(rawRh, rw, style?.geo) };
}

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
 * Whether `label`, wrapped to the box's *actual* `w`, needs more room than
 * the box's actual `w`x`h` gives it. `geoScale`/`estimatedBoxSize` compute a
 * size a box *should* be; this checks a size a box *already is* - the two
 * diverge whenever something else won the box's final geometry (an explicit
 * `w`/`h` on the element, or a container's shared-size vote), so the label
 * was never re-measured against what it actually got. Returns the room the
 * label needs, or `undefined` if it already fits.
 *
 * Same containment math as `geoScale`'s convergence check (`fit(wl/w, hl/h)`
 * for a non-rect outline); a `rect` box has no such formula in `GEO_FIT`
 * because a rectangle's fit is the padding arithmetic `boxHeightForWidth`
 * already does, so it's inlined here instead of extending that table for one
 * case that isn't a containment ratio.
 */
export function labelOverflow(
  label: string | undefined,
  w: number,
  h: number,
  style?: BoxStyle,
): LabelOverflow | undefined {
  if (label === undefined || label.length === 0) return undefined;
  const { wl, hl } = labelExtent(label, w, style);
  const model = GEO_MODEL[style?.geo ?? "rectangle"];

  if (model === "rect") {
    const contentW = w - BOX_LABEL_PAD_X;
    const neededH = hl + BOX_PAD_Y * 2;
    if (neededH <= h + 0.5 && wl <= contentW + 0.5) return undefined;
    return { neededW: Math.ceil(wl + BOX_LABEL_PAD_X), neededH: Math.ceil(neededH) };
  }

  const fit = GEO_FIT[model];
  const overflow = fit(wl / w, hl / h);
  if (overflow <= 1.001) return undefined;
  return { neededW: Math.ceil(w * overflow), neededH: Math.ceil(h * overflow) };
}

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

  const { rw, rh } = geoNaturalSize(label, maxW, style);
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
  const { rw, rh } = geoNaturalSize(label, maxW, style);
  const naturalW = Math.ceil(rw * k);
  const naturalH = Math.ceil(rh * k);
  if (maxW === undefined || naturalW <= maxW) return { w: naturalW, h: naturalH };

  // geoScale's k inflates width and height together so the label fits inside
  // a non-rect outline - that inflation is what pushed naturalW past maxW
  // even though rw itself respected it as a wrap budget. maxW caps the
  // shape's outer width, so pin w there and re-wrap the label to the room
  // actually available at that width, then grow (never shrink) h until the
  // re-wrapped label fits the outline again. Shrinking h instead - scaling
  // the whole box down uniformly - would undo exactly the inflation that
  // kept the label inside the outline, so the label spills past the shape.
  const model = GEO_MODEL[style?.geo ?? "rectangle"];
  if (model === "rect" || label === undefined || label.length === 0) {
    return { w: maxW, h: boxHeightForWidth(label, maxW, style) };
  }
  const fit = GEO_FIT[model];
  const { wl, hl } = labelExtent(label, maxW, style);
  const a = wl / maxW;
  // `a` (the label's width fraction of the capped box) is fixed once w is
  // pinned to maxW, so this is a single-variable search: grow h until
  // fit(a, hl / h) <= 1. Binary search, not geoScale's fixed-point multiply,
  // because a close to 1 (a long label against a tight cap) makes that
  // fixed point converge too slowly to land inside tolerance in a handful of
  // passes.
  let lo = boxHeightForWidth(label, maxW, style);
  if (fit(a, hl / lo) > 1.001) {
    let hi = lo;
    for (let i = 0; i < 24 && fit(a, hl / hi) > 1.001; i++) hi *= 2;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (fit(a, hl / mid) > 1.001) lo = mid;
      else hi = mid;
    }
    lo = hi;
  }
  return { w: maxW, h: Math.ceil(lo) };
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
