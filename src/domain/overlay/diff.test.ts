import { describe, expect, it } from "vitest";

import {
  arrowBinding,
  arrowShape,
  boxShape,
  documentRecord,
  pageRecord,
  sceneJson,
} from "../../contracts/builders.js";
import type { SceneJSON } from "../../contracts/scene-json.js";

import { applyOverlay } from "./apply.js";
import { diffScenes } from "./diff.js";
import { sceneHash } from "./hash.js";

/** The load-bearing property: replaying a diff against the scene it was
 *  diffed from reproduces the scene it was diffed against. */
function assertRoundTrip(base: SceneJSON, current: SceneJSON): void {
  const overlay = { v: 1, basedOn: sceneHash(base), entries: diffScenes(base, current) };
  const { scene, diagnostics } = applyOverlay(overlay, base);
  expect(diagnostics).toEqual([]);
  expect(scene).toEqual(current);
}

describe("diffScenes", () => {
  it("round-trips a moved box", () => {
    const base = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({ id: "shape:a", x: 0, y: 0, w: 100, h: 50 }),
    ]);
    const current = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({ id: "shape:a", x: 50, y: 60, w: 120, h: 70, rotation: 0.5 }),
    ]);
    const entries = diffScenes(base, current);
    expect(entries["shape:a"]).toEqual({
      moved: { x: 50, y: 60, rotation: 0.5, w: 120, h: 70 },
    });
    assertRoundTrip(base, current);
  });

  it("round-trips a restyled box", () => {
    const base = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({ id: "shape:a", x: 0, y: 0, w: 100, h: 50 }),
    ]);
    const current = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({ id: "shape:a", x: 0, y: 0, w: 100, h: 50, color: "red", fill: "solid" }),
    ]);
    const entries = diffScenes(base, current);
    expect(entries["shape:a"]).toEqual({ restyled: { color: "red", fill: "solid" } });
    assertRoundTrip(base, current);
  });

  it("round-trips an opacity change", () => {
    const base = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({ id: "shape:a", x: 0, y: 0, w: 100, h: 50 }),
    ]);
    const current = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({ id: "shape:a", x: 0, y: 0, w: 100, h: 50, opacity: 0.4 }),
    ]);
    const entries = diffScenes(base, current);
    expect(entries["shape:a"]).toEqual({ restyled: { opacity: 0.4 } });
    assertRoundTrip(base, current);
  });

  it("round-trips a relabelled box as plain text", () => {
    const base = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({ id: "shape:a", x: 0, y: 0, w: 100, h: 50, text: "old" }),
    ]);
    const current = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({ id: "shape:a", x: 0, y: 0, w: 100, h: 50, text: "new\nlabel" }),
    ]);
    const entries = diffScenes(base, current);
    expect(entries["shape:a"]).toEqual({ relabelled: "new\nlabel" });
    assertRoundTrip(base, current);
  });

  it("round-trips a relabelled arrow", () => {
    const base = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      arrowShape({ id: "shape:e", x: 0, y: 0, text: "old" }),
    ]);
    const current = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      arrowShape({ id: "shape:e", x: 0, y: 0, text: "new" }),
    ]);
    const entries = diffScenes(base, current);
    expect(entries["shape:e"]).toEqual({ relabelled: "new" });
    assertRoundTrip(base, current);
  });

  it("round-trips a richText value that plain text cannot re-derive, verbatim into restyled", () => {
    const base = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({ id: "shape:a", x: 0, y: 0, w: 100, h: 50, text: "old" }),
    ]);
    const current = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({ id: "shape:a", x: 0, y: 0, w: 100, h: 50, text: "old" }),
    ]);
    // Simulate a richText doc with structure the plain-text extractor cannot
    // rebuild via `richText()` (a mark on the text node).
    const weirdRichText = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "bold", marks: [{ type: "bold" }] }],
        },
      ],
    };
    (current.store["shape:a"]!.props as { richText: unknown }).richText = weirdRichText;
    const entries = diffScenes(base, current);
    expect(entries["shape:a"]).toEqual({ restyled: { richText: weirdRichText } });
    assertRoundTrip(base, current);
  });

  it("round-trips an added shape", () => {
    const base = sceneJson([documentRecord(), pageRecord({ id: "page:main" })]);
    const newBox = boxShape({ id: "shape:new", x: 5, y: 5, w: 10, h: 10, text: "new" });
    const current = sceneJson([documentRecord(), pageRecord({ id: "page:main" }), newBox]);
    const entries = diffScenes(base, current);
    expect(entries["shape:new"]).toEqual({ added: newBox });
    assertRoundTrip(base, current);
  });

  it("round-trips a deleted box, with its arrow and bindings also gone from current", () => {
    const base = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({ id: "shape:a", x: 0, y: 0, w: 100, h: 50 }),
      boxShape({ id: "shape:b", x: 200, y: 0, w: 100, h: 50 }),
      arrowShape({ id: "shape:e", x: 0, y: 0 }),
      arrowBinding({
        id: "binding:start",
        arrowId: "shape:e",
        shapeId: "shape:a",
        terminal: "start",
      }),
      arrowBinding({ id: "binding:end", arrowId: "shape:e", shapeId: "shape:b", terminal: "end" }),
    ]);
    const current = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({ id: "shape:b", x: 200, y: 0, w: 100, h: 50 }),
    ]);
    const entries = diffScenes(base, current);
    expect(entries["shape:a"]).toEqual({ deleted: true });
    expect(entries["shape:e"]).toEqual({ deleted: true });
    expect(entries["binding:start"]).toEqual({ deleted: true });
    expect(entries["binding:end"]).toEqual({ deleted: true });
    expect(entries["shape:b"]).toBeUndefined();
    assertRoundTrip(base, current);
  });

  describe("rebinding an arrowhead", () => {
    /** `shape:e` runs a -> b, both terminals bound the way emit writes them. */
    function boundScene(): SceneJSON {
      return sceneJson([
        documentRecord(),
        pageRecord({ id: "page:main" }),
        boxShape({ id: "shape:a", x: 0, y: 0, w: 100, h: 50 }),
        boxShape({ id: "shape:b", x: 200, y: 0, w: 100, h: 50 }),
        boxShape({ id: "shape:c", x: 400, y: 0, w: 100, h: 50 }),
        arrowShape({ id: "shape:e", x: 0, y: 0 }),
        arrowBinding({
          id: "binding:e-start",
          arrowId: "shape:e",
          shapeId: "shape:a",
          terminal: "start",
          normalizedAnchor: { x: 1, y: 0.5 },
          isPrecise: true,
        }),
        arrowBinding({
          id: "binding:e-end",
          arrowId: "shape:e",
          shapeId: "shape:b",
          terminal: "end",
          normalizedAnchor: { x: 0, y: 0.5 },
          isPrecise: true,
        }),
      ]);
    }

    /**
     * What tldraw leaves behind after the drag: the old binding gone, a new one
     * under an id of its own, and the arrow's now-dead `end` point parked
     * wherever the pointer was let go.
     */
    function afterDropping(
      onto: string,
      anchor: { x: number; y: number },
      freePoint = { x: 309.76, y: 973.64 },
    ): SceneJSON {
      const scene = boundScene();
      delete scene.store["binding:e-end"];
      scene.store["binding:UT-iFTTgCkD2lT0T7m51Y"] = arrowBinding({
        id: "binding:UT-iFTTgCkD2lT0T7m51Y",
        arrowId: "shape:e",
        shapeId: onto,
        terminal: "end",
        normalizedAnchor: anchor,
        isPrecise: true,
      });
      (scene.store["shape:e"]!.props as { end: unknown }).end = freePoint;
      return scene;
    }

    it("is one entry on the compiled binding, not a delete plus an add", () => {
      const base = boundScene();
      const current = afterDropping("shape:c", { x: 0, y: 0.5 });
      const entries = diffScenes(base, current);

      expect(entries).toEqual({
        "binding:e-end": {
          rebound: {
            toId: "shape:c",
            props: {
              terminal: "end",
              normalizedAnchor: { x: 0, y: 0.5 },
              isPrecise: true,
              isExact: false,
              snap: "none",
            },
          },
        },
      });
    });

    it("reproduces the canvas, under the binding id the source named", () => {
      const base = boundScene();
      const current = afterDropping("shape:c", { x: 0, y: 0.5 });
      const overlay = { v: 1, basedOn: sceneHash(base), entries: diffScenes(base, current) };
      const { scene, diagnostics } = applyOverlay(overlay, base);

      expect(diagnostics).toEqual([]);
      // Not `toEqual(current)`: the replayed scene keeps `binding:e-end` rather
      // than tldraw's random id, and leaves the dead free point alone. Both
      // differences are deliberate - the binding stays matchable to the edge,
      // and a bound terminal ignores the point.
      expect(scene.store["binding:UT-iFTTgCkD2lT0T7m51Y"]).toBeUndefined();
      expect(scene.store["binding:e-end"]).toEqual({
        ...current.store["binding:UT-iFTTgCkD2lT0T7m51Y"],
        id: "binding:e-end",
      });
    });

    it("says nothing at all when the terminal lands back where it started", () => {
      const base = boundScene();
      const current = afterDropping("shape:b", { x: 0, y: 0.5 });
      expect(diffScenes(base, current)).toEqual({});
    });

    it("still reports a delete, and a live free point, when the terminal is dropped on empty canvas", () => {
      const base = boundScene();
      const current = boundScene();
      delete current.store["binding:e-end"];
      (current.store["shape:e"]!.props as { end: unknown }).end = { x: 309.76, y: 973.64 };
      const entries = diffScenes(base, current);

      expect(entries["binding:e-end"]).toEqual({ deleted: true });
      expect(entries["shape:e"]).toEqual({ restyled: { end: { x: 309.76, y: 973.64 } } });
      assertRoundTrip(base, current);
    });
  });

  it("round-trips a record with several ops at once", () => {
    const base = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({ id: "shape:a", x: 0, y: 0, w: 100, h: 50, text: "old", opacity: 1 }),
    ]);
    const current = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({
        id: "shape:a",
        x: 40,
        y: 10,
        w: 100,
        h: 50,
        text: "new",
        color: "red",
        opacity: 0.7,
      }),
    ]);
    const entries = diffScenes(base, current);
    expect(entries["shape:a"]).toEqual({
      moved: { x: 40, y: 10 },
      relabelled: "new",
      restyled: { color: "red", opacity: 0.7 },
    });
    assertRoundTrip(base, current);
  });

  it("emits no entry for an unchanged record", () => {
    const base = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({ id: "shape:a", x: 0, y: 0, w: 100, h: 50 }),
    ]);
    const current = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({ id: "shape:a", x: 0, y: 0, w: 100, h: 50 }),
    ]);
    expect(diffScenes(base, current)).toEqual({});
  });
});
