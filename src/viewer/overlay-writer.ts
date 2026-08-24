/**
 * Debounces canvas edits into `PUT /overlay` calls. Kept out of `app.tsx` so
 * the debounce and echo guard are testable without mounting tldraw.
 *
 * `noteServerScene` is the echo guard. `editor.loadSnapshot` flushes store
 * listeners through `throttleToNextFrame`, so the change listener fires
 * asynchronously after a server push; an "am I loading right now" flag would
 * already be back to false by then. Comparing against the last scene the
 * server sent works regardless of when the listener runs.
 */

import type { SceneJSON } from "../contracts/scene-json.js";

export interface OverlayWriterOptions {
  /** PUT target. Defaults to "/overlay". */
  url?: string;
  /** Debounce window in ms. Defaults to 400. */
  debounceMs?: number;
  fetch?: typeof globalThis.fetch;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}

export interface OverlayWriter {
  /** Record the scene the server just pushed; snapshots equal to it are not written back. */
  noteServerScene(scene: SceneJSON): void;
  /** Called on every canvas change; debounces and PUTs. */
  onCanvasChange(snapshot: SceneJSON): void;
  close(): void;
}

export function createOverlayWriter(options: OverlayWriterOptions = {}): OverlayWriter {
  const url = options.url ?? "/overlay";
  const debounceMs = options.debounceMs ?? 400;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const doSetTimeout = options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
  const doClearTimeout = options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);

  let lastServerJson: string | null = null;
  let pending: ReturnType<typeof globalThis.setTimeout> | null = null;
  let closed = false;

  function put(snapshot: SceneJSON): void {
    void doFetch(url, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(snapshot),
    });
  }

  return {
    noteServerScene(scene: SceneJSON): void {
      lastServerJson = JSON.stringify(scene);
    },
    onCanvasChange(snapshot: SceneJSON): void {
      if (closed) return;
      if (JSON.stringify(snapshot) === lastServerJson) return;
      if (pending !== null) doClearTimeout(pending);
      pending = doSetTimeout(() => {
        pending = null;
        put(snapshot);
      }, debounceMs);
    },
    close(): void {
      closed = true;
      if (pending !== null) {
        doClearTimeout(pending);
        pending = null;
      }
    },
  };
}
