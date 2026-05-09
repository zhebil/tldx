/**
 * SceneJSON is the document payload pushed to the viewer. It is a structural
 * pin of tldraw's *document store snapshot* - the same shape returned by
 * `editor.store.getStoreSnapshot('document')` and accepted by
 * `loadSnapshot(store, { document: <SceneJSON> })`.
 *
 * Pin: tldraw@^3.15. See docs/scene-json.md for the spike behind this shape
 * and for what each record kind looks like.
 *
 * Why structural rather than `import type` from tldraw:
 * - contracts/ imports nothing (lint-enforced).
 * - tldraw's exported types pull in DOM/runtime baggage via transitive
 *   dependencies; pinning structurally lets domain/ stay pure.
 *
 * Bumping the tldraw major version is a wire-format break: ship a v: 2
 * SceneMessage envelope and migrate viewers in lockstep.
 */

/**
 * tldraw record IDs are branded strings of the form "<typeName>:<localId>".
 * We accept any string at the contract layer; producers are responsible for
 * choosing well-formed ids (see docs/scene-json.md).
 */
export type TLRecordId = string;

/** A single record in the store. We model it as opaque-but-keyed-by-id; the
 *  full TLRecord union is owned by tldraw and we treat it as "any object with
 *  an id and a typeName" at the wire layer. Producers/consumers narrow on
 *  `typeName` to discriminate. */
export type TLRecord = {
  id: TLRecordId;
  typeName: string;
  [field: string]: unknown;
};

/**
 * tldraw's schema block. Opaque to us - the viewer hands it to
 * `loadSnapshot`, which uses it to drive automatic migrations. We never
 * synthesize this by hand; emit/ takes whatever the runtime hands back.
 */
export type TLStoreSchema = {
  schemaVersion: number;
  sequences: Record<string, number>;
};

export type SceneJSON = {
  store: Record<TLRecordId, TLRecord>;
  schema: TLStoreSchema;
};
