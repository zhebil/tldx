/**
 * Debounces canvas edits into `PUT /overlay` calls (docs/round-trip.md D4:
 * "the viewer writes the overlay over a plain `PUT /overlay`, not a
 * websocket"). Kept out of `app.tsx` so the debounce/guard logic is
 * unit-testable without mounting tldraw.
 *
 * Why `noteServerScene` exists: `editor.loadSnapshot` flushes store
 * listeners through `throttleToNextFrame` (verified in
 * `node_modules/@tldraw/store/dist-esm/lib/Store.mjs` - the history
 * reactor's `scheduleEffect`), so the store-change listener fires
 * *asynchronously* after a server push, not synchronously inside the
 * `loadSnapshot` call. A synchronous "I am currently loading a server
 * push, ignore the next listener call" flag therefore cannot suppress it -
 * the flag would already be back to "not loading" by the time the listener
 * runs. Comparing the incoming snapshot against the last scene the server
 * pushed (a `JSON.stringify` compare is fine at this size) is a guard that
 * does not depend on timing: a snapshot that matches what the server just
 * sent is an echo, not a user edit, regardless of when it arrives.
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
