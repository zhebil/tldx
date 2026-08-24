import type { Diagnostic } from "../contracts/diagnostic.js";
import type { SceneJSON } from "../contracts/scene-json.js";
import type { SceneMessage } from "../contracts/scene-message.js";

export interface ViewerState {
  readonly scene: SceneJSON | null;
  readonly diagnostics: readonly Diagnostic[];
}

export const initialViewerState: ViewerState = {
  scene: null,
  diagnostics: [],
};

/**
 * The page record's name, which `emit` sets from the document `title` or the
 * file name. Used for the browser tab; null before the first scene arrives.
 */
export function sceneTitle(scene: SceneJSON | null): string | null {
  if (scene === null) return null;
  for (const record of Object.values(scene.store)) {
    if (record.typeName === "page" && typeof record.name === "string") return record.name;
  }
  return null;
}

export function applyMessage(
  state: ViewerState,
  message: SceneMessage,
): ViewerState {
  switch (message.kind) {
    case "scene":
      return { scene: message.payload, diagnostics: [] };
    case "error":
      // Last-good: keep the prior scene; only surface diagnostics.
      return { scene: state.scene, diagnostics: message.payload.diagnostics };
    case "ping":
      return state;
  }
}
