/** @jsxImportSource ../runtime */
import { describe, expect, it } from "vitest";

import type { AstDoc } from "../domain/parser/ast.js";
import { parse } from "../domain/parser/parse.js";

import { Box, Doc, Edge, Frame, Note, flow } from "./index.js";
import { jsx } from "./jsx-runtime.js";

const FILE = "test.tldsl";

function stripSpans(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(stripSpans);
  if (node !== null && typeof node === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "span" || key === "nameSpan") continue;
      out[key] = stripSpans(value);
    }
    return out;
  }
  return node;
}

function spanLines(node: unknown, lines: number[] = []): number[] {
  if (Array.isArray(node)) {
    node.forEach((child) => spanLines(child, lines));
    return lines;
  }
  if (node !== null && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (
      "span" in obj &&
      typeof obj.span === "object" &&
      obj.span !== null &&
      "line" in (obj.span as Record<string, unknown>)
    ) {
      lines.push((obj.span as { line: number }).line);
    }
    for (const value of Object.values(obj)) spanLines(value, lines);
  }
  return lines;
}

const EXTRA_IDS = ["extra1", "extra2", "extra3"];

function buildTree(): AstDoc {
  return (
    <Doc>
      <Frame name="Auth" w={320}>
        <Box id="login" label="Login form" />
        <Box id="verify" label="Verify creds" />
        <Note id="note1">Ask about session length</Note>
        <Edge from="login" to="verify" />
        {EXTRA_IDS.map((id) => (
          <Box id={id} label={id} />
        ))}
      </Frame>
    </Doc>
  ) as AstDoc;
}

const EQUIVALENT_TLDSL = `<doc>
  <frame name="Auth" w="320">
    <box id="login" label="Login form" />
    <box id="verify" label="Verify creds" />
    <note id="note1">Ask about session length</note>
    <edge from="login" to="verify" />
    <box id="extra1" label="extra1" />
    <box id="extra2" label="extra2" />
    <box id="extra3" label="extra3" />
  </frame>
</doc>`;

describe("JSX runtime - AST parity with the text parser", () => {
  it("produces the same AST (modulo spans) as parse() on the equivalent .tldsl text", () => {
    const jsxAst = buildTree();
    const { ast: textAst, diagnostics } = parse(EQUIVALENT_TLDSL, FILE);

    expect(diagnostics).toEqual([]);
    expect(stripSpans(jsxAst)).toEqual(stripSpans(textAst));
  });

  it("stashes jsxDEV's source as the node span, with 1-based lines matching this file", () => {
    const jsxAst = buildTree();
    const lines = spanLines(jsxAst);

    // Doc, Frame, 2 named boxes, Note, Edge, and the mapped box all sit on
    // lines 49-56 in buildTree() above.
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toBeGreaterThanOrEqual(49);
      expect(line).toBeLessThanOrEqual(56);
    }

    expect((jsxAst as { span: { line: number } }).span.line).toBe(49);
  });
});

describe("flow()", () => {
  it("builds consecutive edges from ids", () => {
    const edges = flow("a", "b", "c");
    expect(stripSpans(edges)).toEqual([
      { kind: "edge", attrs: { from: { value: "a" }, to: { value: "b" } } },
      { kind: "edge", attrs: { from: { value: "b" }, to: { value: "c" } } },
    ]);
  });

  it("returns an empty array for fewer than two ids", () => {
    expect(flow()).toEqual([]);
    expect(flow("only-one")).toEqual([]);
  });
});

describe("unknown element", () => {
  it("throws when the JSX type is not a component function", () => {
    expect(() => jsx("div", {})).toThrow(/unknown element/);
  });
});
