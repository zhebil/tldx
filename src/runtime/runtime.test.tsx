/** @jsxImportSource ../runtime */
import { describe, expect, it } from "vitest";

import type { AstDoc, AstFrame } from "../domain/parser/ast.js";

import { Box, Col, Doc, Edge, Frame, Grid, Group, Note, Row, flow } from "./index.js";
import { jsx } from "./jsx-runtime.js";

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

describe("JSX runtime - AST shape", () => {
  it("builds the expected AST for a small diagram", () => {
    const jsxAst = buildTree();

    expect(stripSpans(jsxAst)).toEqual({
      kind: "doc",
      attrs: {},
      children: [
        {
          kind: "frame",
          attrs: { name: { value: "Auth" }, w: { value: "320" } },
          children: [
            { kind: "box", attrs: { id: { value: "login" }, label: { value: "Login form" } } },
            { kind: "box", attrs: { id: { value: "verify" }, label: { value: "Verify creds" } } },
            {
              kind: "note",
              attrs: { id: { value: "note1" } },
              text: "Ask about session length",
            },
            { kind: "edge", attrs: { from: { value: "login" }, to: { value: "verify" } } },
            { kind: "box", attrs: { id: { value: "extra1" }, label: { value: "extra1" } } },
            { kind: "box", attrs: { id: { value: "extra2" }, label: { value: "extra2" } } },
            { kind: "box", attrs: { id: { value: "extra3" }, label: { value: "extra3" } } },
          ],
        },
      ],
    });
  });

  it("stashes jsxDEV's source as the node span, with 1-based lines matching this file", () => {
    const jsxAst = buildTree();
    const lines = spanLines(jsxAst);

    // Doc, Frame, 2 named boxes, Note, Edge, and the mapped box all sit on
    // lines 46-53 in buildTree() above.
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toBeGreaterThanOrEqual(46);
      expect(line).toBeLessThanOrEqual(53);
    }

    expect((jsxAst as { span: { line: number } }).span.line).toBe(46);
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

describe("Row / Col / Grid shorthands", () => {
  it("set layout to row/col/grid respectively, overriding any layout prop passed in", () => {
    const row = (<Row id="r" layout="grid">{[]}</Row>) as AstFrame;
    const col = (<Col id="c" layout="grid">{[]}</Col>) as AstFrame;
    const grid = (<Grid id="g" layout="row">{[]}</Grid>) as AstFrame;
    expect(row.attrs.layout?.value).toBe("row");
    expect(col.attrs.layout?.value).toBe("col");
    expect(grid.attrs.layout?.value).toBe("grid");
  });
});

describe("Group", () => {
  it("builds a frame node marked group: true, with no layout forced", () => {
    const g = Group({ id: "g", children: [] });
    expect(g.kind).toBe("frame");
    expect(g.group).toBe(true);
    expect(g.attrs.layout).toBeUndefined();
  });
});

describe("unknown element", () => {
  it("throws when the JSX type is not a component function", () => {
    expect(() => jsx("div", {})).toThrow(/unknown element/);
  });
});
