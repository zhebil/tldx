/**
 * Tree-builder over the tokens emitted by `tokenize()`. Produces the AST
 * defined in `./ast.ts`. Validates structural rules of the MVP grammar:
 *
 * - Tag names must be in the MVP set (`doc`, `frame`, `box`, `note`, `edge`).
 *   Unknown tags get `parser/unknown-element`; their subtree is skipped.
 * - `<box>` and `<edge>` are leaves. Inner content is rejected with
 *   `parser/text-not-allowed` (their attrs say everything).
 * - `<note>` is text-only. Nested elements get `parser/element-not-allowed`.
 * - `<doc>` and `<frame>` are containers. They accept element children;
 *   non-whitespace text gets `parser/text-not-allowed`.
 * - Mismatched `</close>` pops to the matching open and reports each
 *   skipped-over open as `parser/unclosed-tag`. Unclosed tags at EOF
 *   produce one `parser/unclosed-tag` per still-open element.
 *
 * Comments are dropped (MVP: no comments-as-stickies).
 */

import {
  error,
  type Diagnostic,
  type SourceSpan,
} from "../diagnostics/index.js";

import {
  isAllowedElementName,
  ALLOWED_ELEMENT_NAMES,
  type AstNode,
} from "./ast.js";
import { tokenize, type Token } from "./tokenize.js";

export type ParseResult = {
  /** First top-level element, or null if the source has none. */
  ast: AstNode | null;
  diagnostics: Diagnostic[];
};

