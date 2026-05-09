import type { Diagnostic } from "./diagnostic.js";
import type { SceneJSON } from "./scene-json.js";

/**
 * Versioned envelope pushed over the transport. Both producer
 * (infra/transport, fed by app/watchAndServe) and consumer (viewer/) import
 * from here.
 *
 * `v` bumps on incompatible change. Today: v=1 covers all kinds.
 *
 * The three kinds:
 * - "scene": a successful compile; payload is the full document snapshot.
 *   The viewer applies it via tldraw's `loadSnapshot(store, { document })`.
 * - "error": the compile failed. The viewer keeps its previous scene
 *   (decision still open in tldsl-8mu) and surfaces the diagnostics.
 * - "ping":  keepalive. EventSource reconnects on its own, but a periodic
 *   ping lets the server detect dead connections and lets the viewer
 *   distinguish "idle" from "disconnected".
 */
export type SceneMessage =
  | { v: 1; kind: "scene"; payload: SceneJSON }
  | { v: 1; kind: "error"; payload: { diagnostics: Diagnostic[] } }
  | { v: 1; kind: "ping"; payload: Record<string, never> };

/** Current envelope version. Producers write this; consumers compare. */
export const SCENE_MESSAGE_VERSION = 1 as const;
export type SceneMessageVersion = typeof SCENE_MESSAGE_VERSION;
