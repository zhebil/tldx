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

  it("names the page after the doc title, else the fallback, else tldx", () => {
    expect(emit({ ...doc([]), title: "Kernel" }, "kernel").store["page:main"]?.name).toBe("Kernel");
    expect(emit(doc([]), "kernel").store["page:main"]?.name).toBe("kernel");
    expect(emit(doc([])).store["page:main"]?.name).toBe("tldx");
  });

  it("uses the pinned schema from contracts/builders", () => {
    // The schema is opaque here; this only asserts emit doesn't synthesize
    // one off-band.
    const scene = emit(doc([]));
    expect(scene.schema.schemaVersion).toBe(2);
    expect(scene.schema.sequences["com.tldraw.store"]).toBeGreaterThan(0);
  });

  it("emits a box as a geo shape parented to the page, with label as rich text", () => {
    const scene = emit(doc([box({ id: "login", x: 10, y: 20, w: 160, h: 80, label: "Login" })]));
    const shape = scene.store["shape:login"];
    expect(shape).toBeDefined();
    expect(shape?.typeName).toBe("shape");
    expect(shape?.type).toBe("geo");
    expect(shape?.parentId).toBe("page:main");
    expect(shape?.x).toBe(10);
    expect(shape?.y).toBe(20);
    const props = shape!.props as { w: number; h: number; richText: unknown };
    expect(props.w).toBe(160);
    expect(props.h).toBe(80);
    expect(props.richText).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Login" }] }],
    });
  });

  it("emits a label-less box with empty rich text rather than dropping the field", () => {
    const scene = emit(doc([box({ id: "blank", x: 0, y: 0, w: 80, h: 40 })]));
    const props = scene.store["shape:blank"]!.props as { richText: unknown };
    expect(props.richText).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });

  it("emits a <Text> box (box.text) as a borderless text shape, not geo", () => {
    const scene = emit(
      doc([box({ id: "heading", x: 10, y: 20, w: 240, h: 30, label: "Phase 1", text: true })]),
    );
    const shape = scene.store["shape:heading"];
    expect(shape?.type).toBe("text");
    expect(shape?.parentId).toBe("page:main");
    expect(shape?.x).toBe(10);
    expect(shape?.y).toBe(20);
    const props = shape!.props as Record<string, unknown>;
    // w is the fixed wrap budget layout already computed; there is no h at
    // all on the wire - a text shape's height is derived from content.
    expect(props.w).toBe(240);
    expect(props.h).toBeUndefined();
    expect(props.autoSize).toBe(false);
    expect(props.richText).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Phase 1" }] }],
    });
  });

  it("emits a label-less <Text> box with empty rich text rather than dropping the field", () => {
    const scene = emit(doc([box({ id: "blank", x: 0, y: 0, w: 80, h: 20, text: true })]));
    const props = scene.store["shape:blank"]!.props as { richText: unknown };
    expect(props.richText).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("defaults <Text> color/textAlign/font/size to black/start/draw/m", () => {
    const scene = emit(doc([box({ id: "t", x: 0, y: 0, w: 80, h: 20, text: true })]));
    const props = scene.store["shape:t"]!.props as Record<string, unknown>;
    expect(props.color).toBe("black");
    expect(props.textAlign).toBe("start");
    expect(props.font).toBe("draw");
    expect(props.size).toBe("m");
  });

  it("passes <Text> color/textAlign/font/size through when set", () => {
    const scene = emit(
      doc([
        box({
          id: "t",
          x: 0,
          y: 0,
          w: 80,
          h: 20,
          text: true,
          color: "blue",
          textAlign: "end",
          font: "mono",
          size: "xl",
        }),
      ]),
    );
    const props = scene.store["shape:t"]!.props as Record<string, unknown>;
    expect(props.color).toBe("blue");
    expect(props.textAlign).toBe("end");
    expect(props.font).toBe("mono");
    expect(props.size).toBe("xl");
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

  it("emits no shape for a <Group>; its children fold the group's origin into their own x/y and parent to the group's parent", () => {
    const scene = emit(
      doc([
        frame({
          id: "g",
          x: 40,
          y: 40,
          w: 400,
          h: 200,
          group: true,
          children: [
            box({ id: "a", x: 20, y: 60, w: 120, h: 60, label: "A" }),
            box({ id: "b", x: 180, y: 60, w: 120, h: 60, label: "B" }),
          ],
        }),
      ]),
    );

    expect(scene.store["shape:g"]).toBeUndefined();
    expect(scene.store["shape:a"]?.parentId).toBe("page:main");
    expect(scene.store["shape:b"]?.parentId).toBe("page:main");
    // group origin (40, 40) folded into each child's frame-relative x/y.
    expect(scene.store["shape:a"]?.x).toBe(60);
    expect(scene.store["shape:a"]?.y).toBe(100);
    expect(scene.store["shape:b"]?.x).toBe(220);
    expect(scene.store["shape:b"]?.y).toBe(100);
  });

  it("a nested frame inside a <Group> shifts by the group's origin but keeps its own children relative to itself", () => {
    const scene = emit(
      doc([
        frame({
          id: "g",
          x: 40,
          y: 40,
          w: 400,
          h: 200,
          group: true,
          children: [
            frame({
              id: "inner",
              x: 20,
              y: 20,
              w: 200,
              h: 150,
              name: "Inner",
              children: [box({ id: "a", x: 10, y: 10, w: 100, h: 50, label: "A" })],
            }),
          ],
        }),
      ]),
    );

    expect(scene.store["shape:inner"]?.parentId).toBe("page:main");
    expect(scene.store["shape:inner"]?.x).toBe(60);
    expect(scene.store["shape:inner"]?.y).toBe(60);
    expect(scene.store["shape:a"]?.parentId).toBe("shape:inner");
    expect(scene.store["shape:a"]?.x).toBe(10);
    expect(scene.store["shape:a"]?.y).toBe(10);
  });

  it("a <Group> nested inside a <Group> folds both origins into its children", () => {
    const scene = emit(
      doc([
        frame({
          id: "outer",
          x: 10,
          y: 10,
          w: 400,
          h: 400,
          group: true,
          children: [
            frame({
              id: "inner",
              x: 5,
              y: 5,
              w: 200,
              h: 200,
              group: true,
              children: [box({ id: "a", x: 1, y: 1, w: 50, h: 50, label: "A" })],
            }),
          ],
        }),
      ]),
    );

    expect(scene.store["shape:outer"]).toBeUndefined();
    expect(scene.store["shape:inner"]).toBeUndefined();
    expect(scene.store["shape:a"]?.parentId).toBe("page:main");
    expect(scene.store["shape:a"]?.x).toBe(16);
    expect(scene.store["shape:a"]?.y).toBe(16);
  });

  it("emits no shape for an unnamed frame (D2: a declined name is not a placeholder caption), same as <Group>", () => {
    const scene = emit(
      doc([
        frame({
          id: "row",
          x: 40,
          y: 40,
          w: 400,
          h: 200,
          children: [
            box({ id: "a", x: 20, y: 60, w: 120, h: 60, label: "A" }),
            box({ id: "b", x: 180, y: 60, w: 120, h: 60, label: "B" }),
          ],
        }),
      ]),
    );

    expect(scene.store["shape:row"]).toBeUndefined();
    expect(scene.store["shape:a"]?.parentId).toBe("page:main");
    expect(scene.store["shape:a"]?.x).toBe(60);
    expect(scene.store["shape:a"]?.y).toBe(100);
  });

  it("still emits a frame shape (border + name) for a named frame - unaffected by D2", () => {
    const scene = emit(
      doc([
        frame({
          id: "kernel",
          x: 40,
          y: 40,
          w: 400,
          h: 200,
          name: "Kernel",
          children: [box({ id: "a", x: 20, y: 60, w: 120, h: 60, label: "A" })],
        }),
      ]),
    );

    expect(scene.store["shape:kernel"]).toBeDefined();
    expect(scene.store["shape:kernel"]?.type).toBe("frame");
    expect((scene.store["shape:kernel"]!.props as Record<string, unknown>).name).toBe("Kernel");
    expect(scene.store["shape:a"]?.parentId).toBe("shape:kernel");
  });

  it("emits a sticky as a note shape and drops its IR w/h", () => {
    const scene = emit(
      doc([
        note({
          id: "n1",
          text: "remember this",
          x: 5,
          y: 6,
          w: 200,
          h: 80,
          sticky: true,
        }),
      ]),
    );
    const shape = scene.store["shape:n1"];
    expect(shape?.type).toBe("note");
    expect(shape?.x).toBe(5);
    expect(shape?.y).toBe(6);
    const props = shape!.props as Record<string, unknown>;
    expect(props.w).toBeUndefined();
    expect(props.h).toBeUndefined();
    expect(props.richText).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "remember this" }] }],
    });
  });

  it("sets sticky growY to the reserved height above tldraw's 200 base, 0 when short", () => {
    const tall = emit(
      doc([note({ id: "n2", text: "long", x: 0, y: 0, w: 200, h: 500, sticky: true })]),
    );
    expect((tall.store["shape:n2"]!.props as Record<string, unknown>).growY).toBe(300);

    const short = emit(
      doc([note({ id: "n3", text: "short", x: 0, y: 0, w: 200, h: 150, sticky: true })]),
    );
    expect((short.store["shape:n3"]!.props as Record<string, unknown>).growY).toBe(0);
  });

  it("emits a non-sticky note IR as a real note shape too (no fake-geo path left)", () => {
    const scene = emit(
      doc([note({ id: "n4", text: "two sentences of context", x: 5, y: 6, w: 240, h: 90 })]),
    );
    const shape = scene.store["shape:n4"];
    expect(shape?.type).toBe("note");
    expect(shape?.x).toBe(5);
    expect(shape?.y).toBe(6);
    const props = shape!.props as Record<string, unknown>;
    expect(props.w).toBeUndefined();
    expect(props.richText).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "two sentences of context" }] },
      ],
    });
  });

  it("emits an edge as an arrow shape plus two bindings, attached face to face", () => {
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
    expect((start!.props as { terminal: string }).terminal).toBe("start");
    expect((end!.props as { terminal: string }).terminal).toBe("end");
    // Two boxes side by side attach on the facing edges, not centres.
    expect(
      (start!.props as { normalizedAnchor: { x: number; y: number } }).normalizedAnchor,
    ).toEqual({
      x: 1,
      y: 0.5,
    });
    expect((end!.props as { normalizedAnchor: { x: number; y: number } }).normalizedAnchor).toEqual(
      {
        x: 0,
        y: 0.5,
      },
    );
  });

  it("gives a same-axis skip edge a non-zero bend", () => {
    const scene = emit(
      doc([
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 150, y: 0, w: 100, h: 50 }),
        box({ id: "c", x: 300, y: 0, w: 100, h: 50 }),
        box({ id: "d", x: 450, y: 0, w: 100, h: 50 }),
        edge({ id: "ad", from: "a", to: "d" }),
      ]),
    );
    const props = scene.store["shape:ad"]!.props as { bend: number };
    expect(props.bend).not.toBe(0);

    const start = scene.store["binding:ad-start"];
    const end = scene.store["binding:ad-end"];
    expect((start!.props as { isPrecise: boolean }).isPrecise).toBe(true);
    expect((end!.props as { isPrecise: boolean }).isPrecise).toBe(true);
    expect((start!.props as { isExact: boolean }).isExact).toBe(true);
    expect((end!.props as { isExact: boolean }).isExact).toBe(true);
    const startAnchor = (start!.props as { normalizedAnchor: { x: number; y: number } })
      .normalizedAnchor;
    const endAnchor = (end!.props as { normalizedAnchor: { x: number; y: number } })
      .normalizedAnchor;
    expect(startAnchor).not.toEqual({ x: 0.5, y: 0.5 });
    expect(endAnchor).not.toEqual({ x: 0.5, y: 0.5 });
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

