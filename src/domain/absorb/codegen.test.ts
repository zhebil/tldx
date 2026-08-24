import { describe, expect, it } from "vitest";

import { boxShape, noteShape } from "../../contracts/builders.js";
import type { TLRecord } from "../../contracts/scene-json.js";

import {
  absorbAdded,
  elementJsx,
  offsetAt,
  patchGapAttr,
  scanElement,
  spliceReorder,
} from "./codegen.js";

describe("domain/absorb/codegen: elementJsx", () => {
  it("round-trips a geo record's every DSL-expressible prop into a <Box>", () => {
    const record = boxShape({
      id: "shape:checkout",
      x: 10,
      y: 20,
      w: 160,
      h: 80,
      geo: "diamond",
      color: "red",
      fill: "solid",
      dash: "dashed",
      size: "l",
      font: "mono",
      textAlign: "start",
      verticalAlign: "end",
      labelColor: "blue",
      text: "Checkout",
    });

    const jsx = elementJsx(record);

    expect(jsx).toBe(
      '<Box id="checkout" x="10" y="20" w="160" h="80" geo="diamond" color="red" fill="solid" ' +
        'dash="dashed" size="l" font="mono" textAlign="start" verticalAlign="end" labelColor="blue" ' +
        'label="Checkout"/>',
    );
  });

  it("strips the shape: prefix to recover the author id, without prettifying an ugly one", () => {
    const record = boxShape({ id: "shape:abc123", x: 0, y: 0, w: 40, h: 40 });
    expect(elementJsx(record)).toContain('id="abc123"');
  });

  it('omits label entirely for an empty richText, rather than emitting label=""', () => {
    const record = boxShape({ id: "shape:empty", x: 0, y: 0, w: 40, h: 40 });
    const jsx = elementJsx(record) ?? "";
    expect(jsx).not.toMatch(/\blabel=/);
  });

  it("quotes a label needing escaping as a JSON.stringify expression, not a bare attribute", () => {
    const record = boxShape({ id: "shape:q", x: 0, y: 0, w: 40, h: 40, text: 'has "quotes"' });
    expect(elementJsx(record)).toContain('label={"has \\"quotes\\""}');
  });

  it("emits a note record as <Sticky>, not <Note> - only <Sticky> compiles to a type: note record", () => {
    const record = noteShape({
      id: "shape:reminder",
      x: 5,
      y: 6,
      color: "yellow",
      size: "m",
      font: "draw",
      growY: 40,
      text: "Remember this",
    });

    const jsx = elementJsx(record);

    expect(jsx).toContain("<Sticky ");
    expect(jsx).not.toContain("<Note ");
    expect(jsx).toContain('h="240"'); // NOTE_SIZE (200) + growY (40)
    expect(jsx).toContain('{"Remember this"}');
    expect(jsx?.endsWith("</Sticky>")).toBe(true);
  });

  it("self-closes a note record with no text", () => {
    const record = noteShape({ id: "shape:blank", x: 0, y: 0 });
    expect(elementJsx(record)).toMatch(/^<Sticky .*\/>$/);
  });

  it("returns null for a shape type absorb can't express (e.g. arrow)", () => {
    const record: TLRecord = {
      id: "shape:arrow1",
      typeName: "shape",
      type: "arrow",
      x: 0,
      y: 0,
      props: {},
    };
    expect(elementJsx(record)).toBeNull();
  });
});

