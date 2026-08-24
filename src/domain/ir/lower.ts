/**
 * AST to IR lowering: validates ids, references, numbers and style enums, and
 * normalizes attributes into the IR shape.
 *
 * Errors do not abort lowering. The IR is produced best-effort and the caller
 * decides what to do based on `hasErrors(diagnostics)`. Edges that fail
 * validation are dropped so layout never sees a broken reference.
 */

import {
  error,
  warning,
  type Diagnostic,
  type SourceSpan,
} from "../diagnostics/index.js";
import {
  ALIGNS,
  DIRECTIONS,
  isAlign,
  isDirection,
  LAYOUT_MODES,
  isLayoutMode,
  type Align,
  type Direction,
  type LayoutMode,
} from "../layout/defaults.js";
import {
  ARROWHEADS,
  COLORS,
  DASHES,
  FILLS,
  FONT_SIZES,
  FONTS,
  GEOS,
  TEXT_ALIGNS,
  VERTICAL_ALIGNS,
} from "./styles.js";
import type {
  AstBox,
  AstEdge,
  AstFrame,
  AstNode,
  AstNote,
  AttrValue,
  Attrs,
} from "../parser/index.js";

import type {
  IRAnchor,
  IRBox,
  IRDoc,
  IREdge,
  IRElement,
  IRFrame,
  IRNote,
} from "./ir.js";
import { contentHash, SyntheticIdAllocator } from "./synthetic-id.js";

const ALLOWED_PROPS = {
  doc: ["id", "direction", "layout", "gap", "rowGap", "colGap", "pad", "cols", "align", "equalize"],
  frame: [
    "id",
    "name",
    "direction",
    "layout",
    "gap",
    "rowGap",
    "colGap",
    "pad",
    "cols",
    "align",
    "equalize",
    "x",
    "y",
    "w",
    "h",
    "color",
  ],
  box: [
    "id",
    "label",
    "x",
    "y",
    "w",
    "h",
    "maxW",
    "color",
    "fill",
    "dash",
    "geo",
    "textAlign",
    "verticalAlign",
    "labelColor",
    "font",
    "size",
  ],
  // <Text> is the same "box" IR kind as <Box> with a narrower prop set:
  // tldraw's TLTextShapeProps has no border/fill props, no verticalAlign,
  // labelColor or h, and the content comes from JSX children, not `label`.
  text: ["id", "x", "y", "w", "maxW", "color", "textAlign", "font", "size"],
  note: [
    "id",
    "on",
    "x",
    "y",
    "w",
    "h",
    "maxW",
    "color",
    "textAlign",
    "verticalAlign",
    "labelColor",
    "font",
    "size",
  ],
  edge: [
    "id",
    "from",
    "to",
    "fromSide",
    "toSide",
    "color",
    "dash",
    "arrowheadStart",
    "arrowheadEnd",
    "label",
    "labelColor",
    "font",
    "size",
  ],
} as const;

/** The JSX tag the author typed. Aliases like `<Row>`/`<Sticky>` all lower to one IR kind, so diagnostics name the alias instead. */
function displayTag(node: AstNode): string {
  switch (node.kind) {
    case "doc":
      return "Doc";
    case "frame":
      return node.tag ?? "Frame";
    case "box":
      return node.tag ?? "Box";
    case "note":
      return node.tag ?? "Note";
    case "edge":
      return "Edge";
  }
}

/** Unknown props become `ir/unknown-prop` diagnostics but do not stop lowering. */
function checkUnknownProps(
  kind: keyof typeof ALLOWED_PROPS,
  tag: string,
  attrs: Attrs,
  ctx: Ctx,
): void {
  const allowed: readonly string[] = ALLOWED_PROPS[kind];
  for (const [name, attr] of Object.entries(attrs)) {
    if (allowed.includes(name)) continue;
    ctx.diagnostics.push(
      error(
        "ir/unknown-prop",
        `'${name}' is not supported on '<${tag}>' (allowed: ${allowed.join(", ")})`,
        attr.nameSpan,
      ),
    );
  }
}

/**
 * A JSX string-literal attribute is raw text and does not process backslash
 * escapes, so a literal `\n` stays two characters. Warn rather than reject:
 * it is valid JSX, just probably not what the author meant. The working
 * multiline form is the expression container, `label={"a\nb"}`.
 */
