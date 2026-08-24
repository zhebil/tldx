/**
 * The `"tldx"` component library. Each component is a plain function that
 * builds the exact AST node shape `domain/parser/ast.ts` already defines -
 * no React, no reconciler (see docs/jsx-pivot.md decision 1). `jsx`/`jsxs`/
 * `jsxDEV` call these functions directly and return whatever they return.
 */
import type { SourceSpan } from "../contracts/diagnostic.js";
import type {
  AstBox,
  AstDoc,
  AstEdge,
  AstFrame,
  AstNode,
  AstNote,
  AttrValue,
  Attrs,
} from "../domain/parser/ast.js";

/** The `source` esbuild's automatic JSX transform passes to `jsxDEV`. */
export type JsxSource = {
  fileName: string;
  lineNumber: number;
  columnNumber: number;
};

export type Props = Record<string, unknown>;

const ZERO_SPAN: SourceSpan = { file: "", line: 0, column: 0 };

function toSpan(source: JsxSource | undefined): SourceSpan {
  if (!source) return ZERO_SPAN;
  return {
    file: source.fileName,
    line: source.lineNumber,
    column: source.columnNumber,
  };
}

// jsxDEV gives one source per element, not per attribute - every attr on a
// node shares the element's span for both `span` and `nameSpan`.
function propsToAttrs(props: Props, span: SourceSpan): Attrs {
  const attrs: Attrs = {};
  for (const [name, value] of Object.entries(props)) {
    if (name === "children") continue;
    if (value === undefined || value === null) continue;
    const attrValue: AttrValue = { value: String(value), span, nameSpan: span };
    attrs[name] = attrValue;
  }
  return attrs;
}

function isAstNode(value: unknown): value is AstNode {
  return typeof value === "object" && value !== null && "kind" in value;
}

/** Flattens `.map()` arrays, drops null/undefined/boolean. Any string throws
 * - only <Sticky> and <Text> accept text children. */
export function flattenNodes(children: unknown, componentName: string): AstNode[] {
  const nodes: AstNode[] = [];
  function walk(child: unknown): void {
    if (child === null || child === undefined || typeof child === "boolean") return;
    if (Array.isArray(child)) {
      child.forEach(walk);
      return;
    }
    if (typeof child === "string") {
      throw new Error(
        `<${componentName}> does not accept text children (only <Sticky> and <Text> do)`,
      );
    }
    if (isAstNode(child)) {
      nodes.push(child);
      return;
    }
    throw new Error(`<${componentName}> received an unsupported child: ${String(child)}`);
  }
  walk(children);
  return nodes;
}

/** Joins/trims text children into a single body string. Shared by `<Sticky>` and `<Text>`. */
function bodyText(children: unknown, componentName: string): string {
  const parts: string[] = [];
  function walk(child: unknown): void {
    if (child === null || child === undefined || typeof child === "boolean") return;
    if (Array.isArray(child)) {
      child.forEach(walk);
      return;
    }
    if (typeof child === "string") {
      parts.push(child);
      return;
    }
    throw new Error(`<${componentName}> may only contain text, not an element`);
  }
  walk(children);
  return parts.join("").trim();
}

function assertNoChildren(children: unknown, componentName: string): void {
  if (children === undefined || children === null) return;
  if (Array.isArray(children) && children.length === 0) return;
  throw new Error(`<${componentName}> is a leaf element and cannot have children`);
}

/** Calls a resolved JSX `type` with `(props, source)`. Components declared
 * here, and user-defined components, share this calling convention. */
export function invokeComponent(
  type: unknown,
  props: Props,
  source: JsxSource | undefined,
): unknown {
  if (typeof type !== "function") {
    throw new Error(`unknown element <${String(type)}> - not a tldx component`);
  }
  return (type as (props: Props, source?: JsxSource) => unknown)(props, source);
}

export function Doc(props: Props, source?: JsxSource): AstDoc {
  const span = toSpan(source);
  return {
    kind: "doc",
    attrs: propsToAttrs(props, span),
    children: flattenNodes(props.children, "Doc"),
    span,
  };
}

export function Frame(props: Props, source?: JsxSource): AstFrame {
  const span = toSpan(source);
  return {
    kind: "frame",
    attrs: propsToAttrs(props, span),
    children: flattenNodes(props.children, "Frame"),
    span,
  };
}

/** `layout="row"` shorthand; `layout` on `props` (if any) is overridden. */
export function Row(props: Props, source?: JsxSource): AstFrame {
  return { ...Frame({ ...props, layout: "row" }, source), tag: "Row" };
}

/** `layout="col"` shorthand; `layout` on `props` (if any) is overridden. */
export function Col(props: Props, source?: JsxSource): AstFrame {
  return { ...Frame({ ...props, layout: "col" }, source), tag: "Col" };
}

