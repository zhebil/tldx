/**
 * Record ids in the language of the source. An overlay is keyed by tldraw
 * record ids, and the ones that matter most are content hashes
 * (`shape:1f4f1641-0`, `binding:1f4f1641-0-end`): the hash is one-way, so
 * "which arrow in my file" has no answer from the id alone.
 *
 * The compiled scene answers it. An arrow's bindings name the shapes it joins,
 * and those shapes are named by the `id` the source wrote - so the arrow is
 * `app-usecases -> domain` and the binding is that arrow's `(end)`.
 *
 * Pure, and best-effort: an id the base scene does not hold - a shape added on
 * the canvas - has no source-level name, and comes back unchanged.
 */

import type { SceneJSON, TLRecord, TLRecordId } from "../../contracts/scene-json.js";

/** `shape:api` -> `api`. Ids without a `<typeName>:` prefix pass through. */
export function localName(id: TLRecordId): string {
  const colon = id.indexOf(":");
  return colon < 0 ? id : id.slice(colon + 1);
}

export function describeRecordId(scene: SceneJSON, id: TLRecordId): string {
  const record = scene.store[id];
  if (record === undefined) return id;

  if (record.typeName === "binding") {
    const terminal = terminalOf(record);
    if (typeof record.fromId !== "string" || terminal === undefined) return localName(id);
    return `${describeRecordId(scene, record.fromId)} (${terminal})`;
  }

  if (record.type === "arrow") {
    const ends = endpointsOf(scene, id);
    return ends === undefined ? localName(id) : `${ends.start} -> ${ends.end}`;
  }

  return localName(id);
}

function terminalOf(record: TLRecord): string | undefined {
  const terminal = (record.props as Record<string, unknown> | undefined)?.terminal;
  return typeof terminal === "string" ? terminal : undefined;
}

/**
 * The shapes an arrow's bindings point at. `?` stands in for a terminal
 * nothing binds - a free endpoint has no name to borrow - and an arrow bound
 * at neither end has no pair worth printing.
 */
function endpointsOf(
  scene: SceneJSON,
  arrowId: TLRecordId,
): { start: string; end: string } | undefined {
  const ends: Record<string, string> = {};
  for (const record of Object.values(scene.store)) {
    if (record.typeName !== "binding" || record.fromId !== arrowId) continue;
    const terminal = terminalOf(record);
    if (terminal !== undefined && typeof record.toId === "string") {
      ends[terminal] = localName(record.toId);
    }
  }
  if (ends.start === undefined && ends.end === undefined) return undefined;
  return { start: ends.start ?? "?", end: ends.end ?? "?" };
}