describe("domain/emit: z-order index", () => {
  it("assigns non-arrow shapes a gapped index per parent, in emit order", () => {
    const scene = emit(
      doc([
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 200, y: 0, w: 100, h: 50 }),
        box({ id: "c", x: 400, y: 0, w: 100, h: 50 }),
      ]),
    );
    expect(scene.store["shape:a"]?.index).toBe("a1");
    expect(scene.store["shape:b"]?.index).toBe("a3");
    expect(scene.store["shape:c"]?.index).toBe("a5");
  });

  it("gives an arrow the slot strictly between its highest-indexed endpoint and the next sibling above", () => {
    const scene = emit(
      doc([
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 200, y: 0, w: 100, h: 50 }),
        box({ id: "c", x: 400, y: 0, w: 100, h: 50 }),
        edge({ id: "ab", from: "a", to: "b" }),
      ]),
    );
    // a=a1, b=a3, c=a5 (siblings); the arrow's highest bound sibling is b
    // (a3), so it must land strictly above a3 and strictly below the next
    // non-arrow sibling, c (a5) - the even slot in between.
    expect(scene.store["shape:ab"]?.index).toBe("a4");
  });

  it("parents an arrow to the common ancestor frame, not the page, when both endpoints live in a named frame", () => {
    const scene = emit(
      doc([
        frame({
          id: "f",
          name: "Container",
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
    expect(scene.store["shape:e"]?.parentId).toBe("shape:f");
    // Above its highest sibling (b) with no non-arrow sibling above it in f.
    const bIndex = scene.store["shape:b"]?.index as string;
    const arrowIndex = scene.store["shape:e"]?.index as string;
    expect(arrowIndex > bIndex).toBe(true);
  });

  it("two arrows bound to the same highest sibling may share an index", () => {
    const scene = emit(
      doc([
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 200, y: 0, w: 100, h: 50 }),
        edge({ id: "e1", from: "a", to: "b" }),
        edge({ id: "e2", from: "a", to: "b" }),
      ]),
    );
    expect(scene.store["shape:e1"]?.index).toBe(scene.store["shape:e2"]?.index);
  });
});

describe("domain/emit: style pass-through", () => {
  it("passes box color/fill/dash through to props, defaulting when absent", () => {
    const scene = emit(
      doc([
        box({
          id: "styled",
          x: 0,
          y: 0,
          w: 100,
          h: 50,
          color: "blue",
          fill: "solid",
          dash: "dashed",
        }),
        box({ id: "plain", x: 0, y: 0, w: 100, h: 50 }),
      ]),
    );
    const styled = scene.store["shape:styled"]!.props as Record<string, unknown>;
    expect(styled.color).toBe("blue");
    expect(styled.fill).toBe("solid");
    expect(styled.dash).toBe("dashed");

    const plain = scene.store["shape:plain"]!.props as Record<string, unknown>;
    expect(plain.color).toBe("black");
    expect(plain.fill).toBe("none");
    expect(plain.dash).toBe("draw");
  });

  it("passes box geo through to props, defaulting to rectangle when absent", () => {
    const scene = emit(
      doc([
        box({ id: "hex", x: 0, y: 0, w: 100, h: 50, geo: "hexagon" }),
        box({ id: "plain", x: 0, y: 0, w: 100, h: 50 }),
      ]),
    );
    const hex = scene.store["shape:hex"]!.props as Record<string, unknown>;
    expect(hex.geo).toBe("hexagon");

    const plain = scene.store["shape:plain"]!.props as Record<string, unknown>;
    expect(plain.geo).toBe("rectangle");
  });

  it("passes frame color through, defaulting to black when absent", () => {
    const scene = emit(
      doc([frame({ id: "f", x: 0, y: 0, w: 100, h: 50, name: "F", color: "green", children: [] })]),
    );
    expect((scene.store["shape:f"]!.props as Record<string, unknown>).color).toBe("green");

    const defaulted = emit(
      doc([frame({ id: "g", x: 0, y: 0, w: 100, h: 50, name: "G", children: [] })]),
    );
    expect((defaulted.store["shape:g"]!.props as Record<string, unknown>).color).toBe("black");
  });

  it("passes sticky color through", () => {
    const scene = emit(
      doc([
        note({ id: "s", text: "hi", x: 0, y: 0, w: 200, h: 200, sticky: true, color: "orange" }),
      ]),
    );
    expect((scene.store["shape:s"]!.props as Record<string, unknown>).color).toBe("orange");
  });

  it("passes edge color/dash/arrowheadStart/arrowheadEnd through, defaulting when absent", () => {
    const scene = emit(
      doc([
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 200, y: 0, w: 100, h: 50 }),
        edge({
          id: "e",
          from: "a",
          to: "b",
          color: "red",
          dash: "dotted",
          arrowheadStart: "square",
          arrowheadEnd: "diamond",
        }),
      ]),
    );
    const props = scene.store["shape:e"]!.props as Record<string, unknown>;
    expect(props.color).toBe("red");
    expect(props.dash).toBe("dotted");
    expect(props.arrowheadStart).toBe("square");
    expect(props.arrowheadEnd).toBe("diamond");

    const defaulted = emit(
      doc([
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 200, y: 0, w: 100, h: 50 }),
        edge({ id: "e2", from: "a", to: "b" }),
      ]),
    );
    const defaultProps = defaulted.store["shape:e2"]!.props as Record<string, unknown>;
    expect(defaultProps.color).toBe("black");
    expect(defaultProps.dash).toBe("draw");
    expect(defaultProps.arrowheadStart).toBe("none");
    expect(defaultProps.arrowheadEnd).toBe("arrow");
  });
});

