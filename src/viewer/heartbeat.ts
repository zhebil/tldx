/**
 * Visible-tab liveness ping for `tldx serve`'s idle-TTL reaper (tldx-kts).
 * An open SSE connection is not a liveness signal - an abandoned tab holds
 * it open forever - so the server needs a *periodic* signal instead, sent
 * only while someone is actually looking at the diagram. This is a plain
 * `GET /heartbeat` (any HTTP request already bumps the reaper - see
 * `infra/devserver`'s `onActivity`); it is the caller's job to only send it
 * while visible.
 *
 * This is DISTINCT from `infra/transport/sse-transport.ts`'s `: ping`
 * comment heartbeat, which is a server->client SSE keepalive against idle
 * proxies. This module is client->server, app-level, and tab-visibility
 * gated.
 */

export interface HeartbeatOptions {
  /** GET target. Defaults to "/heartbeat". */
  url?: string;
  /** Ping interval while visible, in ms. Defaults to 60000 (comfortably under the 60m default TTL). */
  intervalMs?: number;
  fetch?: typeof globalThis.fetch;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
  /** Defaults to `globalThis.document`. Injectable for tests. */
  document?: HeartbeatDocument;
}

/** The slice of `Document` this module needs - narrow enough to fake without a DOM. */
export interface HeartbeatDocument {
  readonly visibilityState: DocumentVisibilityState;
  addEventListener(type: "visibilitychange", listener: () => void): void;
  removeEventListener(type: "visibilitychange", listener: () => void): void;
}

export interface Heartbeat {
  close(): void;
}

export function createHeartbeat(options: HeartbeatOptions = {}): Heartbeat {
  const url = options.url ?? "/heartbeat";
  const intervalMs = options.intervalMs ?? 60_000;
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const doSetTimeout = options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
  const doClearTimeout = options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
  const doc = options.document ?? globalThis.document;

  let timer: ReturnType<typeof globalThis.setTimeout> | null = null;

  function tick(): void {
    void doFetch(url);
    timer = doSetTimeout(tick, intervalMs);
  }

  function start(): void {
    if (timer !== null) return;
    tick();
  }

  function stop(): void {
    if (timer === null) return;
    doClearTimeout(timer);
    timer = null;
  }

  function handleVisibilityChange(): void {
    if (doc.visibilityState === "visible") start();
    else stop();
  }

  doc.addEventListener("visibilitychange", handleVisibilityChange);
  if (doc.visibilityState === "visible") start();

  return {
    close(): void {
      stop();
      doc.removeEventListener("visibilitychange", handleVisibilityChange);
    },
  };
}
