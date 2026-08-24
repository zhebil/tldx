import { describe, expect, it } from "vitest";

import {
  arrowBinding,
  arrowShape,
  boxShape,
  documentRecord,
  frameShape,
  pageRecord,
  richText,
  sceneJson,
} from "../../contracts/builders.js";
import type { Overlay } from "../../contracts/overlay.js";
import { emptyOverlay } from "../../contracts/overlay.js";
import type { SceneJSON } from "../../contracts/scene-json.js";

import { applyOverlay } from "./apply.js";

function baseScene(): SceneJSON {
  return sceneJson([
    documentRecord(),
    pageRecord({ id: "page:main" }),
    boxShape({ id: "shape:checkout", x: 0, y: 0, w: 100, h: 50, text: "Checkout" }),
    boxShape({ id: "shape:pay", x: 200, y: 0, w: 100, h: 50, text: "Pay" }),
    frameShape({ id: "shape:web", x: 0, y: 100, w: 400, h: 200 }),
    boxShape({
      id: "shape:child",
      x: 10,
      y: 10,
      w: 50,
      h: 30,
      parentId: "shape:web",
      text: "Child",
    }),
    arrowShape({ id: "shape:edge1", x: 0, y: 0 }),
    arrowBinding({
      id: "binding:edge1-start",
      arrowId: "shape:edge1",
      shapeId: "shape:checkout",
      terminal: "start",
    }),
    arrowBinding({
      id: "binding:edge1-end",
      arrowId: "shape:edge1",
      shapeId: "shape:pay",
      terminal: "end",
    }),
  ]);
}

function overlayWith(entries: Overlay["entries"]): Overlay {
  return { ...emptyOverlay("hash"), entries };
}