describe("domain/emit: text align / label color pass-through", () => {
  it("passes box textAlign/verticalAlign/labelColor through, defaulting to middle/middle/black", () => {
    const scene = emit(
      doc([
        box({
          id: "styled",
          x: 0,
          y: 0,
          w: 100,
          h: 50,
          textAlign: "end",
          verticalAlign: "start",
          labelColor: "red",
        }),
        box({ id: "plain", x: 0, y: 0, w: 100, h: 50 }),
      ]),
    );
    const styled = scene.store["shape:styled"]!.props as Record<string, unknown>;
    expect(styled.align).toBe("end");
    expect(styled.verticalAlign).toBe("start");
    expect(styled.labelColor).toBe("red");

    const plain = scene.store["shape:plain"]!.props as Record<string, unknown>;
    expect(plain.align).toBe("middle");
    expect(plain.verticalAlign).toBe("middle");
    expect(plain.labelColor).toBe("black");
  });

  it("passes textAlign/verticalAlign/labelColor through on a note regardless of sticky", () => {
    const scene = emit(
      doc([
        note({
          id: "n",
          text: "hi",
          x: 0,
          y: 0,
          w: 100,
          h: 50,
          textAlign: "start",
          verticalAlign: "end",
          labelColor: "blue",
        }),
        note({
          id: "s",
          text: "hi",
          x: 0,
          y: 0,
          w: 200,
          h: 200,
          sticky: true,
          textAlign: "start",
          verticalAlign: "end",
          labelColor: "blue",
        }),
      ]),
    );
    const nonStickyProps = scene.store["shape:n"]!.props as Record<string, unknown>;
    expect(nonStickyProps.align).toBe("start");
    expect(nonStickyProps.verticalAlign).toBe("end");
    expect(nonStickyProps.labelColor).toBe("blue");

    const stickyProps = scene.store["shape:s"]!.props as Record<string, unknown>;
    expect(stickyProps.align).toBe("start");
    expect(stickyProps.verticalAlign).toBe("end");
    expect(stickyProps.labelColor).toBe("blue");
  });
});

