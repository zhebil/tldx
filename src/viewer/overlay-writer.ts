/**
 * Debounces canvas edits into `PUT /overlay` calls. Kept out of `app.tsx` so
 * the debounce and echo guard are testable without mounting tldraw.
 *
 * An edit is attributed to the page it happened on and carries only that
 * page's records, so one diagram's canvas work can never be written into
 * another diagram's sidecar. The write endpoint is gated, so every PUT carries
 * the server's token (fetched once from `GET /token` by the caller).
 *
 * `noteServerScene` is the echo guard, and it is per page: the merge flushes
 * store listeners through `throttleToNextFrame`, so the change listener fires
 * asynchronously after a server push, and an "am I loading right now" flag
 * would already be back to false by then. Comparing against the last scene the
 * server sent works regardless of when the listener runs - but only if each
 * page is compared against its own, since merging page B would otherwise make
 * page A's next snapshot look like a user edit.
 */

import type { SceneJSON } from "../contracts/scene-json.js";

export interface OverlayWriterOptions {
  /** PUT target. Defaults to "/overlay". */
  url?: string;
  /** Secret for the gated write endpoint, from `GET /token`. */
  token?: string;
  /** Debounce window in ms. Defaults to 400. */
  debounceMs?: number;
  fetch?: typeof globalThis.fetch;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}

export interface OverlayWriter {
  /** Record the scene the server just pushed for a page; snapshots equal to it are not written back. */
  noteServerScene(pageKey: string, scene: SceneJSON): void;
  /** Called on every canvas change; debounces and PUTs the edited page. */
  onCanvasChange(pageKey: string, snapshot: SceneJSON): void;
  close(): void;
}

export function createOverlayWriter(options: OverlayWriterOptions = {}): OverlayWriter {
  const url = options.url ?? "/overlay";
  const token = options.token ?? "";
  const debounceMs = options.debounceMs ?? 400;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const doSetTimeout = options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
  const doClearTimeout = options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);

  /** Last scene the server pushed, per page, as JSON for cheap comparison. */
  const lastServerJson = new Map<string, string>();
  /** Debounce timer per page: an edit on one must not cancel another's write. */
  const pending = new Map<string, ReturnType<typeof globalThis.setTimeout>>();
  let closed = false;
  function put(pageKey: string, snapshot: SceneJSON): void {
    void doFetch(url, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-tldx-token": token },
      body: JSON.stringify({ pageKey, snapshot }),
    });
  }

  return {
    noteServerScene(pageKey: string, scene: SceneJSON): void {
      lastServerJson.set(pageKey, JSON.stringify(scene));
    },
    onCanvasChange(pageKey: string, snapshot: SceneJSON): void {
      if (closed) return;
      if (JSON.stringify(snapshot) === lastServerJson.get(pageKey)) return;
      const inFlight = pending.get(pageKey);
      if (inFlight !== undefined) doClearTimeout(inFlight);
      pending.set(
        pageKey,
        doSetTimeout(() => {
          pending.delete(pageKey);
          put(pageKey, snapshot);
        }, debounceMs),
      );
    },
    close(): void {
      closed = true;
      for (const timer of pending.values()) doClearTimeout(timer);
      pending.clear();
    },
  };
}
