import { describe, it, expect } from "vitest";
import {
  arrowBinding,
  arrowShape,
  boxShape,
  documentRecord,
  frameShape,
  noteShape,
  pageRecord,
  richText,
  sceneJson,
  sceneMessage,
} from "./builders.js";

describe("sceneMessage", () => {
  it("scene wraps a payload at v=1", () => {
    const msg = sceneMessage.scene(sceneJson([documentRecord()]));
    expect(msg).toMatchObject({ v: 1, kind: "scene" });
  });

  it("error wraps diagnostics at v=1", () => {
    const msg = sceneMessage.error([
      { severity: "error", code: "x/y", message: "boom" },
    ]);
    expect(msg).toMatchObject({
      v: 1,
      kind: "error",
      payload: { diagnostics: [{ code: "x/y" }] },
    });
  });

  it("ping has an empty object payload", () => {
    expect(sceneMessage.ping()).toEqual({ v: 1, kind: "ping", payload: {} });
  });
});

describe("sceneJson", () => {
  it("indexes records by their own id", () => {
    const doc = documentRecord();
    const page = pageRecord({ id: "page:main" });
    const scene = sceneJson([doc, page]);
    expect(scene.store["document:document"]).toBe(doc);
    expect(scene.store["page:main"]).toBe(page);
  });

  it("uses default schema when none is passed", () => {
    const scene = sceneJson([documentRecord()]);
    expect(scene.schema.schemaVersion).toBe(2);
    expect(scene.schema.sequences["com.tldraw.store"]).toBe(5);
  });

  it("accepts an explicit schema override", () => {
    const scene = sceneJson([documentRecord()], {
      schemaVersion: 3,
      sequences: { "com.tldraw.store": 99 },
    });
    expect(scene.schema.schemaVersion).toBe(3);
    expect(scene.schema.sequences["com.tldraw.store"]).toBe(99);
  });
});

describe("record factories", () => {
  it("documentRecord defaults to id=document:document", () => {
    expect(documentRecord()).toMatchObject({
      id: "document:document",
      typeName: "document",
      gridSize: 10,
    });
  });

  it("pageRecord requires only an id", () => {
    expect(pageRecord({ id: "page:home" })).toMatchObject({
      id: "page:home",
      typeName: "page",
      name: "tldx",
      index: "a1",
    });
  });

  it("boxShape sets typeName=shape, type=geo with rectangle defaults", () => {
    const shape = boxShape({ id: "shape:a", x: 10, y: 20, w: 100, h: 50 });
    expect(shape).toMatchObject({
      id: "shape:a",
      typeName: "shape",
      type: "geo",
      x: 10,
      y: 20,
      parentId: "page:main",
      props: { w: 100, h: 50, geo: "rectangle", color: "black", fill: "none" },
    });
  });

  it("boxShape accepts color/fill overrides", () => {
    const shape = boxShape({ id: "shape:a", x: 0, y: 0, w: 100, h: 50, color: "yellow", fill: "semi" });
    expect(shape.props).toMatchObject({ color: "yellow", fill: "semi" });
  });

  it("boxShape carries rich text when text is provided", () => {
    const shape = boxShape({
      id: "shape:a",
      x: 0,
      y: 0,
      w: 1,
      h: 1,
      text: "Login",
    });
    expect(shape.props).toMatchObject({
      richText: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Login" }] },
        ],
      },
    });
  });

  it("noteShape produces a tldraw note record", () => {
    expect(
      noteShape({ id: "shape:n", x: 0, y: 0, text: "todo" }),
    ).toMatchObject({
      typeName: "shape",
      type: "note",
      props: { color: "yellow", size: "m" },
    });
  });

  it("frameShape carries w/h and a name", () => {
    expect(
      frameShape({ id: "shape:f", x: 0, y: 0, w: 800, h: 600, name: "Auth" }),
    ).toMatchObject({
      typeName: "shape",
      type: "frame",
      props: { w: 800, h: 600, name: "Auth" },
    });
  });

  it("arrowShape produces zero-length placeholder coords", () => {
    const arrow = arrowShape({ id: "shape:e", x: 0, y: 0 });
    expect(arrow).toMatchObject({
      typeName: "shape",
      type: "arrow",
      props: {
        start: { x: 0, y: 0 },
        end: { x: 0, y: 0 },
        arrowheadEnd: "arrow",
      },
    });
  });

  it("arrowBinding ties an arrow shape to a target with terminal", () => {
    expect(
      arrowBinding({
        id: "binding:b1",
        arrowId: "shape:e",
        shapeId: "shape:a",
        terminal: "end",
      }),
    ).toEqual({
      id: "binding:b1",
      typeName: "binding",
      type: "arrow",
      fromId: "shape:e",
      toId: "shape:a",
      props: {
        terminal: "end",
        normalizedAnchor: { x: 0.5, y: 0.5 },
        isPrecise: false,
        isExact: false,
        snap: "none",
      },
      meta: {},
    });
  });
});

describe("richText", () => {
  it("empty string maps to an empty paragraph", () => {
    expect(richText("")).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });

  it("single line wraps in one paragraph with one text node", () => {
    expect(richText("hello")).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "hello" }] },
      ],
    });
  });

  it("newlines split into multiple paragraphs", () => {
    expect(richText("a\nb")).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "a" }] },
        { type: "paragraph", content: [{ type: "text", text: "b" }] },
      ],
    });
  });

  it("blank lines become empty paragraphs", () => {
    expect(richText("a\n\nb")).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "a" }] },
        { type: "paragraph" },
        { type: "paragraph", content: [{ type: "text", text: "b" }] },
      ],
    });
  });
});

describe("integration: builders compose into a realistic scene", () => {
  it("two boxes connected by an arrow with bindings", () => {
    const scene = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({
        id: "shape:login",
        x: 0,
        y: 0,
        w: 200,
        h: 100,
        text: "Login",
        index: "a1",
      }),
      boxShape({
        id: "shape:home",
        x: 320,
        y: 0,
        w: 200,
        h: 100,
        text: "Home",
        index: "a2",
      }),
      arrowShape({ id: "shape:e1", x: 0, y: 0, index: "a3" }),
      arrowBinding({
        id: "binding:e1-start",
        arrowId: "shape:e1",
        shapeId: "shape:login",
        terminal: "start",
      }),
      arrowBinding({
        id: "binding:e1-end",
        arrowId: "shape:e1",
        shapeId: "shape:home",
        terminal: "end",
      }),
    ]);

    expect(Object.keys(scene.store).sort()).toEqual([
      "binding:e1-end",
      "binding:e1-start",
      "document:document",
      "page:main",
      "shape:e1",
      "shape:home",
      "shape:login",
    ]);
    expect(sceneMessage.scene(scene).kind).toBe("scene");
  });
});