/** `layout="grid"` shorthand; `layout` on `props` (if any) is overridden. */
export function Grid(props: Props, source?: JsxSource): AstFrame {
  return { ...Frame({ ...props, layout: "grid" }, source), tag: "Grid" };
}

/** A `<Frame>` that draws no frame chrome and reserves no title space; still
 * a layout container (see `domain/emit/emit.ts`'s `group` handling). */
export function Group(props: Props, source?: JsxSource): AstFrame {
  return { ...Frame(props, source), group: true, tag: "Group" };
}

/** A row (default) or col frame whose non-edge children are auto-connected
 * in sequence via `flow(...)` - skip-free by construction, no hand-written
 * `flow()` call needed. `layout` on `props` (if any) overrides the row
 * default. Throws if any non-edge child has no `id`. */
export function Pipeline(props: Props, source?: JsxSource): AstNode[] {
  const frame: AstFrame = { ...Frame({ layout: "row", ...props }, source), tag: "Pipeline" };
  const ids = frame.children
    .filter((child) => child.kind !== "edge")
    .map((child) => {
      const id = child.attrs.id?.value;
      if (id === undefined) {
        throw new Error("<Pipeline> requires every child to have an id");
      }
      return id;
    });
  return [frame, ...flow(...ids)];
}

/** Rebuilds `child`'s `attrs` with `layout: "row"`, keyed to the child's own
 * span. Does not mutate `child`. */
function withRowLayout(child: AstFrame): AstFrame {
  const layoutSpan = child.span;
  return {
    ...child,
    attrs: {
      ...child.attrs,
      layout: { value: "row", span: layoutSpan, nameSpan: layoutSpan },
    },
  };
}

/** A `layout="col"` frame of tiers - the block-schema shape. Each direct
 * frame child is coerced to `layout="row"`. A tier with no `name` is also
 * marked `group: true` (structural, no chrome, no title); a named tier keeps
 * its frame chrome. Non-frame children (a bare `<Box>` tier) pass through
 * untouched. */
export function Layers(props: Props, source?: JsxSource): AstFrame {
  const frame = Frame({ ...props, layout: "col" }, source);
  return {
    ...frame,
    tag: "Layers",
    children: frame.children.map((child) => {
      if (child.kind !== "frame") return child;
      const tier = withRowLayout(child);
      return child.attrs.name === undefined ? { ...tier, group: true } : tier;
    }),
  };
}

/** A `layout="col"` frame of lanes. Each direct frame child is coerced to
 * `layout="row"` but keeps its chrome - a lane is a labelled frame, unlike a
 * `<Layers>` tier. Non-frame children pass through untouched. */
export function Swimlanes(props: Props, source?: JsxSource): AstFrame {
  const frame = Frame({ ...props, layout: "col" }, source);
  return {
    ...frame,
    tag: "Swimlanes",
    children: frame.children.map((child) => (child.kind === "frame" ? withRowLayout(child) : child)),
  };
}

/** `layout="auto"` shorthand for relationships with no natural order. */
export function Graph(props: Props, source?: JsxSource): AstFrame {
  return { ...Frame({ ...props, layout: "auto" }, source), tag: "Graph" };
}

export function Box(props: Props, source?: JsxSource): AstBox {
  const span = toSpan(source);
  assertNoChildren(props.children, "Box");
  return { kind: "box", attrs: propsToAttrs(props, span), span };
}

/** A real tldraw sticky note - fixed 200px wide, self-growing height. The
 * only surviving "note" alias (C2, tldx-npd): the old plain `<Note>`, which
 * emitted a hand-rolled geo-rectangle imitation, is retired in favour of
 * this (attached or free-floating annotation) or `<Text>` (borderless,
 * unstyled caption). Same AST node kind as the old `<Note>` (`"note"`),
 * marked `sticky: true`. */
export function Sticky(props: Props, source?: JsxSource): AstNote {
  const span = toSpan(source);
  return {
    kind: "note",
    attrs: propsToAttrs(props, span),
    text: bodyText(props.children, "Sticky"),
    sticky: true,
    tag: "Sticky",
    span,
  };
}

/** A borderless, fill-less caption - just glyphs on the canvas. Same "box"
 * IR kind as `<Box>` (`IRBox.text`), so it sizes and flows exactly like one;
 * `domain/emit/emit.ts` emits it as a tldraw `text` shape instead of a `geo`
 * rectangle. Content is JSX children (like `<Sticky>`), not a `label` prop. */
export function Text(props: Props, source?: JsxSource): AstBox {
  const span = toSpan(source);
  return {
    kind: "box",
    attrs: propsToAttrs(props, span),
    text: true,
    body: bodyText(props.children, "Text"),
    tag: "Text",
    span,
  };
}

