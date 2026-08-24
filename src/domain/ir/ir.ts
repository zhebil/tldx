import type { Align, Direction, LayoutMode } from "../layout/defaults.js";
import type { SourceSpan } from "../diagnostics/index.js";
import type {
  StyleArrowhead,
  StyleColor,
  StyleDash,
  StyleFill,
  StyleFont,
  StyleGeo,
  StyleFontSize,
  StyleTextAlign,
  StyleVerticalAlign,
} from "./styles.js";

/**
 * Normalized intermediate representation. Produced by `lower(ast)` from the
 * parser AST; consumed by `domain/layout/` and `domain/emit/`.
 *
 * `<box>`/`<frame>` require an authored `id`; `<note>`/`<edge>` get a
 * synthesized one. `idExplicit` records which.
 */

type IRBase = {
  id: string;
  idExplicit: boolean;
  span: SourceSpan;
};

export type IRDoc = IRBase & {
  kind: "doc";
  /** Page/tab title. The shallowest `title` in the document wins - see
   * `pickTitle` in `lower.ts`; callers fall back to the file name. */
  title?: string;
  /** Optional layout flow direction; layout port defaults when absent. */
  direction?: Direction;
  /** Deterministic-layout mode; the ELK adapter ignores it. */
  layout?: LayoutMode;
  gap?: number;
  /** Row-axis (vertical) gap override on `grid`; falls back to `gap`. */
  rowGap?: number;
  /** Column-axis (horizontal) gap override on `grid`; falls back to `gap`. */
  colGap?: number;
  pad?: number;
  cols?: number;
  align?: Align;
  /**
   * `false` opts a `col`/`grid` out of giving every flowed box the same
   * height. Width sharing is unaffected.
   */
  equalize?: boolean;
  children: IRElement[];
};

export type IRFrame = IRBase & {
  kind: "frame";
  name?: string;
  direction?: Direction;
  /** Deterministic-layout mode; the ELK adapter ignores it. */
  layout?: LayoutMode;
  gap?: number;
  /** Row-axis (vertical) gap override on `grid`; falls back to `gap`. */
  rowGap?: number;
  /** Column-axis (horizontal) gap override on `grid`; falls back to `gap`. */
  colGap?: number;
  pad?: number;
  cols?: number;
  align?: Align;
  /**
   * `false` opts a `col`/`grid` out of giving every flowed box the same
   * height. Width sharing is unaffected.
   */
  equalize?: boolean;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  children: IRElement[];
  /** Pass-through tldraw frame style; frames have no `fill`/`dash` in tldraw's schema. */
  color?: StyleColor;
  /** True for `<Group>`: lays out like a frame but emits no shape. */
  group?: boolean;
};

/**
 * Whether a frame draws tldraw chrome (border + title bar). A `<Group>` and
 * an unnamed frame never do - tldraw captions an empty-name frame with the
 * literal word "Frame". Emit uses this to decide whether to emit a frame
 * shape; layout uses it to reserve title-bar clearance.
 */
export function drawsChrome(frame: Pick<IRFrame, "group" | "name">): boolean {
  return frame.group !== true && frame.name !== undefined;
}

export type IRBox = IRBase & {
  kind: "box";
  label?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  maxW?: number;
  /** Pass-through tldraw geo-shape style; does not affect layout. */
  color?: StyleColor;
  fill?: StyleFill;
  dash?: StyleDash;
  geo?: StyleGeo;
  /** Leaf text alignment; named `textAlign` because `align` is the container cross-axis prop. */
  textAlign?: StyleTextAlign;
  verticalAlign?: StyleVerticalAlign;
  labelColor?: StyleColor;
  font?: StyleFont;
  size?: StyleFontSize;
  /**
   * True for `<Text>`: sized and flowed exactly like a `<Box>`, but emitted
   * as a borderless tldraw `text` shape instead of a `geo` rectangle.
   * `fill`/`dash`/`geo`/`verticalAlign`/`labelColor` are meaningless here and
   * `lower.ts` rejects them, but the fields stay on `IRBox` so every
   * box-shaped layout rule keeps working.
   */
  text?: boolean;
};

export type IRNote = IRBase & {
  kind: "note";
  text: string;
  /** True for `<Sticky>`, a real tldraw `noteShape`. */
  sticky?: boolean;
  /** Id of the box/frame/note/edge this note annotates. Validated at lower time; placed by `domain/layout/attach.ts`. */
  on?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** Caps wrap width like `IRBox.maxW`. No effect on a `<Sticky>`, whose
   * width is fixed by tldraw's `noteShape`. */
  maxW?: number;
  /** Pass-through tldraw style; does not affect layout. */
  color?: StyleColor;
  textAlign?: StyleTextAlign;
  verticalAlign?: StyleVerticalAlign;
  labelColor?: StyleColor;
  font?: StyleFont;
  size?: StyleFontSize;
};

/**
 * Fraction of a shape's own bounding box, `0..1` per axis (`0,0` top left) -
 * tldraw's `normalizedAnchor` convention. See `lower.ts`'s `ANCHOR_SIDES` for
 * the compass-point names an author can spell instead of a raw fraction.
 */
export type IRAnchor = { x: number; y: number };

export type IREdge = IRBase & {
  kind: "edge";
  /** Id of the source addressable element. Resolved at lower time. */
  from: string;
  /** Id of the destination addressable element. Resolved at lower time. */
  to: string;
  /**
   * Authored exit/entry side (`fromSide`/`toSide`). Wins over anything
   * `domain/layout/routing.ts` would otherwise compute; routing works around
   * a set anchor rather than overriding it.
   */
  fromAnchor?: IRAnchor;
  toAnchor?: IRAnchor;
  /**
   * Authored arc depth (`bend`), in page px, tldraw's own units and sign: the
   * perpendicular offset of the arc's midpoint from the straight chord.
   * Wins outright over `domain/layout/routing.ts` - unlike `fromAnchor`, which
   * the router routes *around*, a set bend takes the edge out of every pass
   * that would grow or shrink it, cap included.
   */
  bend?: number;
  /** Pass-through tldraw arrow style; does not affect layout. */
  color?: StyleColor;
  dash?: StyleDash;
  arrowheadStart?: StyleArrowhead;
  arrowheadEnd?: StyleArrowhead;
  label?: string;
  labelColor?: StyleColor;
  font?: StyleFont;
  size?: StyleFontSize;
};

export type IRElement = IRDoc | IRFrame | IRBox | IRNote | IREdge;

export type IRContainer = IRDoc | IRFrame;

/**
 * Positioned IR. Output of `domain/ports/layout.ts`, input to `domain/emit/`.
 * `box`/`note`/`frame` carry a required rect; `doc` and `edge` have none.
 * Layout adapters MUST NOT add, drop, or reorder elements.
 */

type Rect = { x: number; y: number; w: number; h: number };

export type IRBoxPositioned = IRBox & Rect;
export type IRNotePositioned = IRNote & Rect;
export type IRFramePositioned = Omit<IRFrame, "x" | "y" | "w" | "h" | "children"> &
  Rect & {
    children: IRElementPositioned[];
  };
export type IRDocPositioned = Omit<IRDoc, "children"> & {
  children: IRElementPositioned[];
};

export type IRElementPositioned =
  | IRDocPositioned
  | IRFramePositioned
  | IRBoxPositioned
  | IRNotePositioned
  | IREdge;
