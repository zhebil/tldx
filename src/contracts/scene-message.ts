import type { Diagnostic } from "./diagnostic.js";
import type { SceneJSON } from "./scene-json.js";

/**
 * Versioned envelope pushed over the transport. `v` bumps on incompatible
 * change; v=1 covers all three kinds.
 *
 * - "scene": a successful compile; payload is the full document snapshot.
 * - "error": the compile failed. The viewer keeps its previous scene and
 *   surfaces the diagnostics.
 * - "ping": keepalive. EventSource reconnects on its own, but a periodic ping
 *   lets the server detect dead connections and lets the viewer distinguish
 *   "idle" from "disconnected".
 */
export type SceneMessage =
  | { v: 1; kind: "scene"; payload: SceneJSON }
  | { v: 1; kind: "error"; payload: { diagnostics: Diagnostic[] } }
  | { v: 1; kind: "ping"; payload: Record<string, never> };

export const SCENE_MESSAGE_VERSION = 1 as const;
