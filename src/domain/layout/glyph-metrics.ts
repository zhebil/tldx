/**
 * Per-glyph advance widths for tldraw's default draw font at the default
 * size, measured by `tools/text-metrics.mts`: each printable ASCII
 * character rendered 20 times and divided (space measured by differencing
 * `"a a a ... a"` against `"aaaa..."`). Per-(font, size) tables are future
 * work (plan task T11).
 */

const GLYPH_ADVANCE: Record<string, number> = {
  " ": 7.15, "!": 6.41, "\"": 10.89, "#": 21.40, "$": 14.94, "%": 21.14,
  "&": 14.74, "'": 5.78, "(": 10.43, ")": 8.65, "*": 11.15, "+": 15.40,
  ",": 6.32, "-": 11.18, ".": 5.98, "/": 7.51, "0": 15.14, "1": 8.99,
  "2": 15.19, "3": 15.00, "4": 15.90, "5": 13.54, "6": 15.53, "7": 14.40,
  "8": 15.15, "9": 14.96, ":": 6.62, ";": 6.75, "<": 15.40, "=": 15.40,
  ">": 15.40, "?": 11.24, "@": 19.69, "A": 16.59, "B": 13.74, "C": 13.06,
  "D": 14.97, "E": 14.60, "F": 13.05, "G": 17.66, "H": 15.92, "I": 13.77,
  "J": 13.97, "K": 14.84, "L": 11.25, "M": 21.25, "N": 16.91, "O": 15.48,
  "P": 13.19, "Q": 17.59, "R": 16.85, "S": 12.30, "T": 13.91, "U": 14.69,
  "V": 15.53, "W": 21.14, "X": 14.10, "Y": 13.87, "Z": 14.02, "[": 11.17,
  "\\": 8.98, "]": 10.97, "^": 13.42, "_": 15.40, "`": 7.79, "a": 14.61,
  "b": 13.17, "c": 10.90, "d": 14.57, "e": 13.22, "f": 10.43, "g": 14.46,
  "h": 14.88, "i": 6.73, "j": 7.45, "k": 13.58, "l": 7.73, "m": 19.69,
  "n": 14.37, "o": 13.52, "p": 13.13, "q": 13.76, "r": 10.99, "s": 11.50,
  "t": 10.57, "u": 13.47, "v": 13.13, "w": 20.85, "x": 12.83, "y": 13.16,
  "z": 13.41, "{": 11.84, "|": 7.04, "}": 11.84, "~": 15.40,
};

/** Any character not in the table (non-ASCII) is over- rather than under-reserved. */
export const MAX_GLYPH_ADVANCE = 21.4;

/** Covers the worst measured under-prediction (1.58px, `SystemClock`) plus integer rounding. */
export const TEXT_SLACK_PX = 4;

export function textWidth(s: string): number {
  if (s.length === 0) return 0;
  let w = 0;
  for (const ch of s) w += GLYPH_ADVANCE[ch] ?? MAX_GLYPH_ADVANCE;
  return w + TEXT_SLACK_PX;
}
