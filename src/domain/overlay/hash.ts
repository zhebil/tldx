/**
 * `basedOn` is a hash of the compiled scene the overlay was recorded against.
 * Hashes the store's record ids in sorted order, not record content: id set
 * membership is exactly what `apply`'s resolution depends on, and it is stable
 * across formatting differences inside the records.
 */

import type { SceneJSON } from "../../contracts/scene-json.js";
import { contentHash } from "../ir/synthetic-id.js";

export function sceneHash(scene: SceneJSON): string {
  return contentHash("scene", Object.keys(scene.store).sort());
}
