import { describe, expect, it } from "vitest";

import { parse } from "../parser/index.js";

import type { IRDoc, IRElement } from "./ir.js";
import { lower } from "./lower.js";

function lowerSource(source: string): {
  ir: IRDoc | null;
  codes: string[];
} {
  const { ast, diagnostics: parseDiags } = parse(source, "test.tldsl");
  expect(parseDiags, "parser produced unexpected diagnostics").toEqual([]);
  const { ir, diagnostics } = lower(ast);
  return { ir, codes: diagnostics.map((d) => d.code) };
}

function ids(els: readonly IRElement[]): string[] {
  return els.map((e) => e.id);
}

describe("lower: happy path", () => {
  it("lowers an empty <doc>", () => {
    const { ir, codes } = lowerSource("<doc></doc>");
    expect(codes).toEqual([]);
    expect(ir?.kind).toBe("doc");
    expect(ir?.children).toEqual([]);
  });

  it("lowers a frame with two boxes and a connecting edge", () => {
    const src = `
      <doc>
        <frame id="f">
          <box id="a" label="A" />
          <box id="b" label="B" />
          <edge id="e1" from="a" to="b" />
        </frame>
      </doc>
    `;
    const { ir, codes } = lowerSource(src);
    expect(codes).toEqual([]);
    const frame = ir!.children[0]!;
    if (frame.kind !== "frame") throw new Error("expected frame");
    expect(ids(frame.children)).toEqual(["a", "b", "e1"]);
    const edge = frame.children[2]!;
    if (edge.kind !== "edge") throw new Error("expected edge");
    expect(edge.from).toBe("a");
    expect(edge.to).toBe("b");
  });

  it("parses x|y|w|h as numbers", () => {
    const src = `
      <doc>
        <box id="a" x="10" y="20" w="100" h="50" />
      </doc>
    `;
    const { ir, codes } = lowerSource(src);
    expect(codes).toEqual([]);
    const box = ir!.children[0]!;
    if (box.kind !== "box") throw new Error("expected box");
    expect(box.x).toBe(10);
    expect(box.y).toBe(20);
    expect(box.w).toBe(100);
    expect(box.h).toBe(50);
  });
});

describe("lower: diagnostics", () => {
  it("ir/root-not-doc when top element is not <doc>", () => {
    const { ir, codes } = lowerSource(`<frame id="f"></frame>`);
    expect(codes).toEqual(["ir/root-not-doc"]);
    expect(ir).toBeNull();
  });

  it("ir/missing-id on a <box> without id", () => {
    const { codes } = lowerSource(`<doc><box label="A" /></doc>`);
    expect(codes).toEqual(["ir/missing-id"]);
  });

  it("ir/missing-id on a <frame> without id", () => {
    const { codes } = lowerSource(`<doc><frame></frame></doc>`);
    expect(codes).toEqual(["ir/missing-id"]);
  });

  it("ir/missing-id when id is empty", () => {
    const { codes } = lowerSource(`<doc><box id="" label="A" /></doc>`);
    expect(codes).toEqual(["ir/missing-id"]);
  });

  it("ir/duplicate-id when two boxes share an id", () => {
    const src = `
      <doc>
        <box id="a" />
        <box id="a" />
      </doc>
    `;
    const { codes } = lowerSource(src);
    expect(codes).toEqual(["ir/duplicate-id"]);
  });

  it("ir/missing-edge-endpoint when from is missing", () => {
    const src = `<doc><box id="a" /><edge to="a" /></doc>`;
    const { codes } = lowerSource(src);
    expect(codes).toEqual(["ir/missing-edge-endpoint"]);
  });

  it("ir/missing-edge-endpoint when to is empty", () => {
    const src = `<doc><box id="a" /><edge from="a" to="" /></doc>`;
    const { codes } = lowerSource(src);
    expect(codes).toEqual(["ir/missing-edge-endpoint"]);
  });

  it("ir/unknown-reference for a from that points at no id", () => {
    const src = `<doc><box id="a" /><edge from="ghost" to="a" /></doc>`;
    const { ir, codes } = lowerSource(src);
    expect(codes).toEqual(["ir/unknown-reference"]);
    // edge dropped from IR
    expect(ir!.children.filter((c) => c.kind === "edge")).toEqual([]);
  });

  it("ir/unknown-reference for both endpoints emits twice", () => {
    const src = `<doc><edge from="g1" to="g2" /></doc>`;
    const { codes } = lowerSource(src);
    expect(codes).toEqual([
      "ir/unknown-reference",
      "ir/unknown-reference",
    ]);
  });

  it("ir/anchor-not-supported when endpoint uses dotted form", () => {
    const src = `<doc><box id="a" /><edge from="a.bottom" to="a" /></doc>`;
    const { codes } = lowerSource(src);
    expect(codes).toEqual(["ir/anchor-not-supported"]);
  });

  it("ir/free-endpoint-not-supported for x:N,y:N", () => {
    const src = `<doc><box id="a" /><edge from="x:10,y:20" to="a" /></doc>`;
    const { codes } = lowerSource(src);
    expect(codes).toEqual(["ir/free-endpoint-not-supported"]);
  });

  it("ir/invalid-numeric-attr on non-numeric x", () => {
    const src = `<doc><box id="a" x="left" /></doc>`;
    const { codes } = lowerSource(src);
    expect(codes).toEqual(["ir/invalid-numeric-attr"]);
  });

  it("ir/invalid-direction on an unknown direction value", () => {
    const src = `<doc direction="sideways"></doc>`;
    const { codes } = lowerSource(src);
    expect(codes).toEqual(["ir/invalid-direction"]);
  });
});

