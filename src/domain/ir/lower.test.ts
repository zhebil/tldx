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
      "'lable' is not supported on '<Box>' (allowed: id, label, x, y, w, h, maxW, color, fill, dash, geo, textAlign, verticalAlign, labelColor, font, size)",
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
  // must say which one the author wrote.
  it.each(["Note", "Sticky"] as const)("ir/unknown-prop on <%s> names itself, not '<note>'", (tag) => {
    const ast = doc({}, [note({ id: "n", maxW: 160 }, "hi", tag === "Sticky", tag === "Note" ? undefined : tag)]);
    const diagnostics = lowerDiagnostics(ast);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.code).toBe("ir/unknown-prop");
    expect(diagnostics[0]!.message).toBe(
      `'maxW' is not supported on '<${tag}>' (allowed: id, on, x, y, w, h, color, textAlign, verticalAlign, labelColor, font, size)`,
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
