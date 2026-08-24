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

import { denamespaceScene, namespaceScene, pageSliceOf } from "./multipage.js";

/** A one-diagram scene as `emit` produces it: `page:main`, author-chosen ids. */
function soloScene(label: string): SceneJSON {
  return sceneJson([
    documentRecord(),
    pageRecord({ id: "page:main", name: label }),
    boxShape({ id: "shape:api", x: 0, y: 0, w: 100, h: 60, text: label }),
    boxShape({ id: "shape:db", x: 200, y: 0, w: 100, h: 60, text: "db" }),
    arrowShape({ id: "shape:edge", x: 0, y: 0 }),
    arrowBinding({
      id: "binding:b1",
      arrowId: "shape:edge",
      shapeId: "shape:api",
      terminal: "start",
    }),
    arrowBinding({ id: "binding:b2", arrowId: "shape:edge", shapeId: "shape:db", terminal: "end" }),
  ]);
}

describe("namespaceScene / denamespaceScene", () => {
  it("round-trips a scene through a page key", () => {
    const scene = soloScene("a");
    expect(denamespaceScene(namespaceScene(scene, "3f2a9c11"), "3f2a9c11", scene)).toEqual(scene);
  });

  it("rewrites the page id, shape ids and every reference to them", () => {
    const namespaced = namespaceScene(soloScene("a"), "abc123");

    expect(Object.keys(namespaced.store).sort()).toEqual([
      "binding:abc123_b1",
      "binding:abc123_b2",
      "page:abc123",
      "shape:abc123_api",
      "shape:abc123_db",
      "shape:abc123_edge",
    ]);
    expect(namespaced.store["shape:abc123_api"]?.parentId).toBe("page:abc123");
    expect(namespaced.store["binding:abc123_b1"]?.fromId).toBe("shape:abc123_edge");
    expect(namespaced.store["binding:abc123_b1"]?.toId).toBe("shape:abc123_api");
  });

  it("drops the document singleton and restores it from the base", () => {
    const scene = soloScene("a");
    const namespaced = namespaceScene(scene, "abc123");

    expect(namespaced.store["document:document"]).toBeUndefined();
    expect(denamespaceScene(namespaced, "abc123", scene).store["document:document"]).toEqual(
      scene.store["document:document"],
    );
  });

  it("keeps two diagrams with colliding author ids apart", () => {
    const a = namespaceScene(soloScene("a"), "aaaaaaaa");
    const b = namespaceScene(soloScene("b"), "bbbbbbbb");

    expect(Object.keys(a.store).some((id) => id in b.store)).toBe(false);
  });
});

describe("pageSliceOf", () => {
  it("keeps only the named page's records", () => {
    const a = namespaceScene(soloScene("a"), "aaaaaaaa");
    const b = namespaceScene(soloScene("b"), "bbbbbbbb");
    const merged: SceneJSON = { schema: a.schema, store: { ...a.store, ...b.store } };

    expect(pageSliceOf(merged, "aaaaaaaa")).toEqual(a);
  });

  it("a slice under the wrong key keeps nothing", () => {
    const merged = namespaceScene(soloScene("a"), "aaaaaaaa");

    expect(pageSliceOf(merged, "bbbbbbbb").store).toEqual({});
  });
});

describe("pageSliceOf: membership through the shape tree", () => {
  it("leaves out a session record, which belongs to a tab and not to the diagram", () => {
    const merged = namespaceScene(soloScene("a"), "aaaaaaaa");
    const withSession: SceneJSON = {
      schema: merged.schema,
      store: {
        ...merged.store,
        "user:aaaaaaaa_jGkov": { id: "user:aaaaaaaa_jGkov", typeName: "user" },
      },
    };

    expect(pageSliceOf(withSession, "aaaaaaaa").store["user:aaaaaaaa_jGkov"]).toBeUndefined();
  });

  it("keeps a shape the user drew, whose id tldraw chose and carries no page key", () => {
    const merged = namespaceScene(soloScene("a"), "aaaaaaaa");
    // A user-drawn shape belongs to the page through its parent, not its id.
    const drawn = { id: "shape:x7Kq", typeName: "shape", parentId: "page:aaaaaaaa" };
    const withDrawn: SceneJSON = {
      schema: merged.schema,
      store: { ...merged.store, "shape:x7Kq": drawn },
    };

    expect(pageSliceOf(withDrawn, "aaaaaaaa").store["shape:x7Kq"]).toEqual(drawn);
  });

  it("does not pull in a shape drawn on another page", () => {
    const a = namespaceScene(soloScene("a"), "aaaaaaaa");
    const b = namespaceScene(soloScene("b"), "bbbbbbbb");
    const merged: SceneJSON = {
      schema: a.schema,
      store: {
        ...a.store,
        ...b.store,
        "shape:x7Kq": { id: "shape:x7Kq", typeName: "shape", parentId: "page:bbbbbbbb" },
      },
    };

    expect(pageSliceOf(merged, "aaaaaaaa").store["shape:x7Kq"]).toBeUndefined();
  });
});
