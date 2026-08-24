/**
 * Transport port: broadcasts `SceneMessage`s to subscribed viewers.
 *
 * Every scene and error names the page it belongs to, because one server serves
 * several diagrams into one viewer. Implementations must cache, per page, the most
 * recent scene and the most recent error, and replay them to a new subscriber
 * on connect - scene first, then error - so a viewer that opens (or reloads)
 * after the first compile sees every served diagram, and sees a broken one as
 * its last good render behind its diagnostics. A successful scene clears that
 * page's cached error; a `ping` is a keepalive and is never cached.
 *
 * Already-connected subscribers receive every message in push order.
 * Per-subscriber failures (broken pipe, slow consumer) are absorbed by the
 * implementation, never seen by the caller.
 */

import type { SceneMessage } from "../../contracts/scene-message.js";

export interface TransportPort {
  /**
   * Broadcast `message` to every active subscriber. The message carries the
   * page it belongs to. Throws if the transport has been closed - the caller
   * is expected to stop pushing once it issues `close()`.
   */
  push(message: SceneMessage): void;

  /**
   * Number of subscribers currently connected. `tldx serve` uses it to decide
   * whether serving another diagram should open a browser tab: a live record
   * proves a server is up, not that anyone is looking at it.
   */
  subscriberCount(): number;

  /**
   * Stop accepting new messages and tear down all active subscriptions.
   * Idempotent: calling twice is safe and resolves the second time too.
   */
  close(): Promise<void>;
}

/** Thrown by `push` if the transport has already been closed. */
export class TransportClosedError extends Error {
  readonly code = "TRANSPORT_CLOSED" as const;
  constructor() {
    super("transport is closed");
    this.name = "TransportClosedError";
  }
}
