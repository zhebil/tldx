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
 * Normalized intermediate representation. Produced by `lower(ast)` from
 * the parser AST; consumed by `domain/layout/` and `domain/emit/`.
 *
 * Every element carries a stable `id`. For addressable elements (`<box>`,
 * `<frame>`) the id is required from source; for non-addressable visual
 * elements (`<note>`, `<edge>`) the id may be synthesized per ADR-12.
 * `idExplicit` records which case it was; this matters for phase-2 round-trip.
 */

type IRBase = {
  id: string;
  idExplicit: boolean;
  span: SourceSpan;
};

export type IRDoc = IRBase & {
  kind: "doc";
  /** Optional layout flow direction; layout port defaults when absent. */
  direction?: Direction;
  /** Optional deterministic-layout mode (spike; ELK adapter ignores this). */
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
   * height (the default); use when the box height *is* the data. Width
   * sharing in `col`/`grid` is unaffected.
   */
  equalize?: boolean;
  children: IRElement[];
};

export type IRFrame = IRBase & {
  kind: "frame";
  name?: string;
  /** Optional override for layout flow inside this frame. */
  direction?: Direction;
  /** Optional deterministic-layout mode (spike; ELK adapter ignores this). */
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
   * height (the default); use when the box height *is* the data. Width
   * sharing in `col`/`grid` is unaffected.
   */
  equalize?: boolean;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  children: IRElement[];
  /** Pass-through tldraw frame style; frames have no `fill`/`dash` in tldraw's schema. */
  color?: StyleColor;
  /** True for `<Group>`: lays out like a frame but emits no shape (see `domain/emit/emit.ts`). */
  group?: boolean;
};

/**
 * Whether a frame draws tldraw chrome (border + title bar). `<Group>`
 * (`group: true`) never does. An unnamed non-group frame - `<Row>`/`<Col>`/
 * `<Grid>`/`<Graph>`/bare `<Frame>` with no `name` - doesn't either: tldraw
 * captions an empty-name frame with the literal word "Frame", and a
 * placeholder shouldn't be invented for a container whose author declined to
 * name one (D2). A named frame is unaffected. Consumed by `domain/emit/emit.ts`
 * (whether to emit a frame shape) and `domain/layout/stack.ts` (whether an
 * ancestor must reserve clearance for this frame's title bar).
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
  /** Leaf text alignment; named `textAlign` (not `align`) since `align` is the container cross-axis prop (B1). */
  textAlign?: StyleTextAlign;
  verticalAlign?: StyleVerticalAlign;
  labelColor?: StyleColor;
  font?: StyleFont;
  size?: StyleFontSize;
  /**
   * True for `<Text>`: the same "box" IR kind, sized and flowed exactly like
   * a `<Box>` (`domain/layout/stack.ts` never special-cases it), but emitted
   * as a borderless tldraw `text` shape instead of a `geo` rectangle
   * (`domain/emit/emit.ts`). `fill`/`dash`/`geo`/`verticalAlign`/`labelColor`
   * are meaningless for this variant - `domain/ir/lower.ts` rejects them via
   * a narrower allowed-prop set - but the fields stay on `IRBox` rather than
   * forking the type, so every box-shaped layout rule keeps working
   * unmodified. Unset for plain `<Box>`.
   */
  text?: boolean;
};

export type IRNote = IRBase & {
  kind: "note";
  text: string;
  /**
   * True for `<Sticky>` (real tldraw sticky, `noteShape`). `<Sticky>` is the
   * only runtime producer left (C2, tldx-npd) - the old `<Note>` that left
   * this unset and emitted a fake geo-rectangle "note" is retired in favour
   * of `<Text>` (borderless annotation) or `<Box>` (bordered). The field
   * stays optional rather than required `true`: `domain/layout/stack.ts` and
   * `domain/layout/attach.ts` still branch on it, and tightening it here
   * would force changes into files this issue doesn't own.
   */
  sticky?: boolean;
  /** Id of the box/frame/note/edge this note annotates. Validated at lower time (`ir/note-target-not-found`); placed by `domain/layout/attach.ts`. */
  on?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** Caps wrap width like `IRBox.maxW`. Only affects a non-sticky `<Note>` (a
   * geo box, sized the same way a box is); a `<Sticky>`'s width is fixed by
   * tldraw's `noteShape`, so this has no visual effect there (D16). */
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
 * Fraction of a shape's own bounding box, `0..1` on each axis (`0,0` top
 * left, `1,1` bottom right) - tldraw's own `normalizedAnchor` shape, and the
 * same convention `domain/layout/routing.ts`'s analytic passes already
 * compute internally. `IREdge.fromAnchor`/`toAnchor` are the authored form
 * of the same value (B9); see `lower.ts`'s `ANCHOR_SIDES` for the 8-compass-
 * point-plus-`center` names an author can spell instead of a raw fraction.
 */
export type IRAnchor = { x: number; y: number };

export type IREdge = IRBase & {
  kind: "edge";
  /** Id of the source addressable element. Resolved at lower time. */
  from: string;
  /** Id of the destination addressable element. Resolved at lower time. */
  to: string;
  /**
   * Authored exit/entry side (`fromSide`/`toSide`), separate props rather
   * than dotted `id.anchor` syntax to avoid colliding with the `-`/`_`
   * namespace convention some ids already use a `.` for by mistake
   * (tldx-4s1) - see `lower.ts`'s `parseAnchorSide`. Wins over anything
   * `domain/layout/routing.ts` would otherwise compute; routing works
   * around a set anchor (grows bend to clear obstacles from it) rather than
   * overriding it.
   */
  fromAnchor?: IRAnchor;
  toAnchor?: IRAnchor;
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

export function isContainer(el: IRElement): el is IRContainer {
  return el.kind === "doc" || el.kind === "frame";
}

/**
 * Positioned IR. Output of `domain/ports/layout.ts` and input to
 * `domain/emit/`. Visual elements (`box`, `note`, `frame`) carry required
 * `x | y | w | h`; `doc` is the root and `edge` is a connector, so neither
 * has a rect of its own. The shape mirrors the IR tree exactly: same ids,
 * same child order, same kinds. Layout adapters MUST NOT add, drop, or
 * reorder elements.
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
