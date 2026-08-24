/**
 * SceneJSON is the document payload pushed to the viewer. It is a structural
 * pin of tldraw's *document store snapshot* - the same shape returned by
 * `editor.store.getStoreSnapshot('document')` and accepted by
 * `loadSnapshot(store, { document: <SceneJSON> })`.
 *
 * Pinned to tldraw ^3.15 because the store snapshot shape is version-specific.
 * Bumping the tldraw major is a wire-format break: ship a v: 2 SceneMessage
 * envelope and migrate viewers in lockstep.
 *
 * Structural rather than `import type` from tldraw because contracts/ imports
 * nothing (lint-enforced) and tldraw's types drag in DOM/runtime baggage.
 */

/**
 * tldraw record IDs are branded strings of the form "<typeName>:<localId>".
 * Any string is accepted here; producers must choose well-formed ids.
 */
export type TLRecordId = string;

/** The full TLRecord union is owned by tldraw; at the wire layer it is any
 *  object with an `id` and a `typeName`. Consumers narrow on `typeName`. */
export type TLRecord = {
  id: TLRecordId;
  typeName: string;
  [field: string]: unknown;
};

/**
 * tldraw's schema block, opaque here: the viewer hands it to `loadSnapshot`,
 * which uses it to drive automatic migrations. Never synthesized by hand -
 * emit/ passes through whatever the runtime hands back.
 */
export type TLStoreSchema = {
  schemaVersion: number;
  sequences: Record<string, number>;
};

export type SceneJSON = {
  store: Record<TLRecordId, TLRecord>;
  schema: TLStoreSchema;
};
