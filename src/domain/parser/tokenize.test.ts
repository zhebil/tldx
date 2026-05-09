import { describe, expect, it } from "vitest";

import { tokenize } from "./tokenize.js";

const FILE = "test.tldsl";

describe("tokenize() - happy path", () => {
  it("returns no tokens and no diagnostics for an empty source", () => {
    const result = tokenize("", FILE);
    expect(result.tokens).toEqual([]);
    expect(result.diagnostics).toEqual([]);
  });

  it("emits an open + close pair for a paired empty tag", () => {
    const result = tokenize("<doc></doc>", FILE);
    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.map((t) => t.kind)).toEqual(["open", "close"]);
  });

  it("flags a tag as self-closing when it ends with '/>'", () => {
    const result = tokenize('<box id="a" />', FILE);
    expect(result.diagnostics).toEqual([]);
    const [tok] = result.tokens;
    if (tok?.kind !== "open") throw new Error("expected open");
    expect(tok.selfClosing).toBe(true);
  });

  it("preserves whitespace text between tags as a text token", () => {
    const result = tokenize("<doc>\n  <box />\n</doc>", FILE);
    const kinds = result.tokens.map((t) => t.kind);
    expect(kinds).toEqual(["open", "text", "open", "text", "close"]);
  });

  it("captures multiple attributes including mixed quote styles", () => {
    const result = tokenize(`<box id="a" label='Hello world' />`, FILE);
    expect(result.diagnostics).toEqual([]);
    const [tok] = result.tokens;
    if (tok?.kind !== "open") throw new Error("expected open");
    expect(Object.keys(tok.attrs)).toEqual(["id", "label"]);
    expect(tok.attrs.id?.value).toBe("a");
    expect(tok.attrs.label?.value).toBe("Hello world");
  });

  it("captures attribute values containing brackets and whitespace", () => {
    const result = tokenize(`<box label="a (b) c" />`, FILE);
    expect(result.diagnostics).toEqual([]);
    const [tok] = result.tokens;
    if (tok?.kind !== "open") throw new Error("expected open");
    expect(tok.attrs.label?.value).toBe("a (b) c");
  });
});

describe("tokenize() - position tracking", () => {
  it("uses 1-based line and column on the first line", () => {
    const result = tokenize("<box />", FILE);
    const [tok] = result.tokens;
    if (tok?.kind !== "open") throw new Error("expected open");
    expect(tok.span).toEqual({
      file: FILE,
      line: 1,
      column: 1,
      length: "<box />".length,
    });
  });

  it("increments line and resets column across '\\n'", () => {
    const result = tokenize("\n\n  <box />", FILE);
    const open = result.tokens.find((t) => t.kind === "open");
    if (open?.kind !== "open") throw new Error("expected open");
    expect(open.span.line).toBe(3);
    expect(open.span.column).toBe(3);
  });

  it("records the attribute value span without the surrounding quotes", () => {
    const result = tokenize('<box id="abc" />', FILE);
    const [tok] = result.tokens;
    if (tok?.kind !== "open") throw new Error("expected open");
    expect(tok.attrs.id?.span).toEqual({
      file: FILE,
      line: 1,
      column: 10,
      length: 3,
    });
  });

  it("records the name span of a close tag", () => {
    const result = tokenize("<doc></doc>", FILE);
    const close = result.tokens[1];
    if (close?.kind !== "close") throw new Error("expected close");
    expect(close.nameSpan).toEqual({
      file: FILE,
      line: 1,
      column: 8,
      length: 3,
    });
  });
});

describe("tokenize() - comments", () => {
  it("emits a comment token and no diagnostic for a well-formed comment", () => {
    const result = tokenize("<!-- hi -->", FILE);
    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.map((t) => t.kind)).toEqual(["comment"]);
  });

  it("handles multi-line comments", () => {
    const src = "<!-- line one\nline two\nline three -->";
    const result = tokenize(src, FILE);
    expect(result.diagnostics).toEqual([]);
    expect(result.tokens.map((t) => t.kind)).toEqual(["comment"]);
  });

  it("flags an unterminated comment with parser/unterminated-comment", () => {
    const result = tokenize("<!-- never closed", FILE);
    expect(result.diagnostics.map((d) => d.code)).toEqual([
      "parser/unterminated-comment",
    ]);
  });
});

describe("tokenize() - error recovery", () => {
  it("flags an unterminated attribute string", () => {
    const result = tokenize('<box id="a />', FILE);
    expect(result.diagnostics.map((d) => d.code)).toContain(
      "parser/unterminated-string",
    );
  });

  it("flags a missing '=' after an attribute name", () => {
    const result = tokenize("<box id />", FILE);
    expect(result.diagnostics.map((d) => d.code)).toContain(
      "parser/expected-char",
    );
  });

  it("flags a missing element name after '<'", () => {
    const result = tokenize("<>", FILE);
    expect(result.diagnostics.map((d) => d.code)).toContain(
      "parser/expected-element-name",
    );
  });

  it("recovers past a malformed tag and tokenizes the rest of the file", () => {
    const result = tokenize('<box id="a /><box id="b" />', FILE);
    // The first tag is malformed (unterminated string), the second should
    // still tokenize as a normal open tag.
    expect(result.diagnostics.map((d) => d.code)).toContain(
      "parser/unterminated-string",
    );
    const opens = result.tokens.filter((t) => t.kind === "open");
    expect(opens.length).toBeGreaterThanOrEqual(1);
  });
});
