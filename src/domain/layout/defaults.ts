/**
 * Shared layout heuristics consumed by both layout adapters
 * (`StubLayout` fake and `ElkLayoutAdapter` real). Sharing them keeps
 * `tldsl check` and `tldsl serve` producing identical scene JSON for the
 * same input - the contract is "no DOM, deterministic, identical sizes".
 *
 * `estimatedBoxSize` word-wraps against measured tldraw text metrics
 * (`tools/text-metrics.mts`): 14px/char upper bound, 32px total label
 * padding, 29.69px line height. It is not a flat per-char guess anymore -
 * a real greedy wrap keeps short labels tight and stops long ones from
 * splitting mid-word. Browser-side re-measurement is deferred (issue
 * tldsl-6ek out-of-scope).
 */

const BOX_PAD_Y = 16;
const BOX_MIN_W = 120;
const BOX_MIN_H = 60;

/** Measured upper bound on glyph advance width (see tools/text-metrics.mts). */
const BOX_CHAR_PX = 14;
/** tldraw's own box label padding, measured: every wrapped label reports labelW === shapeW - 32. */
const BOX_LABEL_PAD_X = 32;
/** Measured line height (29.69px), rounded up for integer geometry. */
const BOX_LINE_H = 30;
/** Cap box width; long labels wrap onto more lines instead of growing wider. */
const BOX_MAX_W = 320;

/** tldraw draws every sticky 200 wide and 200 tall before growY. */
export const NOTE_SIZE = 200;
const NOTE_PAD = 16;
const NOTE_CHAR_PX = 15;
const NOTE_LINE_H = 30;

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

/** Greedy word-wrap: longest line length (in chars) per line, given a usable width in chars. */
function wrapLines(text: string, maxCharsPerLine: number): number[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [0];

  const lineLengths: number[] = [];
  let cur = 0;
  for (const word of words) {
    const next = cur === 0 ? word.length : cur + 1 + word.length;
    if (cur > 0 && next > maxCharsPerLine) {
      lineLengths.push(cur);
      cur = word.length;
    } else {
      cur = next;
    }
  }
  lineLengths.push(cur);
  return lineLengths;
}

export function estimatedBoxSize(label: string | undefined): {
  w: number;
  h: number;
} {
  const text = label ?? "";
  const usableChars = Math.max(1, Math.floor((BOX_MAX_W - BOX_LABEL_PAD_X) / BOX_CHAR_PX));
  const lineLengths = wrapLines(text, usableChars);
  const longestLine = Math.max(...lineLengths);

  const w = Math.min(
    BOX_MAX_W,
    Math.max(BOX_MIN_W, Math.ceil(longestLine * BOX_CHAR_PX) + BOX_LABEL_PAD_X),
  );
  const h = Math.max(BOX_MIN_H, Math.ceil(lineLengths.length * BOX_LINE_H + BOX_PAD_Y * 2));
  return { w, h };
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