export function parse(source: string, file: string): ParseResult {
  const { tokens, diagnostics } = tokenize(source, file);

  let i = 0;

  function peek(): Token | undefined {
    return tokens[i];
  }

  function advance(): Token | undefined {
    const t = tokens[i];
    i += 1;
    return t;
  }

  function unknownElementHint(): string {
    return ` (allowed: ${ALLOWED_ELEMENT_NAMES.join(", ")})`;
  }

  /**
   * Skip tokens until the matching close tag for `name` at the current depth.
   * Used to recover after an unknown element so we don't emit cascading
   * errors for its children. Returns true if we consumed the matching close.
   */
  function skipToMatchingClose(name: string): boolean {
    let depth = 1;
    while (i < tokens.length) {
      const t = advance()!;
      if (t.kind === "open" && !t.selfClosing && t.name === name) depth += 1;
      else if (t.kind === "close" && t.name === name) {
        depth -= 1;
        if (depth === 0) return true;
      }
    }
    return false;
  }

  function parseElement(open: Token & { kind: "open" }): AstNode | null {
    if (!isAllowedElementName(open.name)) {
      diagnostics.push(
        error(
          "parser/unknown-element",
          `unknown element '<${open.name}>'${unknownElementHint()}`,
          open.nameSpan,
        ),
      );
      if (!open.selfClosing) skipToMatchingClose(open.name);
      return null;
    }

    if (open.name === "box" || open.name === "edge") {
      return parseLeafElement(open as OpenToken<"box"> | OpenToken<"edge">);
    }

    if (open.name === "note") {
      return parseNoteElement(open as OpenToken<"note">);
    }

    return parseContainerElement(open as OpenToken<"doc"> | OpenToken<"frame">);
  }

  function parseLeafElement(open: OpenToken<"box" | "edge">): AstNode {
    if (!open.selfClosing) {
      // accept paired-empty form, but reject any inner content
      consumeChildrenRejectingAll(open.name);
    }
    return {
      kind: open.name,
      attrs: open.attrs,
      span: open.span,
    };
  }

  function parseNoteElement(open: OpenToken<"note">): AstNode {
    if (open.selfClosing) {
      return { kind: "note", attrs: open.attrs, text: "", span: open.span };
    }
    let text = "";
    while (i < tokens.length) {
      const t = peek()!;
      if (t.kind === "close") {
        if (t.name === "note") {
          advance();
        } else {
          diagnostics.push(
            error(
              "parser/mismatched-close",
              `expected '</note>' but found '</${t.name}>'`,
              t.nameSpan,
            ),
          );
          // do not consume - let caller handle
        }
        return {
          kind: "note",
          attrs: open.attrs,
          text: text.trim(),
          span: open.span,
        };
      }
      if (t.kind === "open") {
        diagnostics.push(
          error(
            "parser/element-not-allowed",
            `'<note>' may only contain text, not '<${t.name}>'`,
            t.nameSpan,
          ),
        );
        // skip the nested element entirely
        advance();
        if (!t.selfClosing) skipToMatchingClose(t.name);
        continue;
      }
      if (t.kind === "text") {
        text += t.value;
        advance();
        continue;
      }
      // comment
      advance();
    }
    diagnostics.push(unclosedTagDiag(open.name, open.nameSpan));
    return {
      kind: "note",
      attrs: open.attrs,
      text: text.trim(),
      span: open.span,
    };
  }

  function parseContainerElement(
    open: OpenToken<"doc" | "frame">,
  ): AstNode {
    if (open.selfClosing) {
      return {
        kind: open.name,
        attrs: open.attrs,
        children: [],
        span: open.span,
      };
    }
    const children: AstNode[] = [];
    while (i < tokens.length) {
      const t = peek()!;
      if (t.kind === "close") {
        if (t.name === open.name) {
          advance();
        } else {
          diagnostics.push(
            error(
              "parser/mismatched-close",
              `expected '</${open.name}>' but found '</${t.name}>'`,
              t.nameSpan,
            ),
          );
          // do not consume; let the outer container see it
        }
        return {
          kind: open.name,
          attrs: open.attrs,
          children,
          span: open.span,
        };
      }
      if (t.kind === "open") {
        advance();
        const child = parseElement(t);
        if (child !== null) children.push(child);
        continue;
      }
      if (t.kind === "text") {
        if (t.value.trim() !== "") {
          diagnostics.push(
            error(
              "parser/text-not-allowed",
              `text content is not allowed inside '<${open.name}>'`,
              t.span,
            ),
          );
        }
        advance();
        continue;
      }
      // comment
      advance();
    }
    diagnostics.push(unclosedTagDiag(open.name, open.nameSpan));
    return {
      kind: open.name,
      attrs: open.attrs,
      children,
      span: open.span,
    };
  }

  function consumeChildrenRejectingAll(name: string): void {
    while (i < tokens.length) {
      const t = peek()!;
      if (t.kind === "close") {
        if (t.name === name) {
          advance();
        } else {
          diagnostics.push(
            error(
              "parser/mismatched-close",
              `expected '</${name}>' but found '</${t.name}>'`,
              t.nameSpan,
            ),
          );
        }
        return;
      }
      if (t.kind === "open") {
        diagnostics.push(
          error(
            "parser/element-not-allowed",
            `'<${name}>' is a leaf element and may not contain '<${t.name}>'`,
            t.nameSpan,
          ),
        );
        advance();
        if (!t.selfClosing) skipToMatchingClose(t.name);
        continue;
      }
      if (t.kind === "text") {
        if (t.value.trim() !== "") {
          diagnostics.push(
            error(
              "parser/text-not-allowed",
              `'<${name}>' is a leaf element and may not contain text`,
              t.span,
            ),
          );
        }
        advance();
        continue;
      }
      advance();
    }
    diagnostics.push(
      error(
        "parser/unclosed-tag",
        `'<${name}>' is not closed before end of file`,
        // best-effort: we only have name, not the open span here
        { file, line: 1, column: 1 },
      ),
    );
  }

  function unclosedTagDiag(name: string, span: SourceSpan): Diagnostic {
    return error(
      "parser/unclosed-tag",
      `'<${name}>' is not closed before end of file`,
      span,
    );
  }

  let root: AstNode | null = null;

  while (i < tokens.length) {
    const t = peek()!;
    if (t.kind === "comment") {
      advance();
      continue;
    }
    if (t.kind === "text") {
      if (t.value.trim() !== "") {
        diagnostics.push(
          error(
            "parser/unexpected-text",
            "text content is not allowed at the top level",
            t.span,
          ),
        );
      }
      advance();
      continue;
    }
    if (t.kind === "close") {
      diagnostics.push(
        error(
          "parser/unexpected-close",
          `unexpected '</${t.name}>' with no matching open tag`,
          t.nameSpan,
        ),
      );
      advance();
      continue;
    }
    advance();
    const node = parseElement(t);
    if (node !== null) {
      if (root === null) {
        root = node;
      } else {
        diagnostics.push(
          error(
            "parser/multiple-roots",
            "only one top-level element is allowed",
            node.span,
          ),
        );
      }
    }
  }

  return { ast: root, diagnostics };
}

type OpenToken<N extends string = string> = Token & {
  kind: "open";
  name: N;
};
