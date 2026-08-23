/**
 * `mergeOverlayEntries`: guards the overlay write-back path against
 * silently losing entries a human created (tldsl-j3q), while still letting
 * a canvas edit that undoes an entry back to its source value remove it
 * (tldsl-z2j half 2).
 *
 * `diffScenes` only knows the two scenes it is given, so an id whose
 * current record equals its base record is absent from the diff either way
 * - there is no way to tell "the browser doesn't have this shape anymore"
 * (a source edit invalidated the id - tldsl-j3q) apart from "the browser
 * has this shape and it now matches base again" (the user undid the edit -
 * tldsl-z2j) from the diff alone. `snapshotIds` (every id in the browser's
 * current scene) is what makes the two distinguishable: an id absent from
 * `fresh` is only preserved when it is *also* absent from `snapshotIds`.
 *
 * round-trip.md D2 already commits to this invariant for `applyOverlay`:
 * "apply never refuses to run and never silently drops an entry... Only
 * absorb and reset ever remove an entry." This extends a refined version of
 * that rule to the write path: an id in `previous` that the fresh diff has
 * nothing to say about survives, unchanged, in the merged result *only if*
 * the browser snapshot no longer has that id at all. If the snapshot still
 * has the id and the diff has nothing to say about it, that means the
 * canvas now matches base again - the entry is stale and is dropped. An id
 * the fresh diff *does* mention (a real edit, or a real `deleted: true`)
 * overwrites the previous entry - the overlay stays a final-state map, not
 * a union of every edit ever made.
 */

import type { OverlayEntry } from "../../contracts/overlay.js";
import type { TLRecordId } from "../../contracts/scene-json.js";

export function mergeOverlayEntries(
  previous: Record<TLRecordId, OverlayEntry>,
  fresh: Record<TLRecordId, OverlayEntry>,
  snapshotIds: ReadonlySet<TLRecordId>,
): { entries: Record<TLRecordId, OverlayEntry>; preserved: TLRecordId[] } {
  const preserved = Object.keys(previous).filter(
    (id) => !(id in fresh) && !snapshotIds.has(id),
  );
  const entries: Record<TLRecordId, OverlayEntry> = { ...fresh };
  for (const id of preserved) entries[id] = previous[id]!;
  return { entries, preserved };
}
