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

  it("emits an edge as an arrow shape plus two bindings with side-based attach for a horizontal pair", () => {
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
    // b sits to the right of a: exits a's right side, enters b's left side.
    expect(
      (start?.props as { normalizedAnchor: { x: number; y: number } })
        .normalizedAnchor,
    ).toEqual({ x: 1, y: 0.5 });
    expect((start?.props as { isPrecise: boolean }).isPrecise).toBe(true);
    expect(
      (end?.props as { normalizedAnchor: { x: number; y: number } })
        .normalizedAnchor,
    ).toEqual({ x: 0, y: 0.5 });
    expect((end?.props as { isPrecise: boolean }).isPrecise).toBe(true);
  });

  it("picks top/bottom sides for a vertical pair", () => {
    const scene = emit(
      doc([
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 0, y: 300, w: 100, h: 50 }),
        edge({ id: "e1", from: "a", to: "b" }),
      ]),
    );

    const start = scene.store["binding:e1-start"];
    const end = scene.store["binding:e1-end"];
    // b sits below a: exits a's bottom, enters b's top.
    expect(
      (start?.props as { normalizedAnchor: { x: number; y: number } })
        .normalizedAnchor,
    ).toEqual({ x: 0.5, y: 1 });
    expect(
      (end?.props as { normalizedAnchor: { x: number; y: number } })
        .normalizedAnchor,
    ).toEqual({ x: 0.5, y: 0 });
  });

  it("accumulates the frame's absolute origin when picking a side for a nested endpoint", () => {
    // Without accumulating frame "f"'s (1000, 0) origin, "inner"'s naive
    // (unaccumulated) center would be (60, 50) instead of (1060, 50),
    // flipping the dominant axis from horizontal to vertical.
    const scene = emit(
      doc([
        box({ id: "outer", x: 0, y: 100, w: 100, h: 60 }),
        frame({
          id: "f",
          x: 1000,
          y: 0,
          w: 300,
          h: 100,
          children: [box({ id: "inner", x: 10, y: 20, w: 100, h: 60 })],
        }),
        edge({ id: "e1", from: "outer", to: "inner" }),
      ]),
    );

    const start = scene.store["binding:e1-start"];
    const end = scene.store["binding:e1-end"];
    expect(
      (start?.props as { normalizedAnchor: { x: number; y: number } })
        .normalizedAnchor,
    ).toEqual({ x: 1, y: 0.5 });
    expect(
      (end?.props as { normalizedAnchor: { x: number; y: number } })
        .normalizedAnchor,
    ).toEqual({ x: 0, y: 0.5 });
  });

  it("falls back to centre attach for a terminal whose rect has zero width", () => {
    const scene = emit(
      doc([
        box({ id: "a", x: 0, y: 0, w: 0, h: 60 }),
        box({ id: "b", x: 200, y: 0, w: 120, h: 60 }),
        edge({ id: "e1", from: "a", to: "b" }),
      ]),
    );

    const start = scene.store["binding:e1-start"];
    const end = scene.store["binding:e1-end"];
    expect(
      (start?.props as { normalizedAnchor: { x: number; y: number } })
        .normalizedAnchor,
    ).toEqual({ x: 0.5, y: 0.5 });
    expect((start?.props as { isPrecise: boolean }).isPrecise).toBe(false);
    // b's own rect is well-formed, so it still gets a precise side anchor.
    expect(
      (end?.props as { normalizedAnchor: { x: number; y: number } })
        .normalizedAnchor,
    ).toEqual({ x: 0, y: 0.5 });
    expect((end?.props as { isPrecise: boolean }).isPrecise).toBe(true);
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

  it("falls back to arc + centre for every edge in a fan-shaped container (hub with four targets)", () => {
    const scene = emit(
      doc([
        box({ id: "h", x: 200, y: 200, w: 80, h: 40 }),
        box({ id: "t1", x: 0, y: 0, w: 80, h: 40 }),
        box({ id: "t2", x: 400, y: 0, w: 80, h: 40 }),
        box({ id: "t3", x: 0, y: 400, w: 80, h: 40 }),
        box({ id: "t4", x: 400, y: 400, w: 80, h: 40 }),
        edge({ id: "h-t1", from: "h", to: "t1" }),
        edge({ id: "h-t2", from: "h", to: "t2" }),
        edge({ id: "h-t3", from: "h", to: "t3" }),
        edge({ id: "h-t4", from: "h", to: "t4" }),
        edge({ id: "t1-t2", from: "t1", to: "t2" }),
      ]),
    );

    for (const id of ["h-t1", "h-t2", "h-t3", "h-t4", "t1-t2"]) {
      expect((scene.store[`shape:${id}`]?.props as Record<string, unknown>).kind).toBe("arc");
      const start = scene.store[`binding:${id}-start`];
      expect((start?.props as { normalizedAnchor: { x: number; y: number } }).normalizedAnchor).toEqual({
        x: 0.5,
        y: 0.5,
      });
      expect((start?.props as { isPrecise: boolean }).isPrecise).toBe(false);
    }
  });

  it("keeps elbow + side anchors for a hub with three targets", () => {
    const scene = emit(
      doc([
        box({ id: "h", x: 200, y: 200, w: 80, h: 40 }),
        box({ id: "t1", x: 0, y: 0, w: 80, h: 40 }),
        box({ id: "t2", x: 400, y: 0, w: 80, h: 40 }),
        box({ id: "t3", x: 0, y: 400, w: 80, h: 40 }),
        edge({ id: "h-t1", from: "h", to: "t1" }),
        edge({ id: "h-t2", from: "h", to: "t2" }),
        edge({ id: "h-t3", from: "h", to: "t3" }),
      ]),
    );

    for (const id of ["h-t1", "h-t2", "h-t3"]) {
      expect((scene.store[`shape:${id}`]?.props as Record<string, unknown>).kind).toBe("elbow");
      const start = scene.store[`binding:${id}-start`];
      expect((start?.props as { isPrecise: boolean }).isPrecise).toBe(true);
    }
  });

  it("dedupes five parallel child-to-child edges between two frames to out-degree 1 (stays elbow)", () => {
    const scene = emit(
      doc([
        frame({
          id: "ports",
          x: 0,
          y: 0,
          w: 200,
          h: 500,
          children: [
            box({ id: "p1", x: 10, y: 10, w: 80, h: 40 }),
            box({ id: "p2", x: 10, y: 100, w: 80, h: 40 }),
            box({ id: "p3", x: 10, y: 190, w: 80, h: 40 }),
            box({ id: "p4", x: 10, y: 280, w: 80, h: 40 }),
            box({ id: "p5", x: 10, y: 370, w: 80, h: 40 }),
          ],
        }),
        frame({
          id: "adapters",
          x: 400,
          y: 0,
          w: 200,
          h: 100,
          children: [box({ id: "adapter", x: 10, y: 10, w: 80, h: 40 })],
        }),
        edge({ id: "p1-a", from: "p1", to: "adapter" }),
        edge({ id: "p2-a", from: "p2", to: "adapter" }),
        edge({ id: "p3-a", from: "p3", to: "adapter" }),
        edge({ id: "p4-a", from: "p4", to: "adapter" }),
        edge({ id: "p5-a", from: "p5", to: "adapter" }),
      ]),
    );

    for (const id of ["p1-a", "p2-a", "p3-a", "p4-a", "p5-a"]) {
      expect((scene.store[`shape:${id}`]?.props as Record<string, unknown>).kind).toBe("elbow");
    }
  });

  it("gates fan-shapedness per owning container: a fan-shaped nested frame doesn't fan out its non-fan parent", () => {
    const scene = emit(
      doc([
        frame({
          id: "F",
          x: 0,
          y: 0,
          w: 500,
          h: 500,
          children: [
            box({ id: "h2", x: 200, y: 200, w: 80, h: 40 }),
            box({ id: "t1", x: 0, y: 0, w: 80, h: 40 }),
            box({ id: "t2", x: 400, y: 0, w: 80, h: 40 }),
            box({ id: "t3", x: 0, y: 400, w: 80, h: 40 }),
            box({ id: "t4", x: 400, y: 400, w: 80, h: 40 }),
            edge({ id: "h2-t1", from: "h2", to: "t1" }),
            edge({ id: "h2-t2", from: "h2", to: "t2" }),
            edge({ id: "h2-t3", from: "h2", to: "t3" }),
            edge({ id: "h2-t4", from: "h2", to: "t4" }),
          ],
        }),
        box({ id: "x", x: 700, y: 0, w: 80, h: 40 }),
        edge({ id: "f-x", from: "F", to: "x" }),
      ]),
    );

    for (const id of ["h2-t1", "h2-t2", "h2-t3", "h2-t4"]) {
      expect((scene.store[`shape:${id}`]?.props as Record<string, unknown>).kind).toBe("arc");
    }
    expect((scene.store["shape:f-x"]?.props as Record<string, unknown>).kind).toBe("elbow");
    const start = scene.store["binding:f-x-start"];
    expect((start?.props as { isPrecise: boolean }).isPrecise).toBe(true);
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