describe("lower: direction", () => {
  it("captures direction on <doc> when present", () => {
    const { ir, codes } = lowerSource(`<doc direction="DOWN"></doc>`);
    expect(codes).toEqual([]);
    expect(ir?.direction).toBe("DOWN");
  });

  it("omits direction when not authored (port defaults)", () => {
    const { ir, codes } = lowerSource(`<doc></doc>`);
    expect(codes).toEqual([]);
    expect(ir?.direction).toBeUndefined();
  });

  it("captures direction on <frame>", () => {
    const { ir, codes } = lowerSource(
      `<doc><frame id="f" direction="DOWN"></frame></doc>`,
    );
    expect(codes).toEqual([]);
    const frame = ir!.children[0]!;
    if (frame.kind !== "frame") throw new Error("expected frame");
    expect(frame.direction).toBe("DOWN");
  });
});

describe("lower: synthetic ids per ADR-12", () => {
  it("assigns deterministic ids: same source → same ids", () => {
    const src = `
      <doc>
        <note>hello</note>
        <note>world</note>
      </doc>
    `;
    const a = lowerSource(src).ir!;
    const b = lowerSource(src).ir!;
    expect(ids(a.children)).toEqual(ids(b.children));
    // synthetic ids look like <hash>-<n>
    for (const n of a.children) {
      expect(n.id).toMatch(/^[0-9a-f]{8}-\d+$/);
      expect(n.idExplicit).toBe(false);
    }
  });

  it("assigns different ids to notes with different content", () => {
    const src = `
      <doc>
        <note>a</note>
        <note>b</note>
      </doc>
    `;
    const ir = lowerSource(src).ir!;
    expect(ir.children[0]!.id).not.toBe(ir.children[1]!.id);
  });

  it("disambiguates two identical anonymous notes with -0 / -1", () => {
    const src = `
      <doc>
        <note>same</note>
        <note>same</note>
      </doc>
    `;
    const ir = lowerSource(src).ir!;
    const [n0, n1] = ir.children;
    expect(n0!.id.endsWith("-0")).toBe(true);
    expect(n1!.id.endsWith("-1")).toBe(true);
    expect(n0!.id.slice(0, -2)).toBe(n1!.id.slice(0, -2));
  });

  it("reordering siblings of differing content does not change ids", () => {
    const orig = `
      <doc>
        <note>alpha</note>
        <note>beta</note>
        <note>gamma</note>
      </doc>
    `;
    const reordered = `
      <doc>
        <note>gamma</note>
        <note>alpha</note>
        <note>beta</note>
      </doc>
    `;
    const a = lowerSource(orig).ir!;
    const b = lowerSource(reordered).ir!;
    const idOf = (text: string, doc: IRDoc) => {
      const n = doc.children.find(
        (c) => c.kind === "note" && c.text === text,
      );
      if (!n) throw new Error(`no note with text ${text}`);
      return n.id;
    };
    expect(idOf("alpha", a)).toBe(idOf("alpha", b));
    expect(idOf("beta", a)).toBe(idOf("beta", b));
    expect(idOf("gamma", a)).toBe(idOf("gamma", b));
  });

  it("synthetic edge id is stable across non-edge sibling reorder", () => {
    const orig = `
      <doc>
        <box id="a" />
        <box id="b" />
        <edge from="a" to="b" />
      </doc>
    `;
    const reordered = `
      <doc>
        <box id="b" />
        <box id="a" />
        <edge from="a" to="b" />
      </doc>
    `;
    const a = lowerSource(orig).ir!;
    const b = lowerSource(reordered).ir!;
    const edgeOf = (doc: IRDoc) =>
      doc.children.find((c) => c.kind === "edge")!;
    expect(edgeOf(a).id).toBe(edgeOf(b).id);
  });
});

describe("lower: end-to-end on the auth fixture grammar", () => {
  it("produces a clean IR with explicit ids preserved", () => {
    const src = `
      <doc>
        <frame id="auth-flow" name="Auth flow">
          <box id="user"   label="User" />
          <box id="login"  label="Login form" />
          <edge id="e1" from="user"  to="login" />
          <note id="n">design note</note>
        </frame>
      </doc>
    `;
    const { ir, codes } = lowerSource(src);
    expect(codes).toEqual([]);
    const frame = ir!.children[0]!;
    if (frame.kind !== "frame") throw new Error("expected frame");
    expect(frame.id).toBe("auth-flow");
    expect(frame.idExplicit).toBe(true);
    expect(ids(frame.children)).toEqual(["user", "login", "e1", "n"]);
    for (const c of frame.children) expect(c.idExplicit).toBe(true);
  });
});
