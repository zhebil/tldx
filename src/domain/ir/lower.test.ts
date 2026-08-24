import { describe, expect, it } from "vitest";

import type { Diagnostic } from "../diagnostics/index.js";
import type { AstEdge, AstNode } from "../parser/ast.js";
import { astBuilders } from "../parser/ast.fixture.js";

import type { IRDoc, IRElement } from "./ir.js";
import { lower } from "./lower.js";

const { box, doc, edge, frame, note, text } = astBuilders();

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

  it("fromSide/toSide (B9) parse a named compass point into a normalizedAnchor fraction", () => {
    const ast = doc({}, [
      box({ id: "a" }),
      box({ id: "b" }),
      edge({ from: "a", to: "b", fromSide: "right", toSide: "top-left" }),
    ]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const edgeIr = ir!.children[2]!;
    if (edgeIr.kind !== "edge") throw new Error("expected edge");
    expect(edgeIr.fromAnchor).toEqual({ x: 1, y: 0.5 });
    expect(edgeIr.toAnchor).toEqual({ x: 0, y: 0 });
  });

  it("fromSide/toSide (B9) parse an 'x,y' fraction directly", () => {
    const ast = doc({}, [
      box({ id: "a" }),
      box({ id: "b" }),
      edge({ from: "a", to: "b", fromSide: "0.25,1" }),
    ]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const edgeIr = ir!.children[2]!;
    if (edgeIr.kind !== "edge") throw new Error("expected edge");
    expect(edgeIr.fromAnchor).toEqual({ x: 0.25, y: 1 });
    expect(edgeIr.toAnchor).toBeUndefined();
  });

  it("fromSide/toSide (B9) does not collide with a dotted id (tldx-4s1)", () => {
    // The whole point of the separate-props design: `from`/`to` stay plain
    // id strings, so an id with a literal '.' (still discouraged, see the
    // dotted-anchor rejection above) is only a `from`/`to` concern, never an
    // anchor-syntax one - fromSide/toSide never look inside the endpoint string.
    const ast = doc({}, [
      box({ id: "use1.api" }),
      box({ id: "b" }),
      edge({ from: "use1.api", to: "b" }),
    ]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/anchor-not-supported"]);
  });

  it("ir/invalid-anchor-side for an unrecognized fromSide value", () => {
    const ast = doc({}, [
      box({ id: "a" }),
      box({ id: "b" }),
      edge({ from: "a", to: "b", fromSide: "northeast" }),
    ]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/invalid-anchor-side"]);
  });

  it("ir/invalid-anchor-side for a fraction outside 0..1", () => {
    const ast = doc({}, [
      box({ id: "a" }),
      box({ id: "b" }),
      edge({ from: "a", to: "b", toSide: "1.5,0" }),
    ]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/invalid-anchor-side"]);
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

  it("ir/invalid-boolean-attr on an unknown equalize value", () => {
    const { codes } = lowerAst(doc({ equalize: "nope" }));
    expect(codes).toEqual(["ir/invalid-boolean-attr"]);
  });

  it("accepts equalize='false' on <doc> and <frame> (C5)", () => {
    const ast = doc({ equalize: "false" }, [frame({ id: "f", equalize: "false" })]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    expect(ir?.equalize).toBe(false);
    const f = ir!.children[0]!;
    if (f.kind !== "frame") throw new Error("expected frame");
    expect(f.equalize).toBe(false);
  });

  it("leaves equalize unset when absent (default stays true downstream)", () => {
    const { ir, codes } = lowerAst(doc({}));
    expect(codes).toEqual([]);
    expect(ir?.equalize).toBeUndefined();
  });

  it("accepts align='stretch' on <doc> and <frame> (D10)", () => {
    const ast = doc({ align: "stretch" }, [frame({ id: "f", align: "stretch" })]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    expect(ir?.align).toBe("stretch");
    const f = ir!.children[0]!;
    if (f.kind !== "frame") throw new Error("expected frame");
    expect(f.align).toBe("stretch");
  });

  it("accepts rowGap and colGap on <doc> and <frame>, independent of gap (D4)", () => {
    const ast = doc({ layout: "grid", cols: 2, gap: 200, rowGap: 16 }, [
      frame({ id: "f", layout: "grid", cols: 2, colGap: 300, rowGap: 8 }),
    ]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    expect(ir?.gap).toBe(200);
    expect(ir?.rowGap).toBe(16);
    expect(ir?.colGap).toBeUndefined();
    const f = ir!.children[0]!;
    if (f.kind !== "frame") throw new Error("expected frame");
    expect(f.colGap).toBe(300);
    expect(f.rowGap).toBe(8);
  });
});

describe("lower: <Edges> compact-form seam (tldx-2rr)", () => {
  // <Edges> (src/runtime/components.ts) builds plain AstEdge nodes with a
  // real per-line span, no id, and no unusual attrs - the same shape a
  // hand-written <Edge> produces. These tests hand-build that exact shape
  // (lower.ts must not import runtime/, so they can't call <Edges> itself -
  // see CONTEXT.md's dependency rules) to pin down that a typo'd id from the
  // compact form gets the identical diagnostic, at the identical span, as
  // one from the verbose tag.
  it("a typo'd id from a compact-form edge still gets ir/unknown-reference, at the compact form's own span", () => {
    const compactSpan = { file: "diagram.tldx.jsx", line: 41, column: 8 };
    const compactEdge: AstEdge = {
      kind: "edge",
      attrs: {
        from: { value: "usre", span: compactSpan, nameSpan: compactSpan },
        to: { value: "auth", span: compactSpan, nameSpan: compactSpan },
      },
      span: compactSpan,
    };
    const ast = doc({}, [box({ id: "auth" }), compactEdge]);
    const diagnostics = lowerDiagnostics(ast);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("ir/unknown-reference");
    expect(diagnostics[0]!.message).toContain("usre");
    expect(diagnostics[0]!.span).toEqual(compactSpan);
  });

  it("a compact-form line with no '->' (missing 'to') gets ir/missing-edge-endpoint, same as a hand-written <Edge> missing 'to'", () => {
    const compactSpan = { file: "diagram.tldx.jsx", line: 12, column: 8 };
    const malformed: AstEdge = {
      kind: "edge",
      attrs: { from: { value: "just-an-id", span: compactSpan, nameSpan: compactSpan } },
      span: compactSpan,
    };
    const { codes } = lowerAst(doc({}, [malformed]));
    expect(codes).toEqual(["ir/missing-edge-endpoint"]);
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
      "'lable' is not supported on '<Box>' (allowed: id, label, x, y, w, h, maxW, color, fill, dash, geo, textAlign, verticalAlign, labelColor, font, size)",
    );
    // column 3: fixture's synthetic per-attribute column for `lable`, the
    // second attribute after `id`.
    expect(d!.span).toEqual({
      file: "test.tldx",
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

  // D16: `maxW` is documented on <Note> (and <Sticky>, same IR kind); accept
  // it and parse it as a number like every other note prop.
  it("accepts maxW on <note> and parses it as a number", () => {
    const ast = doc({}, [note({ id: "n", maxW: 160 }, "hi")]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const noteIr = ir!.children[0]!;
    if (noteIr.kind !== "note") throw new Error("expected note");
    expect(noteIr.maxW).toBe(160);
  });
});

// D19: a JSX string-literal `label` does not process `\n` - it stays two
// literal characters, not a line break. `check` should warn, not stay silent.
describe("lower: ir/literal-newline-in-label (D19)", () => {
  it("warns when a <box> label contains a literal backslash-n", () => {
    const ast = doc({}, [box({ id: "a", label: "line one\\nline two" })]);
    const diagnostics = lowerDiagnostics(ast);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.severity).toBe("warning");
    expect(diagnostics[0]!.code).toBe("ir/literal-newline-in-label");
  });

  it("warns when an <edge> label contains a literal backslash-n", () => {
    const ast = doc({}, [
      box({ id: "a" }),
      edge({ from: "a", to: "a", label: "line one\\nline two" }),
    ]);
    const diagnostics = lowerDiagnostics(ast);
    expect(diagnostics.map((d) => d.code)).toContain("ir/literal-newline-in-label");
  });

  it("does not warn on a label with an actual newline character (the expression form)", () => {
    const ast = doc({}, [box({ id: "a", label: "line one\nline two" })]);
    const diagnostics = lowerDiagnostics(ast);
    expect(diagnostics).toEqual([]);
  });

  it("does not warn on a label with no newline at all", () => {
    const ast = doc({}, [box({ id: "a", label: "one line" })]);
    const diagnostics = lowerDiagnostics(ast);
    expect(diagnostics).toEqual([]);
  });
});

describe("lower: diagnostics name the authored component, not the IR kind (T44)", () => {
  // Every alias the runtime exposes for `<frame>` (D12): plain `<Frame>` plus
  // its eight container aliases. `undefined` means "don't pass a tag" -
  // exercises the plain-`<Frame>` fallback in `displayTag`.
  const FRAME_TAGS = [
    undefined,
    "Row",
    "Col",
    "Grid",
    "Group",
    "Pipeline",
    "Layers",
    "Swimlanes",
    "Graph",
  ] as const;

  it.each(FRAME_TAGS)("ir/missing-id on a tagless <Frame> or alias %s names itself, not '<frame>'", (tag) => {
    const expectedTag = tag ?? "Frame";
    const ast = doc({}, [frame({}, [], false, tag)]);
    const diagnostics = lowerDiagnostics(ast);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("ir/missing-id");
    expect(diagnostics[0]!.message).toBe(
      `'<${expectedTag}>' is addressable and requires an explicit 'id'`,
    );
  });

  it.each(FRAME_TAGS)("ir/unknown-prop on <Frame> or alias %s names itself, not '<frame>'", (tag) => {
    const expectedTag = tag ?? "Frame";
    const ast = doc({}, [frame({ id: "f", bogus: "x" }, [], false, tag)]);
    const diagnostics = lowerDiagnostics(ast);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("ir/unknown-prop");
    expect(diagnostics[0]!.message).toMatch(new RegExp(`^'bogus' is not supported on '<${expectedTag}>'`));
  });

  // D16: `<Note>` and `<Sticky>` both lower to `kind: "note"`; the message
  // must say which one the author wrote. `maxW` is now an allowed note prop
  // (T45), so a genuinely unknown prop stands in as the test vehicle.
  it.each(["Note", "Sticky"] as const)("ir/unknown-prop on <%s> names itself, not '<note>'", (tag) => {
    const ast = doc({}, [note({ id: "n", bogus: "x" }, "hi", tag === "Sticky", tag === "Note" ? undefined : tag)]);
    const diagnostics = lowerDiagnostics(ast);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("ir/unknown-prop");
    expect(diagnostics[0]!.message).toBe(
      `'bogus' is not supported on '<${tag}>' (allowed: id, on, x, y, w, h, maxW, color, textAlign, verticalAlign, labelColor, font, size)`,
    );
  });
});

describe("lower: note sticky marker", () => {
  it("<Sticky> lowers to a note IR node with sticky: true", () => {
    const ast = doc({}, [note({ id: "n" }, "hi", true)]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const noteIr = ir!.children[0]!;
    if (noteIr.kind !== "note") throw new Error("expected note");
    expect(noteIr.sticky).toBe(true);
  });

  it("<Note> does not set sticky", () => {
    const ast = doc({}, [note({ id: "n" }, "hi")]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const noteIr = ir!.children[0]!;
    if (noteIr.kind !== "note") throw new Error("expected note");
    expect(noteIr.sticky).toBeUndefined();
  });
});

// C1 (tldx-b8v): <Text> lowers to the same "box" IR kind as <Box> (IRBox.text)
// - it shares every box layout rule - but takes its content from JSX
// children (like <Note>/<Sticky>), not a `label` attribute, is not
// addressable-required (an anonymous heading is fine), and rejects the
// border/fill-only props a real tldraw text shape doesn't have.
describe("lower: box text marker (C1)", () => {
  it("<Text> lowers to a box IR node with text: true and its body as label", () => {
    const ast = doc({}, [text({ id: "t" }, "Phase 1")]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const boxIr = ir!.children[0]!;
    if (boxIr.kind !== "box") throw new Error("expected box");
    expect(boxIr.text).toBe(true);
    expect(boxIr.label).toBe("Phase 1");
  });

  it("<Box> does not set text", () => {
    const ast = doc({}, [box({ id: "b", label: "hi" })]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const boxIr = ir!.children[0]!;
    if (boxIr.kind !== "box") throw new Error("expected box");
    expect(boxIr.text).toBeUndefined();
  });

  it("<Text> does not require an id (annotation, like <Note>)", () => {
    const ast = doc({}, [text({}, "hi")]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual([]);
  });

  it("<Box> still requires an id", () => {
    const ast = doc({}, [box({ label: "hi" })]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/missing-id"]);
  });

  it("rejects fill/dash/geo/verticalAlign/labelColor/h/label on <Text>", () => {
    const ast = doc({}, [
      text({ id: "t", fill: "solid", dash: "dashed", geo: "ellipse", verticalAlign: "end", labelColor: "red", h: 40, label: "nope" }, "hi"),
    ]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(Array(7).fill("ir/unknown-prop"));
  });

  it("accepts w/maxW/color/textAlign/font/size on <Text>", () => {
    const ast = doc({}, [
      text({ id: "t", w: 200, maxW: 300, color: "blue", textAlign: "end", font: "mono", size: "l" }, "hi"),
    ]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const boxIr = ir!.children[0]!;
    if (boxIr.kind !== "box") throw new Error("expected box");
    expect(boxIr.w).toBe(200);
    expect(boxIr.maxW).toBe(300);
    expect(boxIr.color).toBe("blue");
    expect(boxIr.textAlign).toBe("end");
    expect(boxIr.font).toBe("mono");
    expect(boxIr.size).toBe("l");
  });
});

describe("lower: frame group marker", () => {
  it("<Group> lowers to a frame IR node with group: true", () => {
    const ast = doc({}, [frame({ id: "g" }, [], true)]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const frameIr = ir!.children[0]!;
    if (frameIr.kind !== "frame") throw new Error("expected frame");
    expect(frameIr.group).toBe(true);
  });

  it("<Frame> does not set group", () => {
    const ast = doc({}, [frame({ id: "f" }, [])]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const frameIr = ir!.children[0]!;
    if (frameIr.kind !== "frame") throw new Error("expected frame");
    expect(frameIr.group).toBeUndefined();
  });
});

describe("lower: note 'on' target", () => {
  it("keeps 'on' when it resolves to a box", () => {
    const ast = doc({}, [box({ id: "a" }), note({ on: "a" }, "hi")]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const noteIr = ir!.children[1]!;
    if (noteIr.kind !== "note") throw new Error("expected note");
    expect(noteIr.on).toBe("a");
  });

  it("keeps 'on' when it resolves to a frame, note, or edge", () => {
    const ast = doc({}, [
      frame({ id: "f" }, [box({ id: "a" }), box({ id: "b" }), edge({ id: "e", from: "a", to: "b" })]),
      note({ id: "n1", on: "f" }, "on a frame"),
      note({ id: "n2", on: "n1" }, "on another note"),
      note({ id: "n3", on: "e" }, "on an edge"),
    ]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const [n1, n2, n3] = ir!.children.slice(1) as { on?: string }[];
    expect(n1?.on).toBe("f");
    expect(n2?.on).toBe("n1");
    expect(n3?.on).toBe("e");
  });

  it("ir/note-target-not-found drops 'on' but keeps the note", () => {
    const ast = doc({}, [note({ id: "n", on: "ghost" }, "hi")]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/note-target-not-found"]);
    const noteIr = ir!.children[0]!;
    if (noteIr.kind !== "note") throw new Error("expected note");
    expect(noteIr.on).toBeUndefined();
    expect(noteIr.text).toBe("hi");
  });

  it("does not reject 'on' as an unknown prop", () => {
    const ast = doc({}, [box({ id: "a" }), note({ on: "a" }, "hi")]);
    const { codes } = lowerAst(ast);
    expect(codes).not.toContain("ir/unknown-prop");
  });
});

describe("lower: style props (T9)", () => {
  it("captures color/fill/dash on <box>", () => {
    const ast = doc({}, [box({ id: "a", color: "blue", fill: "solid", dash: "dashed" })]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const boxIr = ir!.children[0]!;
    if (boxIr.kind !== "box") throw new Error("expected box");
    expect(boxIr.color).toBe("blue");
    expect(boxIr.fill).toBe("solid");
    expect(boxIr.dash).toBe("dashed");
  });

  it("captures geo on <box>", () => {
    const ast = doc({}, [box({ id: "a", geo: "diamond" })]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const boxIr = ir!.children[0]!;
    if (boxIr.kind !== "box") throw new Error("expected box");
    expect(boxIr.geo).toBe("diamond");
  });

  it("captures color on <frame>", () => {
    const ast = doc({}, [frame({ id: "f", color: "green" })]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const frameIr = ir!.children[0]!;
    if (frameIr.kind !== "frame") throw new Error("expected frame");
    expect(frameIr.color).toBe("green");
  });

  it("captures color on <note>", () => {
    const ast = doc({}, [note({ id: "n", color: "yellow" }, "hi")]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const noteIr = ir!.children[0]!;
    if (noteIr.kind !== "note") throw new Error("expected note");
    expect(noteIr.color).toBe("yellow");
  });

  it("captures color/dash/arrowheadStart/arrowheadEnd on <edge>", () => {
    const ast = doc({}, [
      box({ id: "a" }),
      edge({
        id: "e",
        from: "a",
        to: "a",
        color: "red",
        dash: "dotted",
        arrowheadStart: "square",
        arrowheadEnd: "diamond",
      }),
    ]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const edgeIr = ir!.children[1]!;
    if (edgeIr.kind !== "edge") throw new Error("expected edge");
    expect(edgeIr.color).toBe("red");
    expect(edgeIr.dash).toBe("dotted");
    expect(edgeIr.arrowheadStart).toBe("square");
    expect(edgeIr.arrowheadEnd).toBe("diamond");
  });

  it("ir/invalid-style-value for an unknown color, with a non-zero span, and omits the field", () => {
    const ast = doc({}, [box({ id: "a", color: "puce" })]);
    const diagnostics = lowerDiagnostics(ast);
    expect(diagnostics).toHaveLength(1);
    const [d] = diagnostics;
    expect(d!.code).toBe("ir/invalid-style-value");
    expect(d!.message).toContain("'color' must be one of");
    expect(d!.message).toContain("(got 'puce')");
    expect(d!.span).not.toEqual({ file: "", line: 0, column: 0 });
    expect(d!.span?.line).toBeGreaterThan(0);

    const { ir } = lower(ast);
    const boxIr = ir!.children[0]!;
    if (boxIr.kind !== "box") throw new Error("expected box");
    expect(boxIr.color).toBeUndefined();
  });

  it("ir/invalid-style-value for an unknown fill on <box>", () => {
    const { codes } = lowerAst(doc({}, [box({ id: "a", fill: "gradient" })]));
    expect(codes).toEqual(["ir/invalid-style-value"]);
  });

  it("ir/invalid-style-value for an unknown dash on <box>", () => {
    const { codes } = lowerAst(doc({}, [box({ id: "a", dash: "squiggly" })]));
    expect(codes).toEqual(["ir/invalid-style-value"]);
  });

  it("ir/invalid-style-value for an unknown geo on <box>", () => {
    const { codes } = lowerAst(doc({}, [box({ id: "a", geo: "cylinder" })]));
    expect(codes).toEqual(["ir/invalid-style-value"]);
  });

  it("ir/invalid-style-value for an unknown arrowheadStart on <edge>", () => {
    const ast = doc({}, [box({ id: "a" }), edge({ from: "a", to: "a", arrowheadStart: "star" })]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/invalid-style-value"]);
  });
});

describe("lower: text align / label color (T10)", () => {
  it("captures textAlign/verticalAlign/labelColor on <box>", () => {
    const ast = doc({}, [
      box({ id: "a", textAlign: "end", verticalAlign: "start", labelColor: "red" }),
    ]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const boxIr = ir!.children[0]!;
    if (boxIr.kind !== "box") throw new Error("expected box");
    expect(boxIr.textAlign).toBe("end");
    expect(boxIr.verticalAlign).toBe("start");
    expect(boxIr.labelColor).toBe("red");
  });

  it("captures textAlign/verticalAlign/labelColor on <note>", () => {
    const ast = doc({}, [
      note({ id: "n", textAlign: "middle", verticalAlign: "end", labelColor: "blue" }, "hi"),
    ]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const noteIr = ir!.children[0]!;
    if (noteIr.kind !== "note") throw new Error("expected note");
    expect(noteIr.textAlign).toBe("middle");
    expect(noteIr.verticalAlign).toBe("end");
    expect(noteIr.labelColor).toBe("blue");
  });

  it("ir/invalid-style-value for an unknown textAlign on <box>, and omits the field", () => {
    const ast = doc({}, [box({ id: "a", textAlign: "justify" })]);
    const diagnostics = lowerDiagnostics(ast);
    expect(diagnostics).toHaveLength(1);
    const [d] = diagnostics;
    expect(d!.code).toBe("ir/invalid-style-value");
    expect(d!.message).toContain("'textAlign' must be one of");
    expect(d!.message).toContain("(got 'justify')");

    const { ir } = lower(ast);
    const boxIr = ir!.children[0]!;
    if (boxIr.kind !== "box") throw new Error("expected box");
    expect(boxIr.textAlign).toBeUndefined();
  });

  it("ir/invalid-style-value for an unknown verticalAlign on <note>", () => {
    const ast = doc({}, [note({ id: "n", verticalAlign: "bottom" }, "hi")]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/invalid-style-value"]);
  });

  it("ir/invalid-style-value for an unknown labelColor on <box>", () => {
    const ast = doc({}, [box({ id: "a", labelColor: "puce" })]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/invalid-style-value"]);
  });
});

describe("lower: font / size (T11)", () => {
  it("captures font/size on <box>", () => {
    const ast = doc({}, [box({ id: "a", font: "sans", size: "xl" })]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const boxIr = ir!.children[0]!;
    if (boxIr.kind !== "box") throw new Error("expected box");
    expect(boxIr.font).toBe("sans");
    expect(boxIr.size).toBe("xl");
  });

  it("captures font/size on <note>", () => {
    const ast = doc({}, [note({ id: "n", font: "mono", size: "s" }, "hi")]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const noteIr = ir!.children[0]!;
    if (noteIr.kind !== "note") throw new Error("expected note");
    expect(noteIr.font).toBe("mono");
    expect(noteIr.size).toBe("s");
  });

  it("ir/invalid-style-value for an unknown font on <box>", () => {
    const ast = doc({}, [box({ id: "a", font: "comic-sans" })]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/invalid-style-value"]);
  });

  it("ir/invalid-style-value for an unknown size on <note>", () => {
    const ast = doc({}, [note({ id: "n", size: "xxl" }, "hi")]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/invalid-style-value"]);
  });
});

describe("lower: arrow labels (T12)", () => {
  it("captures label on <edge>", () => {
    const ast = doc({}, [
      box({ id: "a" }),
      edge({ id: "e", from: "a", to: "a", label: "publishes" }),
    ]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const edgeIr = ir!.children[1]!;
    if (edgeIr.kind !== "edge") throw new Error("expected edge");
    expect(edgeIr.label).toBe("publishes");
  });

  it("captures labelColor/font/size on <edge>", () => {
    const ast = doc({}, [
      box({ id: "a" }),
      edge({ id: "e", from: "a", to: "a", labelColor: "red", font: "mono", size: "xl" }),
    ]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const edgeIr = ir!.children[1]!;
    if (edgeIr.kind !== "edge") throw new Error("expected edge");
    expect(edgeIr.labelColor).toBe("red");
    expect(edgeIr.font).toBe("mono");
    expect(edgeIr.size).toBe("xl");
  });

  it("leaves label undefined on an <edge> with no label", () => {
    const ast = doc({}, [box({ id: "a" }), edge({ id: "e", from: "a", to: "a" })]);
    const { ir, codes } = lowerAst(ast);
    expect(codes).toEqual([]);
    const edgeIr = ir!.children[1]!;
    if (edgeIr.kind !== "edge") throw new Error("expected edge");
    expect(edgeIr.label).toBeUndefined();
  });

  it("ir/invalid-style-value for an unknown labelColor on <edge>", () => {
    const ast = doc({}, [box({ id: "a" }), edge({ from: "a", to: "a", labelColor: "puce" })]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/invalid-style-value"]);
  });

  it("ir/invalid-style-value for an unknown font on <edge>", () => {
    const ast = doc({}, [box({ id: "a" }), edge({ from: "a", to: "a", font: "comic-sans" })]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/invalid-style-value"]);
  });

  it("ir/invalid-style-value for an unknown size on <edge>", () => {
    const ast = doc({}, [box({ id: "a" }), edge({ from: "a", to: "a", size: "xxl" })]);
    const { codes } = lowerAst(ast);
    expect(codes).toEqual(["ir/invalid-style-value"]);
  });
});
