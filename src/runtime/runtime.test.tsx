/** @jsxImportSource ../runtime */
import { describe, expect, it } from "vitest";

import type { AstDoc, AstFrame, AstNode } from "../domain/parser/ast.js";

import {
  Box,
  Col,
  Doc,
  Edge,
  Frame,
  Graph,
  Grid,
  Group,
  Layers,
  Note,
  Pipeline,
  Row,
  Swimlanes,
  Text,
  flow,
} from "./index.js";
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
    // lines 62-69 in buildTree() above.
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toBeGreaterThanOrEqual(62);
      expect(line).toBeLessThanOrEqual(69);
    }

    expect((jsxAst as { span: { line: number } }).span.line).toBe(62);
  });
});

describe("<Text> (C1, tldsl-b8v)", () => {
  it("builds a box AST node with text: true and its children joined as the label field", () => {
    const node = (<Text id="heading">Phase 1 (non collaborative)</Text>) as AstNode;
    expect(stripSpans(node)).toEqual({
      kind: "box",
      attrs: { id: { value: "heading" } },
      text: true,
      body: "Phase 1 (non collaborative)",
      tag: "Text",
    });
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

describe("Pipeline", () => {
  it("connects three ids in sequence and defaults to layout=row", () => {
    const result = (
      <Pipeline id="p">
        <Box id="a" label="A" />
        <Box id="b" label="B" />
        <Box id="c" label="C" />
      </Pipeline>
    ) as AstNode[];
    const [frame, ...edges] = result;

    expect((frame as AstFrame).attrs.layout?.value).toBe("row");
    expect(stripSpans(edges)).toEqual([
      { kind: "edge", attrs: { from: { value: "a" }, to: { value: "b" } } },
      { kind: "edge", attrs: { from: { value: "b" }, to: { value: "c" } } },
    ]);
  });

  it("layout=col overrides the row default", () => {
    const result = (
      <Pipeline id="p" layout="col">
        <Box id="a" label="A" />
        <Box id="b" label="B" />
      </Pipeline>
    ) as AstNode[];
    const [frame] = result;

    expect((frame as AstFrame).attrs.layout?.value).toBe("col");
  });

  it("throws when a non-edge child has no id", () => {
    expect(() =>
      (
        <Pipeline id="p">
          <Box label="A" />
        </Pipeline>
      )
    ).toThrow(/every child to have an id/);
  });
});

describe("Layers", () => {
  it("is a col frame; unnamed frame tiers become row+group, named tiers stay row-only, boxes pass through", () => {
    const layers = (
      <Layers id="l">
        <Frame id="tier1">
          <Box id="a" label="A" />
        </Frame>
        <Frame id="tier2" name="Tier Two">
          <Box id="b" label="B" />
        </Frame>
        <Box id="c" label="C" />
      </Layers>
    ) as AstFrame;

    expect(layers.attrs.layout?.value).toBe("col");

    const [tier1, tier2, boxC] = layers.children as AstFrame[];
    expect(tier1!.attrs.layout?.value).toBe("row");
    expect(tier1!.group).toBe(true);
    expect(tier2!.attrs.layout?.value).toBe("row");
    expect(tier2!.group).toBeUndefined();
    expect(boxC!.kind).toBe("box");
  });
});

describe("Swimlanes", () => {
  it("is a col frame whose named frame lanes become row and keep their chrome (not grouped)", () => {
    const lanes = (
      <Swimlanes id="s">
        <Frame id="lane1" name="Lane One">
          <Box id="a" label="A" />
        </Frame>
      </Swimlanes>
    ) as AstFrame;

    expect(lanes.attrs.layout?.value).toBe("col");

    const [lane1] = lanes.children as AstFrame[];
    expect(lane1!.attrs.layout?.value).toBe("row");
    expect(lane1!.group).toBeUndefined();
  });
});

describe("Graph", () => {
  it("builds a frame with layout=auto", () => {
    const g = (
      <Graph id="g">
        <Box id="a" label="A" />
      </Graph>
    ) as AstFrame;

    expect(g.attrs.layout?.value).toBe("auto");
  });
});

describe("unknown element", () => {
  it("throws when the JSX type is not a component function", () => {
    expect(() => jsx("div", {})).toThrow(/unknown element/);
  });
});