export function Edge(props: Props, source?: JsxSource): AstEdge {
  const span = toSpan(source);
  assertNoChildren(props.children, "Edge");
  return { kind: "edge", attrs: propsToAttrs(props, span), span };
}

/**
 * `<Edges>{`a -> b\nb -> c: label`}</Edges>` - a compact multi-line
 * alternative to a block of hand-written `<Edge>` tags (tldx-2rr). Each
 * non-blank line is `id ("->" id)+ (":" label)?`; a chain of N ids expands
 * to N-1 edges, mirroring `flow()`'s pairwise semantics with an optional
 * shared label. Props other than `children` (the same style set `<Edge>`
 * accepts - never `id`, `from`, `to`, or `label`, which are per-line only)
 * are copied onto every edge the block produces, so a same-styled batch
 * needs the style written once, not once per edge.
 *
 * Unlike `flow()`, this is a JSX element, so jsxDEV hands it a real
 * `source` - each edge's span is computed by counting the newlines inside
 * the (source-preserved) string, offset from the `<Edges>` tag's own line.
 * That is a real per-line span, finer than `<Edge>`'s existing
 * shared-per-element span - not the zero span `flow()`'s edges carry
 * (tldx-7kx; left open here, see design note on tldx-2rr for why).
 *
 * Children must be a single string expression (`{`...`}`), not bare JSX
 * text: esbuild's automatic JSX transform collapses newlines in JSX text
 * children and rejects a literal `>`, which would silently destroy this
 * grammar.
 */
export function Edges(props: Props, source?: JsxSource): AstEdge[] {
  const span = toSpan(source);
  const { children, ...styleProps } = props;
  const sharedAttrs = propsToAttrs(styleProps, span);
  const spec = edgesSpecText(children);
  const edges: AstEdge[] = [];
  spec.split("\n").forEach((raw, i) => {
    const trimmed = raw.trim();
    if (trimmed === "") return;
    const indent = raw.length - raw.trimStart().length;
    const lineSpan: SourceSpan = {
      ...span,
      line: span.line + i,
      column: i === 0 ? span.column + indent : indent,
    };
    edges.push(...parseFlowLine(trimmed, lineSpan, sharedAttrs));
  });
  return edges;
}

function edgesSpecText(children: unknown): string {
  if (typeof children === "string") return children;
  if (Array.isArray(children) && children.length === 1 && typeof children[0] === "string") {
    return children[0];
  }
  throw new Error(
    "<Edges> requires a single string of edge specs, e.g. <Edges>{`a -> b`}</Edges>",
  );
}

/**
 * One line of `<Edges>` grammar: `id ("->" id)+ (":" label)?`. A chain of
 * N ids becomes N-1 edges sharing the line's label and block-level attrs.
 * A line that doesn't parse into at least two ids becomes a single edge
 * missing `to` - lower.ts's existing `ir/missing-edge-endpoint` check
 * reports it, the same diagnostic a hand-written `<Edge>` missing `to`
 * gets - deliberately not a new "malformed compact syntax" code.
 */
function parseFlowLine(line: string, span: SourceSpan, sharedAttrs: Attrs): AstEdge[] {
  const colon = line.indexOf(":");
  const chainPart = colon === -1 ? line : line.slice(0, colon);
  const label = colon === -1 ? undefined : line.slice(colon + 1).trim();
  const ids = chainPart
    .split("->")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (ids.length < 2) {
    const attrs: Attrs = { ...sharedAttrs };
    if (ids[0] !== undefined) {
      attrs.from = { value: ids[0], span, nameSpan: span };
    }
    return [{ kind: "edge", attrs, span }];
  }

  const edges: AstEdge[] = [];
  for (let i = 0; i + 1 < ids.length; i += 1) {
    const attrs: Attrs = {
      ...sharedAttrs,
      from: { value: ids[i]!, span, nameSpan: span },
      to: { value: ids[i + 1]!, span, nameSpan: span },
    };
    if (label) attrs.label = { value: label, span, nameSpan: span };
    edges.push({ kind: "edge", attrs, span });
  }
  return edges;
}

/** `flow("a", "b", "c")` -> edges a->b, b->c. No per-call source, so its
 * edges carry the zero span. */
export function flow(...ids: string[]): AstEdge[] {
  const edges: AstEdge[] = [];
  for (let i = 0; i + 1 < ids.length; i += 1) {
    const from = ids[i];
    const to = ids[i + 1];
    if (from === undefined || to === undefined) continue;
    edges.push({
      kind: "edge",
      attrs: {
        from: { value: from, span: ZERO_SPAN, nameSpan: ZERO_SPAN },
        to: { value: to, span: ZERO_SPAN, nameSpan: ZERO_SPAN },
      },
      span: ZERO_SPAN,
    });
  }
  return edges;
}
