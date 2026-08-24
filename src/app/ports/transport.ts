/**
 * Transport port: broadcasts `SceneMessage`s to subscribed viewers.
 *
 * Implementations must cache the most recently pushed message and deliver it
 * to new subscribers on connect, so a viewer that opens after the first
 * compile still sees the current scene. Already-connected subscribers receive
 * every message in push order. Per-subscriber failures (broken pipe, slow
 * consumer) are absorbed by the implementation, never seen by the caller.
 */

import type { SceneMessage } from "../../contracts/scene-message.js";

export interface TransportPort {
  /**
   * Broadcast `message` to every active subscriber. Throws if the transport
   * has been closed - the caller is expected to stop pushing once it issues
   * `close()`.
   */
  push(message: SceneMessage): void;

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
