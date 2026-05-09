/**
 * Transport port. The use case (`watchAndServe`) calls `push(message)` on
 * every successful compile (`kind="scene"`) or build failure
 * (`kind="error"`). The viewer subscribes to the underlying transport (SSE
 * for MVP) and renders each message as it arrives.
 *
 * Last-message replay: implementations cache the most recently pushed
 * message and deliver it to new subscribers immediately on connect, so a
 * viewer that opens after the first compile still sees the current scene
 * without waiting for the next file change. Already-connected subscribers
 * receive every message in push order. Per-subscriber transport failures
 * (broken pipe, slow consumer) are absorbed by the implementation; the use
 * case does not see them.
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
