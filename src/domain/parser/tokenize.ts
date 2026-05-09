/**
 * Lexer for the tldsl DSL. Emits high-level tokens that the parser turns
 * into an AST. Tokens carry source spans (1-based line/col) so diagnostics
 * can point at the exact character.
 *
 * Error recovery: on a malformed tag we emit a diagnostic and skip to the
 * next `>` (or EOF) so the rest of the file still tokenizes. The parser
 * gets a list of well-formed tokens plus diagnostics for the broken bits.
 *
 * Pure: no I/O. Source text in, tokens + diagnostics out.
 */

import {
  error,
  type Diagnostic,
  type SourceSpan,
} from "../diagnostics/index.js";

import type { Attrs, AttrValue } from "./ast.js";

export type Token =
  | {
      kind: "open";
      name: string;
      nameSpan: SourceSpan;
      attrs: Attrs;
      selfClosing: boolean;
      /** Span of the whole tag, from `<` to `>`. */
      span: SourceSpan;
    }
  | {
      kind: "close";
      name: string;
      nameSpan: SourceSpan;
      span: SourceSpan;
    }
  | { kind: "text"; value: string; span: SourceSpan }
  | { kind: "comment"; span: SourceSpan };

export type TokenizeResult = {
  tokens: Token[];
  diagnostics: Diagnostic[];
};

