/**
 * The `"tldsl"` component library. Each component is a plain function that
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
 * - only <Note> accepts text children. */
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
        `<${componentName}> does not accept text children (only <Note> does)`,
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

function noteBody(children: unknown): string {
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
    throw new Error("<Note> may only contain text, not an element");
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
    throw new Error(`unknown element <${String(type)}> - not a tldsl component`);
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

export function Box(props: Props, source?: JsxSource): AstBox {
  const span = toSpan(source);
  assertNoChildren(props.children, "Box");
  return { kind: "box", attrs: propsToAttrs(props, span), span };
}

export function Note(props: Props, source?: JsxSource): AstNote {
  const span = toSpan(source);
  return {
    kind: "note",
    attrs: propsToAttrs(props, span),
    text: noteBody(props.children),
    span,
  };
}

export function Edge(props: Props, source?: JsxSource): AstEdge {
  const span = toSpan(source);
  assertNoChildren(props.children, "Edge");
  return { kind: "edge", attrs: propsToAttrs(props, span), span };
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
