/**
 * `mergeOverlayEntries`: guards the overlay write-back path against silently
 * losing entries a human created, while still letting a canvas edit that undoes
 * an entry back to its source value remove it.
 *
 * `diffScenes` only knows the two scenes it is given, so an id whose current
 * record equals its base record is absent from the diff either way - "the
 * browser no longer has this shape" and "the user undid the edit" look
 * identical. `snapshotIds` (every id in the browser's current scene) separates
 * them: an id absent from `fresh` is preserved only when it is *also* absent
 * from `snapshotIds`. If the snapshot still has it, the canvas matches base
 * again and the entry is stale. An id `fresh` does mention overwrites the
 * previous entry, so the overlay stays a final-state map rather than a union
 * of every edit ever made.
 */

import type { OverlayEntry } from "../../contracts/overlay.js";
import type { TLRecordId } from "../../contracts/scene-json.js";

export function mergeOverlayEntries(
  previous: Record<TLRecordId, OverlayEntry>,
  fresh: Record<TLRecordId, OverlayEntry>,
  snapshotIds: ReadonlySet<TLRecordId>,
): { entries: Record<TLRecordId, OverlayEntry>; preserved: TLRecordId[] } {
  const preserved = Object.keys(previous).filter((id) => !(id in fresh) && !snapshotIds.has(id));
  const entries: Record<TLRecordId, OverlayEntry> = { ...fresh };
  for (const id of preserved) entries[id] = previous[id]!;
  return { entries, preserved };
}
