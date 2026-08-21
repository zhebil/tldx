import { describe, expect, it } from "vitest";

import type {
  IRBoxPositioned,
  IRDocPositioned,
  IREdge,
  IRElementPositioned,
  IRFramePositioned,
  IRNotePositioned,
} from "../ir/index.js";

import { emit } from "./emit.js";

describe("domain/emit", () => {
  it("emits document + page records on an empty doc", () => {
    const scene = emit(doc([]));
    const records = Object.values(scene.store);

    expect(records).toHaveLength(2);
    expect(scene.store["document:document"]?.typeName).toBe("document");
    expect(scene.store["page:main"]?.typeName).toBe("page");
  });

  it("uses the pinned schema from contracts/builders", () => {
    // The schema is opaque to us; we just assert emit doesn't synthesize one
    // off-band. If this fails we'd be diverging from the round-trip contract.
    const scene = emit(doc([]));
    expect(scene.schema.schemaVersion).toBe(2);
    expect(scene.schema.sequences["com.tldraw.store"]).toBeGreaterThan(0);
  });

  it("emits a box as a geo shape parented to the page, with label as rich text", () => {
    const scene = emit(
      doc([box({ id: "login", x: 10, y: 20, w: 160, h: 80, label: "Login" })]),
    );
    const shape = scene.store["shape:login"];
    expect(shape).toBeDefined();
    expect(shape?.typeName).toBe("shape");
    expect(shape?.type).toBe("geo");
    expect(shape?.parentId).toBe("page:main");
    expect(shape?.x).toBe(10);
    expect(shape?.y).toBe(20);
    const props = shape?.props as { w: number; h: number; richText: unknown };
    expect(props.w).toBe(160);
    expect(props.h).toBe(80);
    expect(props.richText).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Login" }] }],
    });
  });

  it("emits a label-less box with empty rich text rather than dropping the field", () => {
    const scene = emit(doc([box({ id: "blank", x: 0, y: 0, w: 80, h: 40 })]));
    const props = scene.store["shape:blank"]?.props as { richText: unknown };
    expect(props.richText).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });

  it("parents frame children to the frame's shape id (not the page)", () => {
    const scene = emit(
      doc([
        frame({
          id: "f",
          x: 40,
          y: 40,
          w: 400,
          h: 200,
          name: "Auth",
          children: [
            box({ id: "a", x: 20, y: 60, w: 120, h: 60, label: "A" }),
            box({ id: "b", x: 180, y: 60, w: 120, h: 60, label: "B" }),
          ],
        }),
      ]),
    );

    expect(scene.store["shape:f"]?.parentId).toBe("page:main");
    expect(scene.store["shape:f"]?.type).toBe("frame");
    expect(scene.store["shape:a"]?.parentId).toBe("shape:f");
    expect(scene.store["shape:b"]?.parentId).toBe("shape:f");
    // x/y are preserved verbatim - they're already frame-relative in the IR.
    expect(scene.store["shape:a"]?.x).toBe(20);
    expect(scene.store["shape:a"]?.y).toBe(60);
  });

  it("emits a note as a note shape and drops its IR w/h", () => {
    const scene = emit(
      doc([
        note({
          id: "n1",
          text: "remember this",
          x: 5,
          y: 6,
          w: 200,
          h: 80,
        }),
      ]),
    );
    const shape = scene.store["shape:n1"];
    expect(shape?.type).toBe("note");
    expect(shape?.x).toBe(5);
    expect(shape?.y).toBe(6);
    const props = shape?.props as Record<string, unknown>;
    expect(props.w).toBeUndefined();
    expect(props.h).toBeUndefined();
    expect(props.richText).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "remember this" }] },
      ],
    });
  });

  it("sets note growY to the reserved height above tldraw's 200 base, 0 when short", () => {
    const tall = emit(
      doc([note({ id: "n2", text: "long", x: 0, y: 0, w: 200, h: 500 })]),
    );
    expect((tall.store["shape:n2"]?.props as Record<string, unknown>).growY).toBe(300);

    const short = emit(
      doc([note({ id: "n3", text: "short", x: 0, y: 0, w: 200, h: 150 })]),
    );
    expect((short.store["shape:n3"]?.props as Record<string, unknown>).growY).toBe(0);
  });

  it("emits an edge as an arrow shape plus two bindings with default-center attach", () => {
    const scene = emit(
      doc([
        box({ id: "a", x: 0, y: 0, w: 120, h: 60 }),
        box({ id: "b", x: 200, y: 0, w: 120, h: 60 }),
        edge({ id: "e1", from: "a", to: "b" }),
      ]),
    );

    const arrow = scene.store["shape:e1"];
    expect(arrow?.type).toBe("arrow");
    expect(arrow?.parentId).toBe("page:main");
    expect(arrow?.x).toBe(0);
    expect(arrow?.y).toBe(0);

    const start = scene.store["binding:e1-start"];
    const end = scene.store["binding:e1-end"];
    expect(start?.typeName).toBe("binding");
    expect(end?.typeName).toBe("binding");
    expect(start?.["fromId"]).toBe("shape:e1");
    expect(start?.["toId"]).toBe("shape:a");
    expect(end?.["toId"]).toBe("shape:b");
    expect((start?.props as { terminal: string }).terminal).toBe("start");
    expect((end?.props as { terminal: string }).terminal).toBe("end");
    expect((start?.props as { normalizedAnchor: { x: number; y: number } }).normalizedAnchor).toEqual({
      x: 0.5,
      y: 0.5,
    });
  });

  it("parents an edge to the page even when the IR nests it inside a frame", () => {
    // Edge bindings carry the connection; arrows live on the page so frame
    // clipping doesn't hide them.
    const scene = emit(
      doc([
        frame({
          id: "f",
          x: 0,
          y: 0,
          w: 400,
          h: 200,
          children: [
            box({ id: "a", x: 0, y: 0, w: 120, h: 60 }),
            box({ id: "b", x: 200, y: 0, w: 120, h: 60 }),
            edge({ id: "e", from: "a", to: "b" }),
          ],
        }),
      ]),
    );
    expect(scene.store["shape:e"]?.parentId).toBe("page:main");
    expect(scene.store["binding:e-start"]?.["toId"]).toBe("shape:a");
  });

  it("matches the snapshot for an auth-flow scene", () => {
    const scene = emit(
      doc([
        frame({
          id: "auth-flow",
          name: "Auth flow",
          x: 40,
          y: 40,
          w: 700,
          h: 200,
          children: [
            box({
              id: "user",
              x: 20,
              y: 60,
              w: 160,
              h: 80,
              label: "User",
            }),
            box({
              id: "login",
              x: 220,
              y: 60,
              w: 160,
              h: 80,
              label: "Login form",
            }),
            box({
              id: "auth",
              x: 420,
              y: 60,
              w: 160,
              h: 80,
              label: "Auth service",
            }),
            edge({ id: "u-l", from: "user", to: "login" }),
            edge({ id: "l-a", from: "login", to: "auth" }),
          ],
        }),
      ]),
    );

    // Schema is opaque and pinned in builders; redact for the snapshot so a
    // tldraw point-release schema bump doesn't churn the emit snapshot.
    expect({ store: scene.store }).toMatchSnapshot();
  });
});

// -- helpers ------------------------------------------------------------------

const SPAN = { file: "test.tldsl", line: 1, column: 1 };

function doc(children: IRElementPositioned[]): IRDocPositioned {
  return {
    kind: "doc",
    id: "root",
    idExplicit: false,
    span: SPAN,
    children,
  };
}

function box(input: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
}): IRBoxPositioned {
  const { label, ...rest } = input;
  return {
    kind: "box",
    idExplicit: true,
    span: SPAN,
    ...rest,
    ...(label === undefined ? {} : { label }),
  };
}

function note(input: {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
}): IRNotePositioned {
  return {
    kind: "note",
    idExplicit: false,
    span: SPAN,
    ...input,
  };
}

function frame(input: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  name?: string;
  children: IRElementPositioned[];
}): IRFramePositioned {
  const { name, ...rest } = input;
  return {
    kind: "frame",
    idExplicit: true,
    span: SPAN,
    ...rest,
    ...(name === undefined ? {} : { name }),
  };
}

function edge(input: { id: string; from: string; to: string }): IREdge {
  return {
    kind: "edge",
    idExplicit: true,
    span: SPAN,
    ...input,
  };
}
