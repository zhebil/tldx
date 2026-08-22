import type { SourceSpan } from "../diagnostics/index.js";

/**
 * AST shapes for the MVP grammar (`<doc>`, `<frame>`, `<box>`, `<note>`,
 * `<edge>`). The parser is structural: it captures attribute values as raw
 * strings + spans and lets the IR layer validate types, references, and
 * positional rules (e.g. "<doc> can only appear at the root").
 *
 * Unknown elements are rejected at parse time with diagnostic
 * `parser/unknown-element`; they do not appear in the AST.
 */

export type AttrValue = {
  /** Raw string value as written between the quotes. No entity decoding. */
  value: string;
  /** Span covering the value characters (excluding the quotes). */
  span: SourceSpan;
  /** Span of the attribute name. */
  nameSpan: SourceSpan;
};

export type Attrs = Record<string, AttrValue>;

export type AstDoc = {
  kind: "doc";
  attrs: Attrs;
  children: AstNode[];
  /** Span of the opening `<doc>` tag (or the self-closing tag). */
  span: SourceSpan;
};

export type AstFrame = {
  kind: "frame";
  attrs: Attrs;
  children: AstNode[];
  /** Set by the `<Group>` runtime component; `<Frame>` leaves this unset. Not a user-facing prop. */
  group?: boolean;
  /** The JSX tag the author actually typed (`Row`, `Group`, `Layers`, ...). Unset for plain `<Frame>`; the IR falls back to `"Frame"` for diagnostics. Not a user-facing prop. */
  tag?: string;
  span: SourceSpan;
};

export type AstBox = {
  kind: "box";
  attrs: Attrs;
  /** Set by the `<Text>` runtime component: a borderless, fill-less box variant. Plain `<Box>` leaves this unset. Not a user-facing prop. */
  text?: boolean;
  /** Body text for the `<Text>` variant, taken from JSX children (like `<Note>`, not a `label` attribute). Unset for plain `<Box>`. */
  body?: string;
  /** The JSX tag the author actually typed (`Text`). Unset for plain `<Box>`; the IR falls back to `"Box"` for diagnostics. Not a user-facing prop. */
  tag?: string;
  span: SourceSpan;
};

export type AstNote = {
  kind: "note";
  attrs: Attrs;
  /** Body text; whitespace-trimmed at the edges, internal whitespace kept. */
  text: string;
  /** Set by the `<Sticky>` runtime component; `<Note>` leaves this unset. Not a user-facing prop. */
  sticky?: boolean;
  /** The JSX tag the author actually typed (`Sticky`). Unset for plain `<Note>`; the IR falls back to `"Note"` for diagnostics. Not a user-facing prop. */
  tag?: string;
  span: SourceSpan;
};

export type AstEdge = {
  kind: "edge";
  attrs: Attrs;
  span: SourceSpan;
};

export type AstNode = AstDoc | AstFrame | AstBox | AstNote | AstEdge;

export const ALLOWED_ELEMENT_NAMES = [
  "doc",
  "frame",
  "box",
  "note",
  "edge",
] as const;
export type AllowedElementName = (typeof ALLOWED_ELEMENT_NAMES)[number];

export function isAllowedElementName(name: string): name is AllowedElementName {
  return (ALLOWED_ELEMENT_NAMES as readonly string[]).includes(name);
}