describe("domain/emit: font / size pass-through", () => {
  it("passes box font/size through, defaulting to draw/m", () => {
    const scene = emit(
      doc([
        box({ id: "styled", x: 0, y: 0, w: 100, h: 50, font: "serif", size: "xl" }),
        box({ id: "plain", x: 0, y: 0, w: 100, h: 50 }),
      ]),
    );
    const styled = scene.store["shape:styled"]!.props as Record<string, unknown>;
    expect(styled.font).toBe("serif");
    expect(styled.size).toBe("xl");

    const plain = scene.store["shape:plain"]!.props as Record<string, unknown>;
    expect(plain.font).toBe("draw");
    expect(plain.size).toBe("m");
  });

  it("passes font/size through on a note regardless of sticky, defaulting to draw/m", () => {
    const scene = emit(
      doc([
        note({ id: "n", text: "hi", x: 0, y: 0, w: 100, h: 50, font: "mono", size: "l" }),
        note({
          id: "s",
          text: "hi",
          x: 0,
          y: 0,
          w: 200,
          h: 200,
          sticky: true,
          font: "sans",
          size: "s",
        }),
        note({ id: "s2", text: "hi", x: 0, y: 0, w: 200, h: 200, sticky: true }),
      ]),
    );
    const nonStickyProps = scene.store["shape:n"]!.props as Record<string, unknown>;
    expect(nonStickyProps.font).toBe("mono");
    expect(nonStickyProps.size).toBe("l");

    const stickyProps = scene.store["shape:s"]!.props as Record<string, unknown>;
    expect(stickyProps.font).toBe("sans");
    expect(stickyProps.size).toBe("s");

    const plainSticky = scene.store["shape:s2"]!.props as Record<string, unknown>;
    expect(plainSticky.font).toBe("draw");
    expect(plainSticky.size).toBe("m");
  });
});