export function tokenize(source: string, file: string): TokenizeResult {
  const tokens: Token[] = [];
  const diagnostics: Diagnostic[] = [];

  let pos = 0;
  let line = 1;
  let column = 1;

  const len = source.length;

  function pushDiag(d: Diagnostic): void {
    diagnostics.push(d);
  }

  function spanAt(
    startLine: number,
    startCol: number,
    length: number,
  ): SourceSpan {
    return { file, line: startLine, column: startCol, length };
  }

  function snapshot(): { line: number; column: number; pos: number } {
    return { line, column, pos };
  }

  function advance(): void {
    if (pos >= len) return;
    const c = source[pos]!;
    pos += 1;
    if (c === "\n") {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }

  /** Advance past `count` characters, updating line/column for each. */
  function consume(count: number): void {
    for (let k = 0; k < count; k += 1) advance();
  }

  function peek(offset = 0): string | undefined {
    return source[pos + offset];
  }

  function startsWith(s: string): boolean {
    return source.startsWith(s, pos);
  }

  function isNameStart(c: string | undefined): boolean {
    if (c === undefined) return false;
    return /[A-Za-z_]/.test(c);
  }

  function isNameChar(c: string | undefined): boolean {
    if (c === undefined) return false;
    return /[A-Za-z0-9_-]/.test(c);
  }

  function readName(): { name: string; span: SourceSpan } {
    const start = snapshot();
    while (isNameChar(peek())) advance();
    return {
      name: source.slice(start.pos, pos),
      span: spanAt(start.line, start.column, pos - start.pos),
    };
  }

  function skipWhitespace(): void {
    while (pos < len) {
      const c = peek();
      if (c === " " || c === "\t" || c === "\n" || c === "\r") {
        advance();
      } else {
        break;
      }
    }
  }

  /** Skip to the next `>` (consumed) or EOF, for error recovery on a bad tag. */
  function recoverPastTag(): void {
    while (pos < len && peek() !== ">") advance();
    if (peek() === ">") advance();
  }

  function readComment(): void {
    const start = snapshot();
    consume("<!--".length);
    while (pos < len && !startsWith("-->")) advance();
    if (pos >= len) {
      pushDiag(
        error(
          "parser/unterminated-comment",
          "comment not terminated before end of file (missing '-->')",
          spanAt(start.line, start.column, "<!--".length),
        ),
      );
      tokens.push({
        kind: "comment",
        span: spanAt(start.line, start.column, pos - start.pos),
      });
      return;
    }
    consume("-->".length);
    tokens.push({
      kind: "comment",
      span: spanAt(start.line, start.column, pos - start.pos),
    });
  }

  function readCloseTag(): void {
    const start = snapshot();
    consume("</".length);
    if (!isNameStart(peek())) {
      pushDiag(
        error(
          "parser/expected-element-name",
          "expected element name after '</'",
          spanAt(line, column, 1),
        ),
      );
      recoverPastTag();
      return;
    }
    const { name, span: nameSpan } = readName();
    skipWhitespace();
    if (peek() !== ">") {
      pushDiag(
        error(
          "parser/expected-char",
          `expected '>' to close '</${name}'`,
          spanAt(line, column, 1),
        ),
      );
      recoverPastTag();
      return;
    }
    advance(); // `>`
    tokens.push({
      kind: "close",
      name,
      nameSpan,
      span: spanAt(start.line, start.column, pos - start.pos),
    });
  }

  function readAttrValue():
    | { ok: true; value: string; span: SourceSpan }
    | { ok: false } {
    const quote = peek();
    if (quote !== '"' && quote !== "'") {
      pushDiag(
        error(
          "parser/expected-attr-value",
          "expected '\"' or '\\'' to start attribute value",
          spanAt(line, column, 1),
        ),
      );
      return { ok: false };
    }
    advance(); // opening quote
    const valueStart = snapshot();
    while (pos < len && peek() !== quote && peek() !== "<") advance();
    if (peek() !== quote) {
      pushDiag(
        error(
          "parser/unterminated-string",
          "attribute value missing closing quote",
          spanAt(valueStart.line, valueStart.column, 1),
        ),
      );
      return { ok: false };
    }
    const value = source.slice(valueStart.pos, pos);
    const valueSpan = spanAt(
      valueStart.line,
      valueStart.column,
      pos - valueStart.pos,
    );
    advance(); // closing quote
    return { ok: true, value, span: valueSpan };
  }

  function readOpenTag(): void {
    const start = snapshot();
    advance(); // `<`
    if (!isNameStart(peek())) {
      pushDiag(
        error(
          "parser/expected-element-name",
          "expected element name after '<'",
          spanAt(line, column, 1),
        ),
      );
      recoverPastTag();
      return;
    }
    const { name, span: nameSpan } = readName();
    const attrs: Attrs = {};
    let selfClosing = false;

    while (pos < len) {
      skipWhitespace();
      const c = peek();
      if (c === ">") {
        advance();
        break;
      }
      if (c === "/" && peek(1) === ">") {
        consume("/>".length);
        selfClosing = true;
        break;
      }
      if (c === undefined) {
        pushDiag(
          error(
            "parser/unterminated-tag",
            `tag '<${name}' not closed before end of file`,
            spanAt(start.line, start.column, 1),
          ),
        );
        return;
      }
      if (!isNameStart(c)) {
        pushDiag(
          error(
            "parser/unexpected-character",
            `unexpected character '${c}' in tag '<${name}>'`,
            spanAt(line, column, 1),
          ),
        );
        recoverPastTag();
        return;
      }
      const { name: attrName, span: attrNameSpan } = readName();
      skipWhitespace();
      if (peek() !== "=") {
        pushDiag(
          error(
            "parser/expected-char",
            `expected '=' after attribute name '${attrName}'`,
            spanAt(line, column, 1),
          ),
        );
        recoverPastTag();
        return;
      }
      advance(); // `=`
      skipWhitespace();
      const valueResult = readAttrValue();
      if (!valueResult.ok) {
        // If the bad value brought us up to a `<`, it's almost certainly the
        // start of the next tag - don't swallow it during recovery. Otherwise
        // skip past the current tag's `>`.
        if (peek() !== "<") recoverPastTag();
        return;
      }
      const attrValue: AttrValue = {
        value: valueResult.value,
        span: valueResult.span,
        nameSpan: attrNameSpan,
      };
      if (Object.prototype.hasOwnProperty.call(attrs, attrName)) {
        pushDiag(
          error(
            "parser/duplicate-attribute",
            `duplicate attribute '${attrName}' on '<${name}>'`,
            attrNameSpan,
          ),
        );
        // last-wins: overwrite
      }
      attrs[attrName] = attrValue;
    }

    tokens.push({
      kind: "open",
      name,
      nameSpan,
      attrs,
      selfClosing,
      span: spanAt(start.line, start.column, pos - start.pos),
    });
  }

  function readText(): void {
    const start = snapshot();
    while (pos < len && peek() !== "<") advance();
    const value = source.slice(start.pos, pos);
    if (value.length === 0) return;
    tokens.push({
      kind: "text",
      value,
      span: spanAt(start.line, start.column, value.length),
    });
  }

  while (pos < len) {
    const c = peek();
    if (c === "<") {
      if (startsWith("<!--")) {
        readComment();
      } else if (peek(1) === "/") {
        readCloseTag();
      } else {
        readOpenTag();
      }
    } else {
      readText();
    }
  }

  return { tokens, diagnostics };
}
