/**
 * tldraw's fixed style enums (T9), exposed as raw pass-through props. These
 * are the exact `values` tuples off `@tldraw/tlschema`'s style records
 * (`DefaultColorStyle`, `DefaultFillStyle`, `DefaultDashStyle`,
 * `ArrowShapeArrowhead{Start,End}Style`), copied here so `domain/` doesn't
 * import tldraw at all (CONTEXT.md: only `infra/` may). If tldraw adds or
 * renames a value on a point release, update the tuple here in lockstep.
 */

export const COLORS = [
  "black",
  "grey",
  "light-violet",
  "violet",
  "blue",
  "light-blue",
  "yellow",
  "orange",
  "green",
  "light-green",
  "light-red",
  "red",
  "white",
] as const;
export type StyleColor = (typeof COLORS)[number];

export const FILLS = ["none", "semi", "solid", "pattern", "fill"] as const;
export type StyleFill = (typeof FILLS)[number];

export const DASHES = ["draw", "solid", "dashed", "dotted"] as const;
export type StyleDash = (typeof DASHES)[number];

export const ARROWHEADS = [
  "arrow",
  "triangle",
  "square",
  "dot",
  "pipe",
  "diamond",
  "inverted",
  "bar",
  "none",
] as const;
export type StyleArrowhead = (typeof ARROWHEADS)[number];

/**
 * tldraw's `DefaultHorizontalAlignStyle` also has `start-legacy`/
 * `middle-legacy`/`end-legacy` (pre-rich-text legacy values); deliberately
 * not exposed here (T10).
 */
export const TEXT_ALIGNS = ["start", "middle", "end"] as const;
export type StyleTextAlign = (typeof TEXT_ALIGNS)[number];

export const VERTICAL_ALIGNS = ["start", "middle", "end"] as const;
export type StyleVerticalAlign = (typeof VERTICAL_ALIGNS)[number];
