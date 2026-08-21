/**
 * `basedOn` is a hash of the compiled scene the overlay was recorded
 * against, computed server-side and stamped into the overlay file by the
 * process that just compiled it (round-trip.md D2). Reuses `contentHash`
 * (FNV-1a 32-bit) over the store's record ids in sorted order, rather than
 * hashing record content: id set membership is exactly what `apply`'s
 * resolution depends on, and it's stable across whitespace/formatting
 * differences in the records themselves.
 */

import type { SceneJSON } from "../../contracts/scene-json.js";
import { contentHash } from "../ir/synthetic-id.js";

export function sceneHash(scene: SceneJSON): string {
  return contentHash("scene", Object.keys(scene.store).sort());
}