describe("domain/absorb/codegen: absorbAdded splice", () => {
  const box = (id: string, x: number, index?: string) =>
    boxShape({
      id: `shape:${id}`,
      x,
      y: 0,
      w: 40,
      h: 40,
      ...(index === undefined ? {} : { index }),
    });

  it("leaves the source byte-identical for an empty record list", () => {
    const source = 'import { Doc } from "tldx";\nexport default () => (\n  <Doc>\n  </Doc>\n);\n';
    expect(absorbAdded(source, [])).toEqual({ source });
  });

  it("expands a self-closing <Doc/> and inserts children before </Doc>", () => {
    const source = [
      'import { Doc } from "tldx";',
      "",
      "export default function Diagram() {",
      "  return <Doc/>;",
      "}",
      "",
    ].join("\n");

    const result = absorbAdded(source, [box("a", 0)]);
    expect("error" in result).toBe(false);
    const { source: rewritten } = result as { source: string };

    expect(rewritten).toContain(
      '<Doc>\n    <Box id="a" x="0" y="0" w="40" h="40" geo="rectangle" color="black" fill="none" ' +
        'dash="draw" size="m" font="draw" textAlign="middle" verticalAlign="middle" labelColor="black"/>\n  </Doc>',
    );
    expect(rewritten).not.toContain("/>;");
    expect(rewritten).toContain('import { Doc, Box } from "tldx";');
  });

  it("inserts before an existing </Doc> on a multi-child root, preserving what's already there", () => {
    const source = [
      'import { Doc, Box } from "tldx";',
      "",
      "export default function Diagram() {",
      "  return (",
      "    <Doc>",
      '      <Box id="existing" x="0" y="0" w="10" h="10"/>',
      "    </Doc>",
      "  );",
      "}",
      "",
    ].join("\n");

    const result = absorbAdded(source, [box("added", 100)]);
    expect("error" in result).toBe(false);
    const { source: rewritten } = result as { source: string };

    expect(rewritten).toContain('id="existing"');
    expect(rewritten).toContain('id="added"');
    expect(rewritten.indexOf('id="existing"')).toBeLessThan(rewritten.indexOf('id="added"'));
    expect(rewritten).toContain(
      '      <Box id="added" x="100" y="0" w="40" h="40" geo="rectangle" color="black" fill="none" ' +
        'dash="draw" size="m" font="draw" textAlign="middle" verticalAlign="middle" labelColor="black"/>\n    </Doc>',
    );
  });

  it("orders generated elements by record index then id", () => {
    const source = 'import { Doc } from "tldx";\nreturn <Doc/>;';
    const records = [box("z", 0, "a2"), box("a", 0, "a1"), box("b", 0, "a1")];
    const result = absorbAdded(source, records);
    const { source: rewritten } = result as { source: string };
    const order = ["a", "b", "z"].map((id) => rewritten.indexOf(`id="${id}"`));
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });

  it("adds Box to an existing tldx import only when it's missing", () => {
    const source = 'import { Doc, Box } from "tldx";\nreturn <Doc/>;';
    const result = absorbAdded(source, [box("a", 0)]);
    const { source: rewritten } = result as { source: string };
    expect(rewritten).toContain('import { Doc, Box } from "tldx";');
    expect(rewritten).not.toContain("Box, Box");
  });

  it("errors instead of guessing when the source has no tldx import to extend", () => {
    const result = absorbAdded("return <Doc/>;", [box("a", 0)]);
    expect(result).toEqual({ error: expect.stringContaining("tldx") });
  });

  it("errors when no <Doc> is found", () => {
    const source = 'import { Doc } from "tldx";\nexport default () => null;';
    const result = absorbAdded(source, [box("a", 0)]);
    expect(result).toEqual({ error: expect.stringContaining("<Doc>") });
  });

  it("errors when more than one <Doc> is found", () => {
    const source = 'import { Doc } from "tldx";\nconst a = <Doc/>; const b = <Doc/>;';
    const result = absorbAdded(source, [box("a", 0)]);
    expect(result).toEqual({ error: expect.stringContaining("<Doc>") });
  });

  it("errors when a record has no JSX form, instead of silently dropping it", () => {
    const arrow: TLRecord = {
      id: "shape:arrow1",
      typeName: "shape",
      type: "arrow",
      x: 0,
      y: 0,
      props: {},
    };
    const result = absorbAdded("return <Doc/>;", [arrow]);
    expect(result).toEqual({ error: expect.stringContaining("arrow1") });
  });
});

describe("domain/absorb/codegen: offsetAt/scanElement (move-ladder text scanning)", () => {
  it("offsetAt finds the exact position of an element's '<' on later lines", () => {
    const source = 'line one\n  <Box id="a" />\n  <Box id="b" />\n';
    const offset = offsetAt(source, 2, 3);
    expect(source[offset]).toBe("<");
    expect(source.slice(offset, offset + 4)).toBe("<Box");
  });

  it("scanElement spans a self-closing element exactly", () => {
    const source = '  <Box id="a" w="10" />\nrest';
    const start = source.indexOf("<Box");
    const span = scanElement(source, start);
    expect(span).toEqual({ start, end: source.indexOf("\n") });
    expect(source.slice(span!.start, span!.end)).toBe('<Box id="a" w="10" />');
  });

  it("scanElement spans a paired element, including nested children of the same tag name", () => {
    const source =
      '<Row id="r">\n  <Frame id="f1"><Frame id="f2" /></Frame>\n  <Box id="b" />\n</Row>';
    const start = source.indexOf('<Frame id="f1"');
    const span = scanElement(source, start);
    expect(source.slice(span!.start, span!.end)).toBe('<Frame id="f1"><Frame id="f2" /></Frame>');
  });

  it("scanElement skips '<' inside an expression child without losing depth", () => {
    const source = '<Box id="a" label={1 < 2 ? "x" : "y"}>{"child"}</Box>';
    const span = scanElement(source, 0);
    expect(span).toEqual({ start: 0, end: source.length });
  });
});

