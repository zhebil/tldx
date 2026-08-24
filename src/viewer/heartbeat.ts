/**
 * Visible-tab liveness ping for `tldx serve`'s idle-TTL reaper. An open SSE
 * connection proves nothing - an abandoned tab holds one open forever - so the
 * reaper needs a periodic `GET /heartbeat` sent only while the tab is visible.
 *
 * Distinct from the transport's `: ping` SSE comment, which is a
 * server-to-client keepalive against idle proxies.
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