function checkLiteralNewlineInLabel(attrs: Attrs, ctx: Ctx): void {
  const attr = attrs.label;
  if (attr === undefined || !attr.value.includes("\\n")) return;
  ctx.diagnostics.push(
    warning(
      "ir/literal-newline-in-label",
      `'label' contains a literal '\\n', which renders as the two characters '\\' and 'n', not a line break - JSX string attributes do not process escapes. Use the expression form instead: label={"line one\\nline two"}`,
      attr.span,
    ),
  );
}

export type LowerResult = {
  /** The lowered document, or null if the AST root is not `<doc>`. */
  ir: IRDoc | null;
  diagnostics: Diagnostic[];
};

export function lower(ast: AstNode | null): LowerResult {
  const diagnostics: Diagnostic[] = [];

  if (ast === null) {
    return { ir: null, diagnostics };
  }
  if (ast.kind !== "doc") {
    diagnostics.push(
      error(
        "ir/root-not-doc",
        `top-level element must be '<doc>', got '<${displayTag(ast)}>'`,
        ast.span,
      ),
    );
    return { ir: null, diagnostics };
  }

  const ctx: Ctx = {
    diagnostics,
    explicitIds: new Map(),
    synthetic: new SyntheticIdAllocator(),
  };

  checkUnknownProps("doc", displayTag(ast), ast.attrs, ctx);

  // Pass 1: walk and assign ids.
  const idHeader = assignId(ast.attrs, ast.span, ctx, {
    kind: "doc",
    tag: displayTag(ast),
    addressable: false,
    contentFields: () => [],
  });
  const direction = readDirection(ast.attrs, ctx);
  const layout = readLayoutMode(ast.attrs, ctx);
  const align = readAlign(ast.attrs, ctx);
  const equalize = readBoolean(ast.attrs, "equalize", ctx);
  const doc: IRDoc = {
    kind: "doc",
    ...idHeader,
    span: ast.span,
    children: [],
    ...(direction === undefined ? {} : { direction }),
    ...(layout === undefined ? {} : { layout }),
    ...(align === undefined ? {} : { align }),
    ...(equalize === undefined ? {} : { equalize }),
    ...numericAttrs(ast.attrs, ctx, ["gap", "rowGap", "colGap", "pad", "cols"] as const),
  };
  for (const child of ast.children) {
    const lowered = lowerNode(child, ctx);
    if (lowered !== null) doc.children.push(lowered);
  }

  // Pass 2: resolve edge references now that all ids exist.
  resolveEdges(doc, ctx);
  // Pass 3: resolve note `on` targets now that dangling edges are gone too.
  resolveNoteTargets(doc, ctx);

  return { ir: doc, diagnostics };
}

type Ctx = {
  diagnostics: Diagnostic[];
  /** Ids that elements claimed explicitly, used for duplicate detection. */
  explicitIds: Map<string, SourceSpan>;
  synthetic: SyntheticIdAllocator;
};

function lowerNode(node: AstNode, ctx: Ctx): IRElement | null {
  switch (node.kind) {
    case "doc":
      // Nested <doc> is illegal at the parser level; defend in depth.
      ctx.diagnostics.push(
        error(
          "ir/nested-doc",
          "'<doc>' may only appear at the top level",
          node.span,
        ),
      );
      return null;
    case "frame":
      return lowerFrame(node, ctx);
    case "box":
      return lowerBox(node, ctx);
    case "note":
      return lowerNote(node, ctx);
    case "edge":
      return lowerEdge(node, ctx);
  }
}

function lowerFrame(node: AstFrame, ctx: Ctx): IRFrame {
  const tag = displayTag(node);
  checkUnknownProps("frame", tag, node.attrs, ctx);
  const direction = readDirection(node.attrs, ctx);
  const layout = readLayoutMode(node.attrs, ctx);
  const align = readAlign(node.attrs, ctx);
  const equalize = readBoolean(node.attrs, "equalize", ctx);
  const color = readEnum(node.attrs, "color", COLORS, ctx);
  const frame: IRFrame = {
    kind: "frame",
    ...assignId(node.attrs, node.span, ctx, {
      kind: "frame",
      tag,
      addressable: true,
      contentFields: () => [getRaw(node.attrs, "name") ?? ""],
    }),
    span: node.span,
    children: [],
    ...optionalString(node.attrs, "name"),
    ...(direction === undefined ? {} : { direction }),
    ...(layout === undefined ? {} : { layout }),
    ...(align === undefined ? {} : { align }),
    ...(equalize === undefined ? {} : { equalize }),
    ...numericAttrs(node.attrs, ctx, ["x", "y", "w", "h"] as const),
    ...numericAttrs(node.attrs, ctx, ["gap", "rowGap", "colGap", "pad", "cols"] as const),
    ...(color === undefined ? {} : { color }),
    ...(node.group === true ? { group: true } : {}),
  };
  for (const child of node.children) {
    const lowered = lowerNode(child, ctx);
    if (lowered !== null) frame.children.push(lowered);
  }
  return frame;
}

