import { describe, expect, it } from "vitest";

import { hasErrors } from "../diagnostics/index.js";

import { parse } from "./parse.js";

const FILE = "test.tldsl";

function codes(src: string): string[] {
  return parse(src, FILE).diagnostics.map((d) => d.code);
}

describe("parse() - happy path", () => {
  it("parses an empty source as ast=null with no diagnostics", () => {
    const result = parse("", FILE);
    expect(result.ast).toBeNull();
    expect(result.diagnostics).toEqual([]);
  });

  it("parses a self-closing leaf element", () => {
    const result = parse('<box id="a" label="A" />', FILE);
    expect(result.diagnostics).toEqual([]);
    expect(result.ast).toMatchObject({
      kind: "box",
      attrs: {
        id: { value: "a" },
        label: { value: "A" },
      },
    });
  });

  it("parses a paired-empty leaf element", () => {
    const result = parse('<box id="a"></box>', FILE);
    expect(result.diagnostics).toEqual([]);
    expect(result.ast).toMatchObject({
      kind: "box",
      attrs: { id: { value: "a" } },
    });
  });

  it("parses a note with body text and trims whitespace at the edges", () => {
    const result = parse("<note>  hello world  </note>", FILE);
    expect(result.diagnostics).toEqual([]);
    expect(result.ast).toMatchObject({
      kind: "note",
      text: "hello world",
    });
  });

  it("parses a frame with element children", () => {
    const result = parse(
      `<frame name="Auth">
         <box id="login" />
         <box id="verify" />
         <edge from="login" to="verify" />
       </frame>`,
      FILE,
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.ast).toMatchObject({
      kind: "frame",
      attrs: { name: { value: "Auth" } },
      children: [
        { kind: "box", attrs: { id: { value: "login" } } },
        { kind: "box", attrs: { id: { value: "verify" } } },
        {
          kind: "edge",
          attrs: { from: { value: "login" }, to: { value: "verify" } },
        },
      ],
    });
  });

  it("parses the canonical 5-node auth flow under <doc>", () => {
    const result = parse(
      `<doc>
         <frame name="Auth">
           <box id="login"   label="Login form" />
           <box id="verify"  label="Verify creds" />
           <box id="session" label="Issue session" />
           <edge from="login"  to="verify" />
           <edge from="verify" to="session" />
         </frame>
       </doc>`,
      FILE,
    );
    expect(result.diagnostics).toEqual([]);
    expect(result.ast?.kind).toBe("doc");
    if (result.ast?.kind !== "doc") throw new Error("expected doc");
    expect(result.ast.children).toHaveLength(1);
    const frame = result.ast.children[0];
    if (frame?.kind !== "frame") throw new Error("expected frame");
    expect(frame.children).toHaveLength(5);
  });

  it("drops comments", () => {
    const result = parse(
      `<doc>
         <!-- header note -->
         <box id="a" />
         <!-- trailing note -->
       </doc>`,
      FILE,
    );
    expect(result.diagnostics).toEqual([]);
    if (result.ast?.kind !== "doc") throw new Error("expected doc");
    expect(result.ast.children).toHaveLength(1);
  });

  it("supports single-quoted attribute values", () => {
    const result = parse("<box id='a' label='A' />", FILE);
    expect(result.diagnostics).toEqual([]);
    expect(result.ast).toMatchObject({
      kind: "box",
      attrs: { id: { value: "a" }, label: { value: "A" } },
    });
  });
});

describe("parse() - source spans", () => {
  it("records 1-based line and column for an open tag", () => {
    const result = parse("\n  <box id=\"a\" />", FILE);
    expect(result.ast?.span).toEqual({
      file: FILE,
      line: 2,
      column: 3,
      length: "<box id=\"a\" />".length,
    });
  });

  it("records the attribute value span (excluding quotes)", () => {
    const result = parse('<box id="a" />', FILE);
    if (result.ast?.kind !== "box") throw new Error("expected box");
    expect(result.ast.attrs.id?.span).toEqual({
      file: FILE,
      line: 1,
      column: 10,
      length: 1,
    });
  });
});

describe("parse() - diagnostics", () => {
  it("flags unknown elements and skips their subtree", () => {
    const result = parse(
      `<doc>
         <gizmo>
           <wat />
         </gizmo>
         <box id="a" />
       </doc>`,
      FILE,
    );
    expect(result.diagnostics.map((d) => d.code)).toContain(
      "parser/unknown-element",
    );
    // The valid <box> after the unknown subtree still parses.
    if (result.ast?.kind !== "doc") throw new Error("expected doc");
    expect(result.ast.children).toEqual([
      expect.objectContaining({ kind: "box" }),
    ]);
  });

  it("flags mismatched close tags", () => {
    expect(codes("<frame></doc>")).toContain("parser/mismatched-close");
  });

  it("flags unclosed tags at end of file", () => {
    expect(codes("<doc><box id=\"a\" />")).toContain("parser/unclosed-tag");
  });

  it("flags an unexpected close tag at the top level", () => {
    expect(codes("</box>")).toContain("parser/unexpected-close");
  });

  it("flags non-whitespace text inside containers", () => {
    expect(codes("<doc>raw text</doc>")).toContain("parser/text-not-allowed");
  });

  it("does not flag whitespace-only text inside containers", () => {
    const result = parse("<doc>   \n   </doc>", FILE);
    expect(result.diagnostics).toEqual([]);
  });

  it("flags nested elements inside a note", () => {
    expect(codes("<note><box id=\"a\" /></note>")).toContain(
      "parser/element-not-allowed",
    );
  });

  it("flags element children inside a leaf (<box>)", () => {
    expect(codes("<box id=\"a\"><edge from=\"a\" to=\"a\" /></box>")).toContain(
      "parser/element-not-allowed",
    );
  });

  it("flags duplicate attributes (last value wins)", () => {
    const result = parse('<box id="a" id="b" />', FILE);
    expect(result.diagnostics.map((d) => d.code)).toContain(
      "parser/duplicate-attribute",
    );
    if (result.ast?.kind !== "box") throw new Error("expected box");
    expect(result.ast.attrs.id?.value).toBe("b");
  });

  it("flags unterminated attribute strings", () => {
    expect(codes('<box id="a />')).toContain("parser/unterminated-string");
  });

  it("flags unterminated comments", () => {
    expect(codes("<!-- never closed")).toContain(
      "parser/unterminated-comment",
    );
  });

  it("flags missing element name after '<'", () => {
    expect(codes("<>")).toContain("parser/expected-element-name");
  });

  it("flags multiple top-level roots", () => {
    expect(codes("<box id=\"a\" /><box id=\"b\" />")).toContain(
      "parser/multiple-roots",
    );
  });

  it("hasErrors() over the diagnostics returns true when something failed", () => {
    const result = parse("<box></doc>", FILE);
    expect(hasErrors(result.diagnostics)).toBe(true);
  });
});
