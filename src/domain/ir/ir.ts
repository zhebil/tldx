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
  pad?: number;
  cols?: number;
  align?: Align;
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
  pad?: number;
  cols?: number;
  align?: Align;
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
};

export type IRNote = IRBase & {
  kind: "note";
  text: string;
  /** True for `<Sticky>` (real tldraw sticky, `noteShape`); false/absent for `<Note>` (geo box). */
  sticky?: boolean;
  /** Id of the box/frame/note/edge this note annotates. Validated at lower time (`ir/note-target-not-found`); placed by `domain/layout/attach.ts`. */
  on?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  /** Pass-through tldraw style; does not affect layout. */
  color?: StyleColor;
  textAlign?: StyleTextAlign;
  verticalAlign?: StyleVerticalAlign;
  labelColor?: StyleColor;
  font?: StyleFont;
  size?: StyleFontSize;
};

export type IREdge = IRBase & {
  kind: "edge";
  /** Id of the source addressable element. Resolved at lower time. */
  from: string;
  /** Id of the destination addressable element. Resolved at lower time. */
  to: string;
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
