/**
 * `mergeOverlayEntries`: guards the overlay write-back path against
 * silently losing entries a human created (tldsl-j3q).
 *
 * `diffScenes` only knows the two scenes it is given. When a source edit
 * shifts layout enough that an old entry's record id no longer exists in
 * the freshly compiled base scene, `diffScenes` has nothing to say about
 * that id at all - it is absent from the diff, not marked `deleted`.
 * Writing that diff over the overlay file as the complete new set of
 * entries silently drops it - that is exactly how a source edit destroyed
 * unrelated canvas work (tldsl-j3q).
 *
 * round-trip.md D2 already commits to this invariant for `applyOverlay`:
 * "apply never refuses to run and never silently drops an entry... Only
 * absorb and reset ever remove an entry." This extends the same rule to the
 * write path: an id in `previous` that the fresh diff has nothing to say
 * about survives, unchanged, in the merged result. An id the fresh diff
 * *does* mention (a real edit, or a real `deleted: true` once the shape is
 * still resolvable) overwrites the previous entry - the overlay stays a
 * final-state map, not a union of every edit ever made.
 */

import type { OverlayEntry } from "../../contracts/overlay.js";
import type { TLRecordId } from "../../contracts/scene-json.js";

export function mergeOverlayEntries(
  previous: Record<TLRecordId, OverlayEntry>,
  fresh: Record<TLRecordId, OverlayEntry>,
): { entries: Record<TLRecordId, OverlayEntry>; preserved: TLRecordId[] } {
  const preserved = Object.keys(previous).filter((id) => !(id in fresh));
  return { entries: { ...previous, ...fresh }, preserved };
}
