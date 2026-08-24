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
    (current.store["shape:a"]?.props as { richText: unknown }).richText = weirdRichText;
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
      arrowBinding({ id: "binding:start", arrowId: "shape:e", shapeId: "shape:a", terminal: "start" }),
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

  it("round-trips a record with several ops at once", () => {
    const base = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({ id: "shape:a", x: 0, y: 0, w: 100, h: 50, text: "old", opacity: 1 }),
    ]);
    const current = sceneJson([
      documentRecord(),
      pageRecord({ id: "page:main" }),
      boxShape({ id: "shape:a", x: 40, y: 10, w: 100, h: 50, text: "new", color: "red", opacity: 0.7 }),
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
