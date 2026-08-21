/**
 * Wire shape for the overlay file (`x.tldsl.overlay.json`), one per diagram,
 * beside the source (`docs/round-trip.md` D1). It is a final-state map keyed
 * by the tldraw record id as it appears in the compiled scene store, never a
 * delta and never a sequence - re-applying it twice gives the same answer as
 * applying it once, and a human can read, hand-edit or delete an entry
 * without simulating anything.
 *
 * Lives in contracts/ because both `domain/overlay/` (which applies and
 * diffs it) and the viewer (which writes it over `PUT /overlay`, D4) need
 * the same shape. contracts/ imports nothing.
 */

import type { TLRecord, TLRecordId } from "./scene-json.js";

export const OVERLAY_VERSION = 1;

/**
 * Placement fields tldraw writes on translate / resize / rotate / reparent /
 * reorder. `w`/`h` live under `props`; the rest are top-level record fields.
 * `moved` carries the whole placement rather than one field per gesture -
 * translate, resize, rotate and reparent all touch the same handful of
 * fields on the same record (round-trip.md D1).
 */
export type OverlayPlacement = {
  x?: number;
  y?: number;
  rotation?: number;
  parentId?: TLRecordId;
  index?: string;
  w?: number;
  h?: number;
};

export type OverlayEntry = {
  moved?: OverlayPlacement;
  /** Flat style patch. Keys in `RESTYLE_RECORD_FIELDS` are written on the
   *  record; every other key is written into `props`. */
  restyled?: Record<string, unknown>;
  /** Plain-text label. Written to `props.richText` for geo/note shapes and
   *  to `props.text` for arrows. */
  relabelled?: string;
  deleted?: true;
  added?: TLRecord;
};

/** The only top-level record fields `restyled` may target; everything else
 *  in a restyle patch is a props key. */
export const RESTYLE_RECORD_FIELDS = ["opacity", "isLocked"] as const;

export type Overlay = {
  v: number;
  basedOn: string;
  entries: Record<TLRecordId, OverlayEntry>;
};

/** Shallow structural check - enough to trust the shape before `applyOverlay`
 *  reads it. Field-level validation of individual entries is `applyOverlay`'s
 *  job (it never refuses to run; round-trip.md D2). */
export function isOverlay(value: unknown): value is Overlay {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.v !== OVERLAY_VERSION) return false;
  if (typeof record.basedOn !== "string") return false;
  const entries = record.entries;
  if (typeof entries !== "object" || entries === null || Array.isArray(entries)) {
    return false;
  }
  return Object.values(entries as Record<string, unknown>).every(
    (entry) => typeof entry === "object" && entry !== null && !Array.isArray(entry),
  );
}

export function emptyOverlay(basedOn: string): Overlay {
  return { v: OVERLAY_VERSION, basedOn, entries: {} };
}
