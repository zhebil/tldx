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