describe("domain/emit: arrow labels", () => {
  it("forwards edge label as arrow text", () => {
    const scene = emit(
      doc([
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 200, y: 0, w: 100, h: 50 }),
        edge({ id: "e", from: "a", to: "b", label: "publishes" }),
      ]),
    );
    const props = scene.store["shape:e"]!.props as Record<string, unknown>;
    expect(props.text).toBe("publishes");
  });

  it("emits an empty text when the edge has no label", () => {
    const scene = emit(
      doc([
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 200, y: 0, w: 100, h: 50 }),
        edge({ id: "e", from: "a", to: "b" }),
      ]),
    );
    const props = scene.store["shape:e"]!.props as Record<string, unknown>;
    expect(props.text).toBe("");
  });

  it("passes edge labelColor/font/size through, defaulting to black/draw/m", () => {
    const scene = emit(
      doc([
        box({ id: "a", x: 0, y: 0, w: 100, h: 50 }),
        box({ id: "b", x: 200, y: 0, w: 100, h: 50 }),
        edge({
          id: "styled",
          from: "a",
          to: "b",
          label: "retries",
          labelColor: "red",
          font: "mono",
          size: "xl",
        }),
        edge({ id: "plain", from: "a", to: "b" }),
      ]),
    );
    const styled = scene.store["shape:styled"]!.props as Record<string, unknown>;
    expect(styled.labelColor).toBe("red");
    expect(styled.font).toBe("mono");
    expect(styled.size).toBe("xl");

    const plain = scene.store["shape:plain"]!.props as Record<string, unknown>;
    expect(plain.labelColor).toBe("black");
    expect(plain.font).toBe("draw");
    expect(plain.size).toBe("m");
  });
});

