import { describe, expect, it } from "vitest";

import type { Diagnostic } from "../diagnostics/index.js";
import type { AstNode } from "../parser/ast.js";
import { astBuilders } from "../parser/ast.fixture.js";

import type { IRDoc, IRElement } from "./ir.js";
import { lower } from "./lower.js";

const { box, doc, edge, frame, note } = astBuilders();

function lowerAst(ast: AstNode): { ir: IRDoc | null; codes: string[] } {
  const { ir, diagnostics } = lower(ast);
  return { ir, codes: diagnostics.map((d) => d.code) };
}

function lowerDiagnostics(ast: AstNode): Diagnostic[] {
  return lower(ast).diagnostics;
}

function ids(els: readonly IRElement[]): string[] {
  return els.map((e) => e.id);
}

describe("lower: happy path", () => {
  it("lowers an empty <doc>", () => {
    const { ir, codes } = lowerAst(doc({}));
    expect(codes).toEqual([]);
    expect(ir?.kind).toBe("doc");
    expect(ir?.children).toEqual([]);
  });

  it("lowers a frame with two boxes and a connecting edge", () => {
    const ast = doc({}, [
      frame({ id: "f" }, [
        box({ id: "a", label: "A" }),
        box({ id: "b", label: "B" }),
        edge({ id: "e1", from: "a", to: "b" }),
      ]),
    ]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const frameIr = ir!.children[0]!;
    if (frameIr.kind !== "frame") throw new Error("expected frame");
    expect(ids(frameIr.children)).toEqual(["a", "b", "e1"]);
    const edgeIr = frameIr.children[2]!;
    if (edgeIr.kind !== "edge") throw new Error("expected edge");
    expect(edgeIr.from).toBe("a");
    expect(edgeIr.to).toBe("b");
  });

  it("parses x|y|w|h as numbers", () => {
    const ast = doc({}, [box({ id: "a", x: 10, y: 20, w: 100, h: 50 })]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const boxIr = ir!.children[0]!;
    if (boxIr.kind !== "box") throw new Error("expected box");
    expect(boxIr.x).toBe(10);
    expect(boxIr.y).toBe(20);
    expect(boxIr.w).toBe(100);
    expect(boxIr.h).toBe(50);
  });
});

describe("lower: diagnostics", () => {
  it("ir/root-not-doc when top element is not <doc>", () => {
    const { ir, codes } = lowerAst(frame({ id: "f" }));
    expect(codes).toEqual(["ir/root-not-doc"]);
    expect(ir).toBeNull();
  });

  it("ir/missing-id on a <box> without id", () => {
    const { codes } = lowerAst(doc({}, [box({ label: "A" })]));
    expect(codes).toEqual(["ir/missing-id"]);
  });

  it("ir/missing-id on a <frame> without id", () => {
    const { codes } = lowerAst(doc({}, [frame({})]));
    expect(codes).toEqual(["ir/missing-id"]);
  });

  it("ir/missing-id when id is empty", () => {
    const { codes } = lowerAst(doc({}, [box({ id: "", label: "A" })]));
    expect(codes).toEqual(["ir/missing-id"]);
  });

  it("ir/duplicate-id when two boxes share an id", () => {
    const ast = doc({}, [box({ id: "a" }), box({ id: "a" })]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/duplicate-id"]);
  });

  it("ir/missing-edge-endpoint when from is missing", () => {
    const ast = doc({}, [box({ id: "a" }), edge({ to: "a" })]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/missing-edge-endpoint"]);
  });

  it("ir/missing-edge-endpoint when to is empty", () => {
    const ast = doc({}, [box({ id: "a" }), edge({ from: "a", to: "" })]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/missing-edge-endpoint"]);
  });

  it("ir/unknown-reference for a from that points at no id", () => {
    const ast = doc({}, [box({ id: "a" }), edge({ from: "ghost", to: "a" })]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/unknown-reference"]);
    // edge dropped from IR
    expect(ir!.children.filter((c) => c.kind === "edge")).toEqual([]);
  });

  it("ir/unknown-reference for both endpoints emits twice", () => {
    const ast = doc({}, [edge({ from: "g1", to: "g2" })]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual([
      "ir/unknown-reference",
      "ir/unknown-reference",
    ]);
  });

  it("ir/anchor-not-supported when endpoint uses dotted form", () => {
    const ast = doc({}, [box({ id: "a" }), edge({ from: "a.bottom", to: "a" })]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/anchor-not-supported"]);
  });

  it("ir/free-endpoint-not-supported for x:N,y:N", () => {
    const ast = doc({}, [box({ id: "a" }), edge({ from: "x:10,y:20", to: "a" })]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/free-endpoint-not-supported"]);
  });

  it("ir/invalid-numeric-attr on non-numeric x", () => {
    const ast = doc({}, [box({ id: "a", x: "left" })]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/invalid-numeric-attr"]);
  });

  it("ir/invalid-direction on an unknown direction value", () => {
    const { codes } = lowerAst(doc({ direction: "sideways" }));
    expect(codes).toEqual(["ir/invalid-direction"]);
  });

  it("ir/bad-align on an unknown align value", () => {
    const { codes } = lowerAst(doc({ align: "middle" }));
    expect(codes).toEqual(["ir/bad-align"]);
  });
});

describe("lower: direction", () => {
  it("captures direction on <doc> when present", () => {
    const { ir, codes } = lowerAst(doc({ direction: "DOWN" }));
    expect(codes).toEqual([]);
    expect(ir?.direction).toBe("DOWN");
  });

  it("omits direction when not authored (port defaults)", () => {
    const { ir, codes } = lowerAst(doc({}));
    expect(codes).toEqual([]);
    expect(ir?.direction).toBeUndefined();
  });

  it("captures direction on <frame>", () => {
    const ast = doc({}, [frame({ id: "f", direction: "DOWN" })]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const frameIr = ir!.children[0]!;
    if (frameIr.kind !== "frame") throw new Error("expected frame");
    expect(frameIr.direction).toBe("DOWN");
  });
});

describe("lower: synthetic ids per ADR-12", () => {
  it("assigns deterministic ids: same source → same ids", () => {
    const ast = () => doc({}, [note({}, "hello"), note({}, "world")]);
    const a = lowerAst(ast()).ir!;
    const b = lowerAst(ast()).ir!;
    expect(ids(a.children)).toEqual(ids(b.children));
    // synthetic ids look like <hash>-<n>
    for (const n of a.children) {
      expect(n.id).toMatch(/^[0-9a-f]{8}-\d+$/);
      expect(n.idExplicit).toBe(false);
    }
  });

  it("assigns different ids to notes with different content", () => {
    const ast = doc({}, [note({}, "a"), note({}, "b")]);
    const ir = lowerAst(ast).ir!;
    expect(ir.children[0]!.id).not.toBe(ir.children[1]!.id);
  });

  it("disambiguates two identical anonymous notes with -0 / -1", () => {
    const ast = doc({}, [note({}, "same"), note({}, "same")]);
    const ir = lowerAst(ast).ir!;
    const [n0, n1] = ir.children;
    expect(n0!.id.endsWith("-0")).toBe(true);
    expect(n1!.id.endsWith("-1")).toBe(true);
    expect(n0!.id.slice(0, -2)).toBe(n1!.id.slice(0, -2));
  });

  it("reordering siblings of differing content does not change ids", () => {
    const orig = doc({}, [note({}, "alpha"), note({}, "beta"), note({}, "gamma")]);
    const reordered = doc({}, [note({}, "gamma"), note({}, "alpha"), note({}, "beta")]);
    const a = lowerAst(orig).ir!;
    const b = lowerAst(reordered).ir!;
    const idOf = (text: string, docIr: IRDoc) => {
      const n = docIr.children.find(
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
    const orig = doc({}, [
      box({ id: "a" }),
      box({ id: "b" }),
      edge({ from: "a", to: "b" }),
    ]);
    const reordered = doc({}, [
      box({ id: "b" }),
      box({ id: "a" }),
      edge({ from: "a", to: "b" }),
    ]);
    const a = lowerAst(orig).ir!;
    const b = lowerAst(reordered).ir!;
    const edgeOf = (docIr: IRDoc) =>
      docIr.children.find((c) => c.kind === "edge")!;
    expect(edgeOf(a).id).toBe(edgeOf(b).id);
  });
});

describe("lower: end-to-end on the auth fixture grammar", () => {
  it("produces a clean IR with explicit ids preserved", () => {
    const ast = doc({}, [
      frame({ id: "auth-flow", name: "Auth flow" }, [
        box({ id: "user", label: "User" }),
        box({ id: "login", label: "Login form" }),
        edge({ id: "e1", from: "user", to: "login" }),
        note({ id: "n" }, "design note"),
      ]),
    ]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const frameIr = ir!.children[0]!;
    if (frameIr.kind !== "frame") throw new Error("expected frame");
    expect(frameIr.id).toBe("auth-flow");
    expect(frameIr.idExplicit).toBe(true);
    expect(ids(frameIr.children)).toEqual(["user", "login", "e1", "n"]);
    for (const c of frameIr.children) expect(c.idExplicit).toBe(true);
  });
});

describe("lower: ir/unknown-prop", () => {
  it("rejects a misspelled attribute on <box> with the attribute's span", () => {
    const diagnostics = lowerDiagnostics(doc({}, [box({ id: "a", lable: "x" })]));
    expect(diagnostics).toHaveLength(1);
    const [d] = diagnostics;
    expect(d!.code).toBe("ir/unknown-prop");
    expect(d!.message).toBe(
      "'lable' is not supported on '<box>' (allowed: id, label, x, y, w, h, maxW)",
    );
    // column 3: fixture's synthetic per-attribute column for `lable`, the
    // second attribute after `id`.
    expect(d!.span).toEqual({
      file: "test.tldsl",
      line: 1,
      column: 3,
    });
  });

  it("rejects a plausible-but-unsupported attribute on <box>", () => {
    const ast = doc({}, [box({ id: "a", className: "card" })]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/unknown-prop"]);
  });

  it("emits nothing for a fully valid document", () => {
    const ast = doc({ direction: "DOWN", layout: "grid", gap: 4, pad: 8, cols: 2 }, [
      frame(
        {
          id: "f",
          name: "F",
          direction: "DOWN",
          layout: "row",
          gap: 4,
          pad: 8,
          cols: 2,
          x: 0,
          y: 0,
          w: 10,
          h: 10,
        },
        [
          box({ id: "a", label: "A", x: 0, y: 0, w: 1, h: 1 }),
          note({ id: "n", x: 0, y: 0, w: 1, h: 1 }, "hi"),
          edge({ id: "e", from: "a", to: "a" }),
        ],
      ),
    ]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual([]);
  });

  it("rejects an unknown attribute on <edge>", () => {
    const ast = doc({}, [box({ id: "a" }), edge({ from: "a", to: "a", route: "curved" })]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/unknown-prop"]);
  });
});
