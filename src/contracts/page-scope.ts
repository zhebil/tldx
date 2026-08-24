/**
 * Which records of a shared multi-page document belong to one diagram's page.
 *
 * This lives in `contracts/` because both sides of the wire need the same
 * answer and they cannot share code any other way: `domain/` slices a snapshot
 * before diffing it into an overlay, and `src/viewer/` decides which records to
 * drop when a page is re-pushed - and the viewer may only import `contracts/`.
 * Duplicating the rule is how the two would quietly disagree.
 *
 * Membership is not just the id prefix. A shape the *user* draws gets an id
 * from tldraw, which knows nothing about page keys; it belongs to the page
 * because its parent does.
 */

import type { TLRecord, TLRecordId } from "./scene-json.js";

/**
 * Record types a tldraw *document* store holds. Session and presence records -
 * `user`, `instance`, `camera`, `pointer`, `instance_page_state` - belong to
 * one browser tab, not to the diagram: they must never reach a sidecar, and
 * putting one back into the store throws.
 */
const DOCUMENT_TYPES: ReadonlySet<string> = new Set([
  "asset",
  "binding",
  "document",
  "page",
  "shape",
]);

/** Whether this record is part of the document, rather than one tab's session. */
export function isDocumentRecord(record: TLRecord): boolean {
  return DOCUMENT_TYPES.has(record.typeName);
}

/** The page record id for a diagram in the shared document. */
export function pageIdFor(key: string): TLRecordId {
  return `page:${key}`;
}

/**
 * Record fields holding a reference to another record's id. `parentId` is the
 * shape tree; `fromId`/`toId` are an arrow binding's two ends.
 */
export const ID_FIELDS = ["parentId", "fromId", "toId"] as const;

/** Whether `id` itself carries `key` - the page record, or a compiled record. */
export function hasPageId(id: TLRecordId, key: string): boolean {
  if (id === pageIdFor(key)) return true;
  const colon = id.indexOf(":");
  return colon !== -1 && id.slice(colon + 1).startsWith(`${key}_`);
}

/**
 * Every record of `store` belonging to `key`'s page: the ones whose id carries
 * the key, plus everything reachable from them through `ID_FIELDS`.
 */
export function pageMembers(store: Record<TLRecordId, TLRecord>, key: string): Set<TLRecordId> {
  const members = new Set<TLRecordId>();
  for (const id of Object.keys(store)) {
    if (hasPageId(id, key)) members.add(id);
  }

  // Fixpoint: a child joins only once its parent is known to be a member, and
  // children can appear in any order.
  for (let grew = true; grew;) {
    grew = false;
    for (const [id, record] of Object.entries(store)) {
      if (members.has(id)) continue;
      for (const field of ID_FIELDS) {
        const ref = record[field];
        if (typeof ref === "string" && members.has(ref)) {
          members.add(id);
          grew = true;
          break;
        }
      }
    }
  }
  return members;
}