function lowerBox(node: AstBox, ctx: Ctx): IRBox {
  const tag = displayTag(node);
  checkUnknownProps(node.text ? "text" : "box", tag, node.attrs, ctx);
  checkLiteralNewlineInLabel(node.attrs, ctx);
  const color = readEnum(node.attrs, "color", COLORS, ctx);
  const fill = readEnum(node.attrs, "fill", FILLS, ctx);
  const dash = readEnum(node.attrs, "dash", DASHES, ctx);
  const geo = readEnum(node.attrs, "geo", GEOS, ctx);
  const textAlign = readEnum(node.attrs, "textAlign", TEXT_ALIGNS, ctx);
  const verticalAlign = readEnum(node.attrs, "verticalAlign", VERTICAL_ALIGNS, ctx);
  const labelColor = readEnum(node.attrs, "labelColor", COLORS, ctx);
  const font = readEnum(node.attrs, "font", FONTS, ctx);
  const size = readEnum(node.attrs, "size", FONT_SIZES, ctx);
  // <Text>'s content is JSX children; <Box>'s is the `label` attribute. Both
  // land in IRBox.label.
  const label = node.text ? node.body : getRaw(node.attrs, "label");
  return {
    kind: "box",
    ...assignId(node.attrs, node.span, ctx, {
      kind: "box",
      tag,
      // <Text> may be anonymous - an id is synthesized. <Box> may not.
      addressable: !node.text,
      contentFields: () => [label ?? ""],
    }),
    span: node.span,
    ...(label === undefined ? {} : { label }),
    ...numericAttrs(node.attrs, ctx, ["x", "y", "w", "h", "maxW"] as const),
    ...(color === undefined ? {} : { color }),
    ...(fill === undefined ? {} : { fill }),
    ...(dash === undefined ? {} : { dash }),
    ...(geo === undefined ? {} : { geo }),
    ...(textAlign === undefined ? {} : { textAlign }),
    ...(verticalAlign === undefined ? {} : { verticalAlign }),
    ...(labelColor === undefined ? {} : { labelColor }),
    ...(font === undefined ? {} : { font }),
    ...(size === undefined ? {} : { size }),
    ...(node.text ? { text: true as const } : {}),
  };
}

function lowerNote(node: AstNote, ctx: Ctx): IRNote {
  const tag = displayTag(node);
  checkUnknownProps("note", tag, node.attrs, ctx);
  const color = readEnum(node.attrs, "color", COLORS, ctx);
  const textAlign = readEnum(node.attrs, "textAlign", TEXT_ALIGNS, ctx);
  const verticalAlign = readEnum(node.attrs, "verticalAlign", VERTICAL_ALIGNS, ctx);
  const labelColor = readEnum(node.attrs, "labelColor", COLORS, ctx);
  const font = readEnum(node.attrs, "font", FONTS, ctx);
  const size = readEnum(node.attrs, "size", FONT_SIZES, ctx);
  return {
    kind: "note",
    ...assignId(node.attrs, node.span, ctx, {
      kind: "note",
      tag,
      addressable: false,
      contentFields: () => [node.text],
    }),
    span: node.span,
    text: node.text,
    ...(node.sticky ? { sticky: true as const } : {}),
    ...optionalString(node.attrs, "on"),
    ...numericAttrs(node.attrs, ctx, ["x", "y", "w", "h", "maxW"] as const),
    ...(color === undefined ? {} : { color }),
    ...(textAlign === undefined ? {} : { textAlign }),
    ...(verticalAlign === undefined ? {} : { verticalAlign }),
    ...(labelColor === undefined ? {} : { labelColor }),
    ...(font === undefined ? {} : { font }),
    ...(size === undefined ? {} : { size }),
  };
}

