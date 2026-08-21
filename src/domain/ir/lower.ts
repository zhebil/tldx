/**
 * AST → IR lowering for the MVP grammar.
 *
 * Validates and normalizes:
 * - root must be `<doc>` (parser-side: any single element is allowed; IR
 *   rejects non-doc roots so downstream stages don't need to special-case);
 * - addressable elements (`<box>`, `<frame>`) require an explicit `id`;
 * - non-addressable elements (`<note>`, `<edge>`) get a synthesized id per
 *   ADR-12 (`<content-hash>-<n>`) when none is authored;
 * - `id`s are unique across the document;
 * - `<edge from to>` reference real ids and use bare-id form (anchor and
 *   free-endpoint syntaxes are phase 1, not MVP);
 * - `x | y | w | h` parse as finite numbers when present.
 * - attributes outside the fixed allowed set per element kind are rejected
 *   with `ir/unknown-prop` (replaces the type checker the MVP doesn't have).
 *
 * Errors do not abort lowering; the IR is produced best-effort and the
 * caller decides what to do based on `hasErrors(diagnostics)`. Edges that
 * fail validation are dropped from the IR (layout shouldn't see broken refs).
 */

import {
  error,
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
  IRBox,
  IRDoc,
  IREdge,
  IRElement,
  IRFrame,
  IRNote,
} from "./ir.js";
import { contentHash, SyntheticIdAllocator } from "./synthetic-id.js";

const ALLOWED_PROPS = {
  doc: ["id", "direction", "layout", "gap", "pad", "cols", "align"],
  frame: [
    "id",
    "name",
    "direction",
    "layout",
    "gap",
    "pad",
    "cols",
    "align",
    "x",
    "y",
    "w",
    "h",
  ],
  box: ["id", "label", "x", "y", "w", "h", "maxW"],
  note: ["id", "x", "y", "w", "h"],
  edge: ["id", "from", "to"],
} as const;

/**
 * Reject attributes outside the fixed allowed set for this element kind.
 * This is the safety net standing in for a type checker: unknown props
 * (typos, unimplemented DSL surface) become `ir/unknown-prop` diagnostics
 * but do not stop lowering.
 */
function checkUnknownProps(
  kind: keyof typeof ALLOWED_PROPS,
  attrs: Attrs,
  ctx: Ctx,
): void {
  const allowed: readonly string[] = ALLOWED_PROPS[kind];
  for (const [name, attr] of Object.entries(attrs)) {
    if (allowed.includes(name)) continue;
    ctx.diagnostics.push(
      error(
        "ir/unknown-prop",
        `'${name}' is not supported on '<${kind}>' (allowed: ${allowed.join(", ")})`,
        attr.nameSpan,
      ),
    );
  }
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
        `top-level element must be '<doc>', got '<${ast.kind}>'`,
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

  checkUnknownProps("doc", ast.attrs, ctx);

  // Pass 1: walk and assign ids.
  const idHeader = assignId(ast.attrs, ast.span, ctx, {
    kind: "doc",
    addressable: false,
    contentFields: () => [],
  });
  const direction = readDirection(ast.attrs, ctx);
  const layout = readLayoutMode(ast.attrs, ctx);
  const align = readAlign(ast.attrs, ctx);
  const doc: IRDoc = {
    kind: "doc",
    ...idHeader,
    span: ast.span,
    children: [],
    ...(direction === undefined ? {} : { direction }),
    ...(layout === undefined ? {} : { layout }),
    ...(align === undefined ? {} : { align }),
    ...numericAttrs(ast.attrs, ctx, ["gap", "pad", "cols"] as const),
  };
  for (const child of ast.children) {
    const lowered = lowerNode(child, ctx);
    if (lowered !== null) doc.children.push(lowered);
  }

  // Pass 2: resolve edge references now that all ids exist.
  resolveEdges(doc, ctx);

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
      // doc nested under doc is illegal at the parser level (multiple-roots),
      // but defend in depth.
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
  checkUnknownProps("frame", node.attrs, ctx);
  const direction = readDirection(node.attrs, ctx);
  const layout = readLayoutMode(node.attrs, ctx);
  const align = readAlign(node.attrs, ctx);
  const frame: IRFrame = {
    kind: "frame",
    ...assignId(node.attrs, node.span, ctx, {
      kind: "frame",
      addressable: true,
      contentFields: () => [getRaw(node.attrs, "name") ?? ""],
    }),
    span: node.span,
    children: [],
    ...optionalString(node.attrs, "name"),
    ...(direction === undefined ? {} : { direction }),
    ...(layout === undefined ? {} : { layout }),
    ...(align === undefined ? {} : { align }),
    ...numericAttrs(node.attrs, ctx, ["x", "y", "w", "h"] as const),
    ...numericAttrs(node.attrs, ctx, ["gap", "pad", "cols"] as const),
  };
  for (const child of node.children) {
    const lowered = lowerNode(child, ctx);
    if (lowered !== null) frame.children.push(lowered);
  }
  return frame;
}

function lowerBox(node: AstBox, ctx: Ctx): IRBox {
  checkUnknownProps("box", node.attrs, ctx);
  return {
    kind: "box",
    ...assignId(node.attrs, node.span, ctx, {
      kind: "box",
      addressable: true,
      contentFields: () => [getRaw(node.attrs, "label") ?? ""],
    }),
    span: node.span,
    ...optionalString(node.attrs, "label"),
    ...numericAttrs(node.attrs, ctx, ["x", "y", "w", "h", "maxW"] as const),
  };
}

function lowerNote(node: AstNote, ctx: Ctx): IRNote {
  checkUnknownProps("note", node.attrs, ctx);
  return {
    kind: "note",
    ...assignId(node.attrs, node.span, ctx, {
      kind: "note",
      addressable: false,
      contentFields: () => [node.text],
    }),
    span: node.span,
    text: node.text,
    ...numericAttrs(node.attrs, ctx, ["x", "y", "w", "h"] as const),
  };
}

function lowerEdge(node: AstEdge, ctx: Ctx): IREdge | null {
  checkUnknownProps("edge", node.attrs, ctx);
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

  return {
    kind: "edge",
    ...assignId(node.attrs, node.span, ctx, {
      kind: "edge",
      addressable: false,
      contentFields: () => [from, to],
    }),
    span: node.span,
    from,
    to,
  };
}

/**
 * Resolve the `id` attribute against the policy for this element kind:
 * record the explicit id (or diagnose duplicate / empty), or synthesize
 * per ADR-12. Also emits `ir/missing-id` for addressable elements that
 * arrive without one. This is the single place the id rules live.
 */
function assignId(
  attrs: Attrs,
  elementSpan: SourceSpan,
  ctx: Ctx,
  spec: {
    kind: "doc" | "frame" | "box" | "note" | "edge";
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
        `'<${spec.kind}>' is addressable and requires an explicit 'id'`,
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

/**
 * Resolve `from`/`to` references to known ids. Drops edges whose endpoints
 * point at nothing; emits `ir/unknown-reference` for each.
 */
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

function optionalString(
  attrs: Attrs,
  name: "label" | "name",
): { label?: string } | { name?: string } {
  const raw = getRaw(attrs, name);
  if (raw === undefined) return {} as { label?: string };
  return { [name]: raw } as { label?: string } | { name?: string };
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
