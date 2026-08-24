/**
 * Page namespacing: the boundary transform that lets several independently
 * compiled diagrams share one tldraw document.
 *
 * `emit` never learns that pages exist - it always produces a standalone scene
 * rooted at `page:main` with ids the author chose, so two diagrams that both
 * declare `<Box id="api">` emit the same `shape:api`. These functions rewrite
 * those ids on the way out to the shared viewer, and rewrite them back before
 * the overlay diff, so `.overlay.json` sidecars, `render` and `absorb` keep
 * working against single-diagram scenes.
 *
 * The load-bearing property:
 * `denamespaceScene(namespaceScene(scene, key), key, scene)` deep-equals `scene`.
 *
 * The page key itself is minted in infra (it hashes a path, which domain may
 * not do); everything here takes it as an opaque, non-empty string.
 */

import { ID_FIELDS, isDocumentRecord, pageIdFor, pageMembers } from "../../contracts/page-scope.js";
import type { SceneJSON, TLRecord, TLRecordId } from "../../contracts/scene-json.js";

export { pageIdFor };

/** The page id `emit` always produces, and the only one these transforms rewrite. */
const SOLO_PAGE_ID = "page:main";

/**
 * Singleton records that belong to the document rather than to any one page.
 * They are dropped from a slice - N diagrams each carrying their own would
 * overwrite each other - and restored from the base scene on the way back.
 */
function isSingleton(record: TLRecord): boolean {
  return record.typeName === "document";
}

function namespaceId(id: TLRecordId, key: string): TLRecordId {
  if (id === SOLO_PAGE_ID) return pageIdFor(key);
  const colon = id.indexOf(":");
  if (colon === -1) return id;
  return `${id.slice(0, colon)}:${key}_${id.slice(colon + 1)}`;
}

function denamespaceId(id: TLRecordId, key: string): TLRecordId {
  if (id === pageIdFor(key)) return SOLO_PAGE_ID;
  const colon = id.indexOf(":");
  if (colon === -1) return id;
  const local = id.slice(colon + 1);
  const prefix = `${key}_`;
  if (!local.startsWith(prefix)) return id;
  return `${id.slice(0, colon)}:${local.slice(prefix.length)}`;
}

function rewriteRecord(record: TLRecord, rename: (id: TLRecordId) => TLRecordId): TLRecord {
  const rewritten: TLRecord = { ...record, id: rename(record.id) };
  for (const field of ID_FIELDS) {
    const value = record[field];
    if (typeof value === "string") rewritten[field] = rename(value);
  }
  return rewritten;
}

function rewriteStore(
  store: Record<TLRecordId, TLRecord>,
  rename: (id: TLRecordId) => TLRecordId,
): Record<TLRecordId, TLRecord> {
  const out: Record<TLRecordId, TLRecord> = {};
  for (const record of Object.values(store)) {
    const next = rewriteRecord(record, rename);
    out[next.id] = next;
  }
  return out;
}

/**
 * A compiled single-diagram scene as one page of a shared document: ids carry
 * the key, and the document singleton is dropped.
 *
 * `schema` is carried through unchanged. The viewer merges records rather than
 * calling `loadSnapshot`, so it never consults the schema, but keeping it makes
 * the message a well-formed `SceneJSON` and keeps the round-trip exact.
 */
export function namespaceScene(scene: SceneJSON, key: string): SceneJSON {
  const pageScoped: Record<TLRecordId, TLRecord> = {};
  for (const [id, record] of Object.entries(scene.store)) {
    if (!isSingleton(record)) pageScoped[id] = record;
  }
  return { schema: scene.schema, store: rewriteStore(pageScoped, (id) => namespaceId(id, key)) };
}

/**
 * The inverse: a page slice back into a standalone scene comparable with the
 * diagram's last compile. `base` supplies the schema and the document singleton
 * the slice dropped, so the result can be diffed against `base` without every
 * singleton reading as a deletion.
 */
export function denamespaceScene(slice: SceneJSON, key: string, base: SceneJSON): SceneJSON {
  const store = rewriteStore(slice.store, (id) => denamespaceId(id, key));
  for (const [id, record] of Object.entries(base.store)) {
    if (isSingleton(record)) store[id] = record;
  }
  return { schema: base.schema, store };
}

/**
 * The records of one page, dropped out of a whole-document snapshot. The viewer
 * sends only the edited page, but the overlay endpoint is a trust boundary:
 * slicing again server-side is what guarantees one diagram's canvas edits can
 * never be written into another diagram's sidecar.
 *
 * Membership follows the shape tree, not just the id prefix - see
 * `contracts/page-scope.ts`.
 */
export function pageSliceOf(snapshot: SceneJSON, key: string): SceneJSON {
  const members = pageMembers(snapshot.store, key);
  const store: Record<TLRecordId, TLRecord> = {};
  for (const id of members) {
    const record = snapshot.store[id];
    // Session records are one tab's business: a diff against them would write
    // a camera or a cursor into the diagram's sidecar.
    if (record !== undefined && isDocumentRecord(record)) store[id] = record;
  }
  return { schema: snapshot.schema, store };
}