function lowerEdge(node: AstEdge, ctx: Ctx): IREdge | null {
  const tag = displayTag(node);
  checkUnknownProps("edge", tag, node.attrs, ctx);
  checkLiteralNewlineInLabel(node.attrs, ctx);
  const fromAttr = node.attrs.from;
  const toAttr = node.attrs.to;
  if (fromAttr === undefined || toAttr === undefined) {
    ctx.diagnostics.push(
      error(
        "ir/missing-edge-endpoint",
        "'<edge>' requires both 'from' and 'to' attributes",
        node.span,
      ),
    );
    return null;
  }

  const from = validateEndpoint(fromAttr, "from", ctx);
  const to = validateEndpoint(toAttr, "to", ctx);
  if (from === null || to === null) return null;

  const fromAnchor = parseAnchorSide(node.attrs.fromSide, "fromSide", ctx);
  const toAnchor = parseAnchorSide(node.attrs.toSide, "toSide", ctx);
  const color = readEnum(node.attrs, "color", COLORS, ctx);
  const dash = readEnum(node.attrs, "dash", DASHES, ctx);
  const arrowheadStart = readEnum(node.attrs, "arrowheadStart", ARROWHEADS, ctx);
  const arrowheadEnd = readEnum(node.attrs, "arrowheadEnd", ARROWHEADS, ctx);
  const labelColor = readEnum(node.attrs, "labelColor", COLORS, ctx);
  const font = readEnum(node.attrs, "font", FONTS, ctx);
  const size = readEnum(node.attrs, "size", FONT_SIZES, ctx);

  return {
    kind: "edge",
    ...assignId(node.attrs, node.span, ctx, {
      kind: "edge",
      tag,
      addressable: false,
      contentFields: () => [from, to],
    }),
    span: node.span,
    from,
    to,
    ...(fromAnchor === undefined ? {} : { fromAnchor }),
    ...(toAnchor === undefined ? {} : { toAnchor }),
    ...optionalString(node.attrs, "label"),
    ...(color === undefined ? {} : { color }),
    ...(dash === undefined ? {} : { dash }),
    ...(arrowheadStart === undefined ? {} : { arrowheadStart }),
    ...(arrowheadEnd === undefined ? {} : { arrowheadEnd }),
    ...(labelColor === undefined ? {} : { labelColor }),
    ...(font === undefined ? {} : { font }),
    ...(size === undefined ? {} : { size }),
  };
}

/**
 * Resolve the `id` attribute: record an explicit id (diagnosing duplicates and
 * empties), or synthesize one. Addressable elements arriving without an id get
 * `ir/missing-id`. The single place the id rules live.
 */
function assignId(
  attrs: Attrs,
  elementSpan: SourceSpan,
  ctx: Ctx,
  spec: {
    kind: "doc" | "frame" | "box" | "note" | "edge";
    /** The authored tag to name in diagnostics; `spec.kind` stays the structural IR kind, used for the synthetic-id content hash. */
    tag: string;
    addressable: boolean;
    contentFields: () => readonly string[];
  },
): { id: string; idExplicit: boolean } {
  const attr = attrs.id;

  if (attr !== undefined && attr.value !== "") {
    recordExplicit(attr.value, elementSpan, ctx);
    return { id: attr.value, idExplicit: true };
  }

  if (attr !== undefined && attr.value === "") {
    ctx.diagnostics.push(
      error("ir/missing-id", "'id' attribute is empty", attr.span),
    );
  } else if (spec.addressable) {
    ctx.diagnostics.push(
      error(
        "ir/missing-id",
        `'<${spec.tag}>' is addressable and requires an explicit 'id'`,
        elementSpan,
      ),
    );
  }

  return {
    id: ctx.synthetic.allocate(contentHash(spec.kind, spec.contentFields())),
    idExplicit: false,
  };
}

function recordExplicit(id: string, span: SourceSpan, ctx: Ctx): void {
  const existing = ctx.explicitIds.get(id);
  if (existing !== undefined) {
    ctx.diagnostics.push(
      error(
        "ir/duplicate-id",
        `duplicate id '${id}' (first defined at ${existing.line}:${existing.column})`,
        span,
      ),
    );
    return;
  }
  ctx.explicitIds.set(id, span);
}

