/**
 * Test-only AST builders. The text parser used to be the terse way to build
 * an AST in a unit test; this replaces it without depending on `src/runtime`
 * (domain may not import runtime - see CONTEXT.md dependency rules).
 *
 * The per-attribute column is synthetic (there's no source text to compute a
 * real one from) - it only exists so tests can tell attribute spans apart.
 */
import type {
  AstBox,
  AstDoc,
  AstEdge,
  AstFrame,
  AstNode,
  AstNote,
  Attrs,
} from "./ast.js";

type Props = Record<string, string | number | boolean | undefined>;

export function astBuilders(file = "test.tldx") {
  const elSpan = { file, line: 1, column: 1 };

  function attrs(props: Props): Attrs {
    const out: Attrs = {};
    let i = 0;
    for (const [name, value] of Object.entries(props)) {
      if (value === undefined) continue;
      const span = { file, line: 1, column: i + 2 };
      out[name] = { value: String(value), span, nameSpan: span };
      i++;
    }
    return out;
  }

  return {
    doc(props: Props, children: AstNode[] = []): AstDoc {
      return { kind: "doc", attrs: attrs(props), children, span: elSpan };
    },
    frame(props: Props, children: AstNode[] = [], group = false, tag?: string): AstFrame {
      return {
        kind: "frame",
        attrs: attrs(props),
        children,
        ...(group ? { group: true } : {}),
        ...(tag !== undefined ? { tag } : {}),
        span: elSpan,
      };
    },
    box(props: Props): AstBox {
      return { kind: "box", attrs: attrs(props), span: elSpan };
    },
    text(props: Props, body = ""): AstBox {
      return { kind: "box", attrs: attrs(props), text: true, body, tag: "Text", span: elSpan };
    },
    note(props: Props, text: string, sticky = false, tag?: string): AstNote {
      return {
        kind: "note",
        attrs: attrs(props),
        text,
        ...(sticky ? { sticky: true } : {}),
        ...(tag !== undefined ? { tag } : {}),
        span: elSpan,
      };
    },
    edge(props: Props): AstEdge {
      return { kind: "edge", attrs: attrs(props), span: elSpan };
    },
  };
}
