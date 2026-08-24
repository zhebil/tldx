/**
 * Merging one diagram's page into the shared tldraw document.
 *
 * The server pushes a page at a time, so the viewer cannot use
 * `editor.loadSnapshot` - that replaces the whole document, which would reload
 * every other page (losing camera and selection) on every keystroke in any one
 * of them. Instead this computes the minimal put/remove for the page being
 * updated, and leaves every other page untouched.
 *
 * Kept pure and free of tldraw imports so it is testable without mounting an
 * editor.
 */

import { pageIdFor, pageMembers } from "../contracts/page-scope.js";
import type { SceneJSON, TLRecord, TLRecordId } from "../contracts/scene-json.js";

export interface PageMerge {
  /** Records to write into the store. */
  put: TLRecord[];
  /** Records to drop: this page's records that the update no longer has. */
  remove: TLRecordId[];
}

/**
 * What to apply to a store holding `current` records so that `key`'s page
 * matches `slice`.
 *
 * `document:document` and the schema are ignored: slices carry neither, the
 * editor supplies the document record itself, and the emitter and viewer ship
 * from the same build so there is no snapshot to migrate.
 *
 * `keep` decides what the document store can hold. A record it rejects is
 * dropped rather than put: `store.put` throws on a type the schema doesn't
 * define, and one such record - a stale overlay sidecar can carry a `user:`
 * record recorded by an older viewer - would otherwise take down the merge for
 * every page, not just its own.
 */
export function mergePageSlice(
  current: Record<TLRecordId, TLRecord>,
  slice: SceneJSON,
  key: string,
  keep: (record: TLRecord) => boolean,
): PageMerge {
  const incoming = slice.store;
  const stale = pageMembers(current, key);
  return {
    put: Object.values(incoming).filter(keep),
    remove: [...stale].filter((id) => !(id in incoming)),
  };
}

/**
 * Pages tldraw created for itself that no served diagram owns. A fresh editor
 * always starts with an empty "Page 1"; `loadSnapshot` used to replace it, and
 * incremental puts do not, so it would otherwise sit in the page menu forever.
 */
export function orphanPageIds(
  current: Record<TLRecordId, TLRecord>,
  servedKeys: readonly string[],
): TLRecordId[] {
  const served = new Set(servedKeys.map(pageIdFor));
  return Object.values(current)
    .filter((record) => record.typeName === "page" && !served.has(record.id))
    .map((record) => record.id);
}
