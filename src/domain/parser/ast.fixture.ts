/**
 * Test-only AST builders. The per-attribute column is synthetic - there is no
 * source text to compute a real one from, so it only exists to let tests tell
 * attribute spans apart.
 */
import type { AstBox, AstDoc, AstEdge, AstFrame, AstNode, AstNote, Attrs } from "./ast.js";

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

  // Arrow properties, not method shorthand: every test destructures these off
  // the returned object, and methods carry a `this` that makes that a lint
  // error (typescript/unbound-method) at ~55 call sites.
  return {
    doc: (props: Props, children: AstNode[] = []): AstDoc => ({
      kind: "doc",
      attrs: attrs(props),
      children,
      span: elSpan,
    }),
    frame: (props: Props, children: AstNode[] = [], group = false, tag?: string): AstFrame => ({
      kind: "frame",
      attrs: attrs(props),
      children,
      ...(group ? { group: true } : {}),
      ...(tag !== undefined ? { tag } : {}),
      span: elSpan,
    }),
    box: (props: Props): AstBox => ({ kind: "box", attrs: attrs(props), span: elSpan }),
    text: (props: Props, body = ""): AstBox => ({
      kind: "box",
      attrs: attrs(props),
      text: true,
      body,
      tag: "Text",
      span: elSpan,
    }),
    note: (props: Props, text: string, sticky = false, tag?: string): AstNote => ({
      kind: "note",
      attrs: attrs(props),
      text,
      ...(sticky ? { sticky: true } : {}),
      ...(tag !== undefined ? { tag } : {}),
      span: elSpan,
    }),
    edge: (props: Props): AstEdge => ({ kind: "edge", attrs: attrs(props), span: elSpan }),
  };
}