describe("domain/absorb/codegen: spliceReorder (move-ladder reorder rung)", () => {
  const SOURCE = [
    'import { Doc, Box } from "tldx";',
    "export default function D() {",
    "  return (",
    '    <Doc layout="row">',
    '      <Box id="a" label="A" />',
    '      <Box id="b" label="B" />',
    '      <Box id="c" label="C" />',
    "    </Doc>",
    "  );",
    "}",
    "",
  ].join("\n");

  function spanOf(id: string): { line: number; column: number } {
    const lines = SOURCE.split("\n");
    const line = lines.findIndex((l) => l.includes(`id="${id}"`)) + 1;
    const column = lines[line - 1]!.indexOf("<Box") + 1;
    return { line, column };
  }

  it("moves the dragged child to the front, keeping the others' relative order", () => {
    const spans = [spanOf("a"), spanOf("b"), spanOf("c")];
    const result = spliceReorder(SOURCE, spans, /* draggedIndex (c) */ 2, /* toIndex */ 0);
    if ("error" in result) throw new Error(result.error);
    const order = [...result.source.matchAll(/id="(\w)"/g)].map((m) => m[1]);
    expect(order).toEqual(["c", "a", "b"]);
    // Untouched surroundings survive verbatim.
    expect(result.source).toContain('<Doc layout="row">');
    expect(result.source).toContain("</Doc>");
  });

  it("moves the dragged child to the middle", () => {
    const spans = [spanOf("a"), spanOf("b"), spanOf("c")];
    const result = spliceReorder(SOURCE, spans, /* draggedIndex (a) */ 0, /* toIndex */ 1);
    if ("error" in result) throw new Error(result.error);
    const order = [...result.source.matchAll(/id="(\w)"/g)].map((m) => m[1]);
    expect(order).toEqual(["b", "a", "c"]);
  });

  it("errors when siblings share a line rather than one-per-line", () => {
    const oneLine = '<Doc layout="row"><Box id="a" /><Box id="b" /></Doc>';
    const spans = [
      { line: 1, column: oneLine.indexOf('<Box id="a"') + 1 },
      { line: 1, column: oneLine.indexOf('<Box id="b"') + 1 },
    ];
    const result = spliceReorder(oneLine, spans, 0, 1);
    expect(result).toEqual({ error: expect.stringContaining("separate lines") });
  });
});

describe("domain/absorb/codegen: patchGapAttr (move-ladder gap rung)", () => {
  it("inserts a gap attribute that wasn't there before", () => {
    const source = '<Row id="r">\n  <Box id="a" />\n</Row>';
    const span = { line: 1, column: 1 };
    const result = patchGapAttr(source, span, "gap", 80);
    if ("error" in result) throw new Error(result.error);
    expect(result.source).toContain('<Row id="r" gap="80">');
  });

  it("overwrites an existing gap attribute's value", () => {
    const source = '<Row id="r" gap="40">\n  <Box id="a" />\n</Row>';
    const span = { line: 1, column: 1 };
    const result = patchGapAttr(source, span, "gap", 96.5);
    if ("error" in result) throw new Error(result.error);
    expect(result.source).toContain('<Row id="r" gap="96.5">');
    expect(result.source).not.toContain('gap="40"');
  });

  it("targets colGap specifically, leaving a plain gap attribute alone", () => {
    const source = '<Row id="r" gap="40" colGap="60">\n  <Box id="a" />\n</Row>';
    const span = { line: 1, column: 1 };
    const result = patchGapAttr(source, span, "colGap", 90);
    if ("error" in result) throw new Error(result.error);
    expect(result.source).toContain('gap="40"');
    expect(result.source).toContain('colGap="90"');
  });

  it("patches a self-closing container's own tag", () => {
    const source = '<Row id="r" />';
    const span = { line: 1, column: 1 };
    const result = patchGapAttr(source, span, "gap", 10);
    if ("error" in result) throw new Error(result.error);
    expect(result.source).toBe('<Row id="r" gap="10"/>');
  });
});
