/**
 * `applyOverlay`: `apply(overlay, scene) -> { scene, diagnostics }`. Pure,
 * total, never throws - the overlay is user data that may reference ids that
 * no longer exist, so an unresolved entry becomes a warning.
 *
 * Order: merge `added` records; apply `moved`/`restyled`/`relabelled`
 * field-wise onto the record they name, added records included; then `deleted`
 * last, cascading to a fixpoint so the store never comes out with dangling
 * bindings or orphaned children. This is a patch over the finished scene, not
 * an input to layout, so layout never re-runs.
 */

import { richText } from "../../contracts/builders.js";
import { RESTYLE_RECORD_FIELDS } from "../../contracts/overlay.js";
import type {
  Overlay,
  OverlayEntry,
  OverlayPlacement,
} from "../../contracts/overlay.js";
import type { SceneJSON, TLRecord, TLRecordId } from "../../contracts/scene-json.js";
import { warning } from "../diagnostics/index.js";
import type { Diagnostic } from "../diagnostics/index.js";

const RESTYLE_RECORD_FIELD_SET: ReadonlySet<string> = new Set(RESTYLE_RECORD_FIELDS);

export function applyOverlay(
  overlay: Overlay,
  scene: SceneJSON,
): { scene: SceneJSON; diagnostics: Diagnostic[] } {
  const store: Record<TLRecordId, TLRecord> = {};
  for (const [id, record] of Object.entries(scene.store)) {
    store[id] = { ...record };
  }
  const diagnostics: Diagnostic[] = [];

  for (const [id, entry] of Object.entries(overlay.entries)) {
    if (entry.added === undefined) continue;
    if (id in store) {
      diagnostics.push(
        warning(
          "overlay/add-collision",
          `cannot add "${id}": a record with this id already exists in the compiled scene`,
        ),
      );
      continue;
    }
    store[id] = { ...entry.added };
  }

  for (const [id, entry] of Object.entries(overlay.entries)) {
    const ops = fieldOps(entry);
    if (ops.length === 0) continue;
    const record = store[id];
    if (record === undefined) {
      diagnostics.push(
        warning(
          "overlay/unresolved-id",
          `overlay entry for "${id}" (${ops.join(", ")}) does not resolve: no such record in the compiled scene`,
        ),
      );
      continue;
    }
    if (entry.moved !== undefined) applyMoved(record, entry.moved);
    if (entry.restyled !== undefined) applyRestyled(record, entry.restyled);
    if (entry.relabelled !== undefined) {
      const labelled = applyRelabelled(record, entry.relabelled);
      if (!labelled) {
        diagnostics.push(
          warning(
            "overlay/unlabellable",
            `cannot relabel "${id}": record has neither props.text nor props.richText`,
          ),
        );
      }
    }
  }

  const deletedIds = new Set<TLRecordId>();
  for (const [id, entry] of Object.entries(overlay.entries)) {
    if (entry.deleted === true) deletedIds.add(id);
  }
  cascadeDelete(store, deletedIds);
  for (const id of deletedIds) delete store[id];

  return { scene: { store, schema: scene.schema }, diagnostics };
}

function fieldOps(entry: OverlayEntry): string[] {
  const ops: string[] = [];
  if (entry.moved !== undefined) ops.push("moved");
  if (entry.restyled !== undefined) ops.push("restyled");
  if (entry.relabelled !== undefined) ops.push("relabelled");
  return ops;
}

function applyMoved(record: TLRecord, placement: OverlayPlacement): void {
  if (placement.x !== undefined) record.x = placement.x;
  if (placement.y !== undefined) record.y = placement.y;
  if (placement.rotation !== undefined) record.rotation = placement.rotation;
  if (placement.parentId !== undefined) record.parentId = placement.parentId;
  if (placement.index !== undefined) record.index = placement.index;
  if (placement.w !== undefined || placement.h !== undefined) {
    const props = { ...(record.props as Record<string, unknown> | undefined) };
    if (placement.w !== undefined) props.w = placement.w;
    if (placement.h !== undefined) props.h = placement.h;
    record.props = props;
  }
}

function applyRestyled(record: TLRecord, patch: Record<string, unknown>): void {
  let props: Record<string, unknown> | undefined;
  for (const [key, value] of Object.entries(patch)) {
    if (RESTYLE_RECORD_FIELD_SET.has(key)) {
      record[key] = value;
    } else {
      props ??= { ...(record.props as Record<string, unknown> | undefined) };
      props[key] = value;
    }
  }
  if (props !== undefined) record.props = props;
}

function applyRelabelled(record: TLRecord, label: string): boolean {
  const props = record.props as Record<string, unknown> | undefined;
  if (props === undefined) return false;
  if ("text" in props) {
    record.props = { ...props, text: label };
    return true;
  }
  if ("richText" in props) {
    record.props = { ...props, richText: richText(label) };
    return true;
  }
  return false;
}

/**
 * Deletion cascades to a fixpoint: a binding whose `toId` is removed is
 * removed, and its `fromId` (the arrow) is removed too; a binding whose
 * `fromId` is removed is removed with no cascade back to `toId`; any record
 * whose `parentId` is removed is removed. Repeating until nothing changes
 * catches chains - e.g. deleting a frame removes a child shape, which then
 * removes an arrow bound to that child.
 */
function cascadeDelete(store: Record<TLRecordId, TLRecord>, deletedIds: Set<TLRecordId>): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of Object.values(store)) {
      if (deletedIds.has(record.id)) continue;
      if (record.typeName === "binding") {
        const toId = record.toId as TLRecordId | undefined;
        const fromId = record.fromId as TLRecordId | undefined;
        if (toId !== undefined && deletedIds.has(toId)) {
          deletedIds.add(record.id);
          if (fromId !== undefined) deletedIds.add(fromId);
          changed = true;
          continue;
        }
        if (fromId !== undefined && deletedIds.has(fromId)) {
          deletedIds.add(record.id);
          changed = true;
          continue;
        }
      }
      const parentId = record.parentId as TLRecordId | undefined;
      if (parentId !== undefined && deletedIds.has(parentId)) {
        deletedIds.add(record.id);
        changed = true;
      }
    }
  }
}
