import { describe, expect, it } from "vitest";

import { boxShape, noteShape } from "../../contracts/builders.js";
import type { TLRecord } from "../../contracts/scene-json.js";

import { absorbAdded, elementJsx } from "./codegen.js";

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

  it("omits label entirely for an empty richText, rather than emitting label=\"\"", () => {
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
    boxShape({ id: `shape:${id}`, x, y: 0, w: 40, h: 40, ...(index === undefined ? {} : { index }) });

  it("expands a self-closing <Doc/> and inserts children before </Doc>", () => {
    const source = [
      'import { Doc } from "tldsl";',
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
    expect(rewritten).toContain('import { Doc, Box } from "tldsl";');
  });

  it("inserts before an existing </Doc> on a multi-child root, preserving what's already there", () => {
    const source = [
      'import { Doc, Box } from "tldsl";',
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
    const source = 'import { Doc } from "tldsl";\nreturn <Doc/>;';
    const records = [box("z", 0, "a2"), box("a", 0, "a1"), box("b", 0, "a1")];
    const result = absorbAdded(source, records);
    const { source: rewritten } = result as { source: string };
    const order = ["a", "b", "z"].map((id) => rewritten.indexOf(`id="${id}"`));
    expect(order).toEqual([...order].sort((x, y) => x - y));
  });

  it("adds Box to an existing tldsl import only when it's missing", () => {
    const source = 'import { Doc, Box } from "tldsl";\nreturn <Doc/>;';
    const result = absorbAdded(source, [box("a", 0)]);
    const { source: rewritten } = result as { source: string };
    expect(rewritten).toContain('import { Doc, Box } from "tldsl";');
    expect(rewritten).not.toContain("Box, Box");
  });

  it("errors instead of guessing when the source has no tldsl import to extend", () => {
    const result = absorbAdded("return <Doc/>;", [box("a", 0)]);
    expect(result).toEqual({ error: expect.stringContaining("tldsl") });
  });

  it("errors when no <Doc> is found", () => {
    const source = 'import { Doc } from "tldsl";\nexport default () => null;';
    const result = absorbAdded(source, [box("a", 0)]);
    expect(result).toEqual({ error: expect.stringContaining("<Doc>") });
  });

  it("errors when more than one <Doc> is found", () => {
    const source = 'import { Doc } from "tldsl";\nconst a = <Doc/>; const b = <Doc/>;';
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