/**
 * 8 compass points plus `center`, as fractions of the target shape's own
 * bounding box, `0,0` top-left. An author can also write the fraction
 * directly (`fromSide="0.25,1"`); `normalizedAnchor` is continuous, so a
 * bigger fixed table would buy nothing.
 */
const ANCHOR_SIDES: Record<string, IRAnchor> = {
  center: { x: 0.5, y: 0.5 },
  top: { x: 0.5, y: 0 },
  bottom: { x: 0.5, y: 1 },
  left: { x: 0, y: 0.5 },
  right: { x: 1, y: 0.5 },
  "top-left": { x: 0, y: 0 },
  "top-right": { x: 1, y: 0 },
  "bottom-left": { x: 0, y: 1 },
  "bottom-right": { x: 1, y: 1 },
};

function parseAnchorSide(
  attr: AttrValue | undefined,
  attrName: "fromSide" | "toSide",
  ctx: Ctx,
): IRAnchor | undefined {
  if (attr === undefined) return undefined;
  const raw = attr.value.trim();
  const named = ANCHOR_SIDES[raw];
  if (named !== undefined) return named;

  const parts = raw.split(",");
  if (parts.length === 2) {
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (Number.isFinite(x) && Number.isFinite(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1) {
      return { x, y };
    }
  }

  ctx.diagnostics.push(
    error(
      "ir/invalid-anchor-side",
      `'${attrName}' must be one of ${Object.keys(ANCHOR_SIDES).join(", ")}, or an "x,y" fraction with each in 0..1 (got '${raw}')`,
      attr.span,
    ),
  );
  return undefined;
}

function validateEndpoint(
  attr: AttrValue,
  attrName: "from" | "to",
  ctx: Ctx,
): string | null {
  const raw = attr.value;
  if (raw.startsWith("x:") || raw.startsWith("y:")) {
    ctx.diagnostics.push(
      error(
        "ir/free-endpoint-not-supported",
        `free-endpoint syntax in '${attrName}' is phase 1, not MVP`,
        attr.span,
      ),
    );
    return null;
  }
  if (raw.includes(".")) {
    ctx.diagnostics.push(
      error(
        "ir/anchor-not-supported",
        `anchor syntax (id.anchor) in '${attrName}' is phase 1, not MVP`,
        attr.span,
      ),
    );
    return null;
  }
  if (raw === "") {
    ctx.diagnostics.push(
      error("ir/missing-edge-endpoint", `'${attrName}' is empty`, attr.span),
    );
    return null;
  }
  return raw;
}

/** Resolve `from`/`to` to known ids, dropping edges whose endpoints point at nothing. */
function resolveEdges(doc: IRDoc, ctx: Ctx): void {
  const ids = collectIds(doc);
  walkAndFilter(doc, (el) => {
    if (el.kind !== "edge") return true;
    const fromOk = ids.has(el.from);
    const toOk = ids.has(el.to);
    if (!fromOk) {
      ctx.diagnostics.push(
        error(
          "ir/unknown-reference",
          `edge 'from' references unknown id '${el.from}'`,
          el.span,
        ),
      );
    }
    if (!toOk) {
      ctx.diagnostics.push(
        error(
          "ir/unknown-reference",
          `edge 'to' references unknown id '${el.to}'`,
          el.span,
        ),
      );
    }
    return fromOk && toOk;
  });
}

/**
 * An unresolvable `<Note on="...">` falls back to a plain flowed note rather
 * than being dropped - unlike an edge with a bad endpoint, a note is still
 * meaningful content without its attachment.
 */
function resolveNoteTargets(doc: IRDoc, ctx: Ctx): void {
  const ids = collectAddressableIds(doc);
  walkNotes(doc, (note) => {
    if (note.on === undefined || ids.has(note.on)) return note;
    ctx.diagnostics.push(
      error(
        "ir/note-target-not-found",
        `note 'on' references unknown id '${note.on}'`,
        note.span,
      ),
    );
    const { on: _on, ...rest } = note;
    void _on;
    return rest;
  });
}

/** Ids of every box/frame/note/edge in the document - the valid `on` targets. Excludes the `<doc>` root. */
function collectAddressableIds(
  el: IRElement,
  into: Set<string> = new Set(),
): Set<string> {
  if (el.kind !== "doc") into.add(el.id);
  if (el.kind === "doc" || el.kind === "frame") {
    for (const c of el.children) collectAddressableIds(c, into);
  }
  return into;
}

function walkNotes(
  container: IRDoc | IRFrame,
  fix: (note: IRNote) => IRNote,
): void {
  container.children = container.children.map((c) => (c.kind === "note" ? fix(c) : c));
  for (const c of container.children) {
    if (c.kind === "doc" || c.kind === "frame") walkNotes(c, fix);
  }
}

function collectIds(el: IRElement, into: Set<string> = new Set()): Set<string> {
  into.add(el.id);
  if (el.kind === "doc" || el.kind === "frame") {
    for (const c of el.children) collectIds(c, into);
  }
  return into;
}

function walkAndFilter(
  container: IRDoc | IRFrame,
  keep: (el: IRElement) => boolean,
): void {
  container.children = container.children.filter(keep);
  for (const c of container.children) {
    if (c.kind === "doc" || c.kind === "frame") walkAndFilter(c, keep);
  }
}

function getRaw(attrs: Attrs, name: string): string | undefined {
  return attrs[name]?.value;
}

function readDirection(attrs: Attrs, ctx: Ctx): Direction | undefined {
  const attr = attrs.direction;
  if (attr === undefined) return undefined;
  const raw = attr.value;
  if (isDirection(raw)) return raw;
  ctx.diagnostics.push(
    error(
      "ir/invalid-direction",
      `'direction' must be one of ${DIRECTIONS.join(", ")} (got '${raw}')`,
      attr.span,
    ),
  );
  return undefined;
}

function readLayoutMode(attrs: Attrs, ctx: Ctx): LayoutMode | undefined {
  const attr = attrs.layout;
  if (attr === undefined) return undefined;
  const raw = attr.value;
  if (isLayoutMode(raw)) return raw;
  ctx.diagnostics.push(
    error(
      "ir/bad-layout-mode",
      `'layout' must be one of ${LAYOUT_MODES.join(", ")} (got '${raw}')`,
      attr.span,
    ),
  );
  return undefined;
}

function readAlign(attrs: Attrs, ctx: Ctx): Align | undefined {
  const attr = attrs.align;
  if (attr === undefined) return undefined;
  const raw = attr.value;
  if (isAlign(raw)) return raw;
  ctx.diagnostics.push(
    error(
      "ir/bad-align",
      `'align' must be one of ${ALIGNS.join(", ")} (got '${raw}')`,
      attr.span,
    ),
  );
  return undefined;
}

function readBoolean(attrs: Attrs, name: string, ctx: Ctx): boolean | undefined {
  const attr = attrs[name];
  if (attr === undefined) return undefined;
  const raw = attr.value;
  if (raw === "true") return true;
  if (raw === "false") return false;
  ctx.diagnostics.push(
    error(
      "ir/invalid-boolean-attr",
      `'${name}' must be 'true' or 'false' (got '${raw}')`,
      attr.span,
    ),
  );
  return undefined;
}

function readEnum<T extends string>(
  attrs: Attrs,
  name: string,
  values: readonly T[],
  ctx: Ctx,
): T | undefined {
  const attr = attrs[name];
  if (attr === undefined) return undefined;
  const raw = attr.value;
  if ((values as readonly string[]).includes(raw)) return raw as T;
  ctx.diagnostics.push(
    error(
      "ir/invalid-style-value",
      `'${name}' must be one of ${values.join(", ")} (got '${raw}')`,
      attr.span,
    ),
  );
  return undefined;
}

function optionalString(
  attrs: Attrs,
  name: "label" | "name" | "on",
): { label?: string } | { name?: string } | { on?: string } {
  const raw = getRaw(attrs, name);
  if (raw === undefined) return {} as { label?: string };
  return { [name]: raw } as { label?: string } | { name?: string } | { on?: string };
}

function numericAttrs<K extends string>(
  attrs: Attrs,
  ctx: Ctx,
  keys: readonly K[],
): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const key of keys) {
    const v = attrs[key];
    if (v === undefined) continue;
    const n = Number(v.value);
    if (!Number.isFinite(n)) {
      ctx.diagnostics.push(
        error(
          "ir/invalid-numeric-attr",
          `'${key}' is not a finite number: '${v.value}'`,
          v.span,
        ),
      );
      continue;
    }
    out[key] = n;
  }
  return out;
}
