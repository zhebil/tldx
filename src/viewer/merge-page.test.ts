import { describe, expect, it } from "vitest";

import type { SceneJSON, TLRecord, TLRecordId } from "../contracts/scene-json.js";

import { isDocumentRecord } from "../contracts/page-scope.js";

import { mergePageSlice, orphanPageIds } from "./merge-page.js";

/** A page's records as the server pushes them: `page:<key>` plus prefixed shapes. */
function page(key: string, shapes: string[]): Record<TLRecordId, TLRecord> {
  const store: Record<TLRecordId, TLRecord> = {
    [`page:${key}`]: { id: `page:${key}`, typeName: "page", name: key },
  };
  for (const shape of shapes) {
    const id = `shape:${key}_${shape}`;
    store[id] = { id, typeName: "shape", parentId: `page:${key}` };
  }
  return store;
}

const slice = (store: Record<TLRecordId, TLRecord>): SceneJSON => ({
  store,
  schema: { schemaVersion: 2, sequences: {} },
});

describe("mergePageSlice", () => {
  it("puts the incoming records and removes the page's records that are gone", () => {
    const current = { ...page("aaaa", ["api", "db"]), ...page("bbbb", ["api"]) };
    const incoming = page("aaaa", ["api"]);

    const { put, remove } = mergePageSlice(current, slice(incoming), "aaaa", isDocumentRecord);

    expect(put).toEqual(Object.values(incoming));
    expect(remove).toEqual(["shape:aaaa_db"]);
  });

  it("never removes another page's records", () => {
    const current = { ...page("aaaa", ["api"]), ...page("bbbb", ["api", "db"]) };

    const { remove } = mergePageSlice(current, slice(page("aaaa", [])), "aaaa", isDocumentRecord);

    expect(remove).toEqual(["shape:aaaa_api"]);
    expect(remove.some((id) => id.includes("bbbb"))).toBe(false);
  });

  it("removes a shape the user drew, which carries no page key in its id", () => {
    const current = {
      ...page("aaaa", ["api"]),
      // Drawn on the canvas: tldraw chose the id, the parent makes it ours.
      "shape:x7Kq": { id: "shape:x7Kq", typeName: "shape", parentId: "page:aaaa" },
    };

    const { remove } = mergePageSlice(
      current,
      slice(page("aaaa", ["api"])),
      "aaaa",
      isDocumentRecord,
    );

    expect(remove).toEqual(["shape:x7Kq"]);
  });

  it("drops a record the store has no type for, instead of failing the merge", () => {
    // A stale overlay sidecar can carry one of these; putting it throws, and
    // the throw would lose every other page too.
    const incoming = {
      ...page("aaaa", ["api"]),
      "user:jGkov": { id: "user:jGkov", typeName: "user" },
    };

    const { put } = mergePageSlice({}, slice(incoming), "aaaa", isDocumentRecord);

    expect(put.map((r) => r.id)).not.toContain("user:jGkov");
    expect(put).toHaveLength(2);
  });

  it("removes nothing on a page's first arrival", () => {
    expect(
      mergePageSlice({}, slice(page("aaaa", ["api"])), "aaaa", isDocumentRecord).remove,
    ).toEqual([]);
  });
});

describe("orphanPageIds", () => {
  it("finds the empty page tldraw boots with, once a real page is served", () => {
    const current = {
      "page:page": { id: "page:page", typeName: "page", name: "Page 1" },
      ...page("aaaa", ["api"]),
    };

    expect(orphanPageIds(current, ["aaaa"])).toEqual(["page:page"]);
  });

  it("keeps every served page", () => {
    const current = { ...page("aaaa", []), ...page("bbbb", []) };

    expect(orphanPageIds(current, ["aaaa", "bbbb"])).toEqual([]);
  });
});