describe("applyOverlay", () => {
  it("applies moved: top-level fields plus props.w/h", () => {
    const scene = baseScene();
    const overlay = overlayWith({
      "shape:checkout": {
        moved: { x: 320, y: 96, rotation: 1, parentId: "shape:web", index: "a3", w: 220, h: 96 },
      },
    });
    const { scene: out, diagnostics } = applyOverlay(overlay, scene);
    const shape = out.store["shape:checkout"];
    expect(diagnostics).toEqual([]);
    expect(shape?.x).toBe(320);
    expect(shape?.y).toBe(96);
    expect(shape?.rotation).toBe(1);
    expect(shape?.parentId).toBe("shape:web");
    expect(shape?.index).toBe("a3");
    expect((shape!.props as { w: number }).w).toBe(220);
    expect((shape!.props as { h: number }).h).toBe(96);
  });

  it("moved only writes the keys present in the placement", () => {
    const scene = baseScene();
    const overlay = overlayWith({ "shape:checkout": { moved: { x: 999 } } });
    const { scene: out } = applyOverlay(overlay, scene);
    const shape = out.store["shape:checkout"];
    expect(shape?.x).toBe(999);
    expect(shape?.y).toBe(0);
  });

  it("applies restyled: RESTYLE_RECORD_FIELDS on the record, everything else in props", () => {
    const scene = baseScene();
    const overlay = overlayWith({
      "shape:pay": { restyled: { opacity: 0.5, color: "red", fill: "solid" } },
    });
    const { scene: out, diagnostics } = applyOverlay(overlay, scene);
    const shape = out.store["shape:pay"];
    expect(diagnostics).toEqual([]);
    expect(shape?.opacity).toBe(0.5);
    expect((shape!.props as { color: string }).color).toBe("red");
    expect((shape!.props as { fill: string }).fill).toBe("solid");
  });

  it("applies relabelled to props.richText for a box", () => {
    const scene = baseScene();
    const overlay = overlayWith({ "shape:checkout": { relabelled: "Ship it" } });
    const { scene: out, diagnostics } = applyOverlay(overlay, scene);
    expect(diagnostics).toEqual([]);
    expect((out.store["shape:checkout"]!.props as { richText: unknown }).richText).toEqual(
      richText("Ship it"),
    );
  });

  it("applies relabelled to props.text for an arrow", () => {
    const scene = baseScene();
    const overlay = overlayWith({ "shape:edge1": { relabelled: "go" } });
    const { scene: out, diagnostics } = applyOverlay(overlay, scene);
    expect(diagnostics).toEqual([]);
    expect((out.store["shape:edge1"]!.props as { text: string }).text).toBe("go");
  });

  it("emits overlay/unlabellable and skips when the record has neither text nor richText", () => {
    const scene = baseScene();
    const overlay = overlayWith({ "shape:web": { relabelled: "nope" } });
    const { diagnostics } = applyOverlay(overlay, scene);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("overlay/unlabellable");
    expect(diagnostics[0]?.severity).toBe("warning");
  });

  it("applies added: merges a verbatim record", () => {
    const scene = baseScene();
    const added = boxShape({ id: "shape:new", x: 5, y: 5, w: 10, h: 10, text: "New" });
    const overlay = overlayWith({ "shape:new": { added } });
    const { scene: out, diagnostics } = applyOverlay(overlay, scene);
    expect(diagnostics).toEqual([]);
    expect(out.store["shape:new"]).toEqual(added);
  });

  it("emits overlay/add-collision and skips when the id already exists in the compiled store", () => {
    const scene = baseScene();
    const collider = boxShape({ id: "shape:checkout", x: 999, y: 999, w: 1, h: 1 });
    const overlay = overlayWith({ "shape:checkout": { added: collider } });
    const { scene: out, diagnostics } = applyOverlay(overlay, scene);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("overlay/add-collision");
    expect(diagnostics[0]?.severity).toBe("warning");
    expect(out.store["shape:checkout"]?.x).toBe(0);
  });

  it("applies deleted", () => {
    const scene = baseScene();
    const overlay = overlayWith({ "shape:pay": { deleted: true } });
    const { scene: out, diagnostics } = applyOverlay(overlay, scene);
    expect(diagnostics).toEqual([]);
    expect(out.store["shape:pay"]).toBeUndefined();
  });

  it("emits overlay/unresolved-id, naming the id and its ops, for an entry that resolves to nothing", () => {
    const scene = baseScene();
    const overlay = overlayWith({
      "shape:ghost": { moved: { x: 1 }, restyled: { color: "red" } },
    });
    const { diagnostics } = applyOverlay(overlay, scene);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("overlay/unresolved-id");
    expect(diagnostics[0]?.severity).toBe("warning");
    expect(diagnostics[0]?.message).toContain("shape:ghost");
    expect(diagnostics[0]?.message).toContain("moved");
    expect(diagnostics[0]?.message).toContain("restyled");
  });

  it("a deleted entry against an already-absent id is silent, not unresolved", () => {
    const scene = baseScene();
    const overlay = overlayWith({ "shape:ghost": { deleted: true } });
    const { diagnostics } = applyOverlay(overlay, scene);
    expect(diagnostics).toEqual([]);
  });

  it("applies several ops on one entry", () => {
    const scene = baseScene();
    const overlay = overlayWith({
      "shape:checkout": {
        moved: { x: 50 },
        restyled: { color: "green" },
        relabelled: "Renamed",
      },
    });
    const { scene: out, diagnostics } = applyOverlay(overlay, scene);
    expect(diagnostics).toEqual([]);
    const shape = out.store["shape:checkout"];
    expect(shape?.x).toBe(50);
    expect((shape!.props as { color: string }).color).toBe("green");
    expect((shape!.props as { richText: unknown }).richText).toEqual(richText("Renamed"));
  });

  it("cascades delete: shape removal drags down its bindings and the bound arrow", () => {
    const scene = baseScene();
    const overlay = overlayWith({ "shape:checkout": { deleted: true } });
    const { scene: out } = applyOverlay(overlay, scene);
    expect(out.store["shape:checkout"]).toBeUndefined();
    expect(out.store["binding:edge1-start"]).toBeUndefined();
    expect(out.store["binding:edge1-end"]).toBeUndefined();
    expect(out.store["shape:edge1"]).toBeUndefined();
    // The unrelated shape at the arrow's other end is untouched.
    expect(out.store["shape:pay"]).toBeDefined();
  });

  it("cascades delete: removing a frame removes its children", () => {
    const scene = baseScene();
    const overlay = overlayWith({ "shape:web": { deleted: true } });
    const { scene: out } = applyOverlay(overlay, scene);
    expect(out.store["shape:web"]).toBeUndefined();
    expect(out.store["shape:child"]).toBeUndefined();
  });

  it("does not mutate its inputs", () => {
    const scene = baseScene();
    const sceneSnapshot = JSON.parse(JSON.stringify(scene));
    const overlay = overlayWith({
      "shape:checkout": { moved: { x: 1 }, restyled: { color: "red" }, relabelled: "x" },
      "shape:pay": { deleted: true },
      "shape:new": { added: boxShape({ id: "shape:new", x: 0, y: 0, w: 1, h: 1 }) },
    });
    const overlaySnapshot = JSON.parse(JSON.stringify(overlay));
    applyOverlay(overlay, scene);
    expect(scene).toEqual(sceneSnapshot);
    expect(overlay).toEqual(overlaySnapshot);
  });

  it("ignores an added session record, warning instead of putting it in the scene", () => {
    // Sidecars written by an older viewer carry these; the scene they poison
    // is one no tldraw document store will load.
    const overlay = overlayWith({
      "user:jGkov": { added: { id: "user:jGkov", typeName: "user" } },
    });

    const { scene, diagnostics } = applyOverlay(overlay, baseScene());

    expect(scene.store["user:jGkov"]).toBeUndefined();
    expect(diagnostics.map((d) => d.code)).toEqual(["overlay/not-a-document-record"]);
  });

  it("is idempotent: applying the same overlay to its own result is a no-op", () => {
    const scene = baseScene();
    const overlay = overlayWith({
      "shape:checkout": { moved: { x: 1, y: 2 }, restyled: { color: "red" }, relabelled: "x" },
      "shape:pay": { deleted: true },
      "shape:new": { added: boxShape({ id: "shape:new", x: 0, y: 0, w: 1, h: 1 }) },
    });
    const first = applyOverlay(overlay, scene);
    const second = applyOverlay(overlay, first.scene);
    expect(second.scene).toEqual(first.scene);
  });
});
