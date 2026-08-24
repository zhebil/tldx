import { describe, expect, it, vi } from "vitest";
import type { Editor } from "tldraw";

import type { SceneJSON, TLRecord, TLRecordId } from "../contracts/scene-json.js";

import { mergePages } from "./app.js";
import type { ViewerState } from "./state.js";

function pageScene(key: string, shapes: string[]): SceneJSON {
  const store: Record<TLRecordId, TLRecord> = {
    [`page:${key}`]: { id: `page:${key}`, typeName: "page", name: key },
  };
  for (const shape of shapes) {
    const id = `shape:${key}_${shape}`;
    store[id] = { id, typeName: "shape", parentId: `page:${key}` };
  }
  return { store, schema: { schemaVersion: 2, sequences: {} } };
}

/**
 * A stub editor whose store is a plain record, so the merge can be driven
 * without mounting tldraw. `currentPageId` tracks `setCurrentPage`.
 */
function stubEditor(initial: Record<TLRecordId, TLRecord> = {}) {
  const store = { ...initial };
  const calls = { mergeRemoteChanges: 0, put: 0, remove: [] as TLRecordId[] };
  let currentPageId = "page:page";
  const editor = {
    getCurrentPageId: () => currentPageId,
    setCurrentPage: (id: string) => {
      currentPageId = id;
    },
    store: {
      // Only the types tldraw's document store defines; `put` throws on others.
      schema: {
        types: {
          page: { scope: "document" },
          shape: { scope: "document" },
          binding: { scope: "document" },
        },
      },
      mergeRemoteChanges: (fn: () => void) => {
        calls.mergeRemoteChanges += 1;
        fn();
      },
      getStoreSnapshot: () => ({ store, schema: { schemaVersion: 2, sequences: {} } }),
      put: (records: TLRecord[]) => {
        calls.put += 1;
        for (const record of records) store[record.id] = record;
      },
      remove: (ids: TLRecordId[]) => {
        calls.remove.push(...ids);
        for (const id of ids) delete store[id];
      },
    },
  } as unknown as Editor;
  return { editor, store, calls, currentPage: () => currentPageId };
}

const pagesOf = (entries: Record<string, SceneJSON>): ViewerState["pages"] =>
  Object.fromEntries(
    Object.entries(entries).map(([key, scene]) => [key, { scene, diagnostics: [] }]),
  );

describe("mergePages", () => {
  it("applies every change inside store.mergeRemoteChanges, so edits do not echo back", () => {
    const { editor, calls } = stubEditor();

    mergePages(editor, pagesOf({ aaaa: pageScene("aaaa", ["api"]) }), new Map(), null);

    expect(calls.mergeRemoteChanges).toBe(1);
    expect(calls.put).toBeGreaterThan(0);
  });

  it("switches to a page when it first arrives, and stays put when one recompiles", () => {
    const { editor, currentPage } = stubEditor();
    const merged = new Map<string, SceneJSON>();

    mergePages(editor, pagesOf({ aaaa: pageScene("aaaa", ["api"]) }), merged, null);
    expect(currentPage()).toBe("page:aaaa");

    mergePages(
      editor,
      pagesOf({ aaaa: pageScene("aaaa", ["api"]), bbbb: pageScene("bbbb", ["api"]) }),
      merged,
      null,
    );
    expect(currentPage()).toBe("page:bbbb");

    // A recompile of the page not in view must not steal the view back.
    mergePages(
      editor,
      pagesOf({ aaaa: pageScene("aaaa", ["api", "db"]), bbbb: pageScene("bbbb", ["api"]) }),
      merged,
      null,
    );
    expect(currentPage()).toBe("page:bbbb");
  });

  it("does not re-merge a page whose scene has not changed", () => {
    const { editor, calls } = stubEditor();
    const merged = new Map<string, SceneJSON>();
    const pages = pagesOf({ aaaa: pageScene("aaaa", ["api"]) });

    mergePages(editor, pages, merged, null);
    const putsAfterFirst = calls.put;
    mergePages(editor, pages, merged, null);

    expect(calls.put).toBe(putsAfterFirst);
  });

  it("drops tldraw's own boot page once a real page arrives", () => {
    const { editor, store } = stubEditor({
      "page:page": { id: "page:page", typeName: "page", name: "Page 1" },
    });

    mergePages(editor, pagesOf({ aaaa: pageScene("aaaa", ["api"]) }), new Map(), null);

    expect(store["page:page"]).toBeUndefined();
    expect(store["page:aaaa"]).toBeDefined();
  });

  it("tells the overlay writer what the server last sent, so the merge does not echo", () => {
    const { editor } = stubEditor();
    const noteServerScene = vi.fn();
    const writer = { noteServerScene, onCanvasChange: vi.fn(), close: vi.fn() };

    mergePages(editor, pagesOf({ aaaa: pageScene("aaaa", ["api"]) }), new Map(), writer);

    expect(noteServerScene).toHaveBeenCalledTimes(1);
    expect(noteServerScene.mock.calls[0]?.[0]).toBe("aaaa");
  });
});