// helpers

const SPAN = { file: "test.tldx", line: 1, column: 1 };

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
  color?: string;
  fill?: string;
  dash?: string;
  geo?: string;
  textAlign?: string;
  verticalAlign?: string;
  labelColor?: string;
  font?: string;
  size?: string;
  text?: boolean;
}): IRBoxPositioned {
  const { label, ...rest } = input;
  return {
    kind: "box",
    idExplicit: true,
    span: SPAN,
    ...rest,
    ...(label === undefined ? {} : { label }),
  } as IRBoxPositioned;
}

function note(input: {
  id: string;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  sticky?: boolean;
  color?: string;
  textAlign?: string;
  verticalAlign?: string;
  labelColor?: string;
  font?: string;
  size?: string;
}): IRNotePositioned {
  return {
    kind: "note",
    idExplicit: false,
    span: SPAN,
    ...input,
  } as IRNotePositioned;
}

function frame(input: {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  name?: string;
  children: IRElementPositioned[];
  color?: string;
  group?: boolean;
}): IRFramePositioned {
  const { name, ...rest } = input;
  return {
    kind: "frame",
    idExplicit: true,
    span: SPAN,
    ...rest,
    ...(name === undefined ? {} : { name }),
  } as IRFramePositioned;
}

function edge(input: {
  id: string;
  from: string;
  to: string;
  color?: string;
  dash?: string;
  arrowheadStart?: string;
  arrowheadEnd?: string;
  label?: string;
  labelColor?: string;
  font?: string;
  size?: string;
}): IREdge {
  return {
    kind: "edge",
    idExplicit: true,
    span: SPAN,
    ...input,
  } as IREdge;
}
