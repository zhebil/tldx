/**
 * `InMemoryTransport` - canonical fake for `TransportPort`. Records every
 * pushed message and exposes a synthetic `subscribe()` that reproduces the
 * real adapter's last-message replay.
 */

import type { SceneMessage } from "../../contracts/scene-message.js";

import { createReplayCache, type ReplayCache } from "./transport-replay.js";
import { TransportClosedError, type TransportPort } from "./transport.js";

interface FakeSubscription {
  received: SceneMessage[];
  closed: boolean;
}

export interface InMemorySubscription {
  /** Messages received in push order, including any cached replay on connect. */
  readonly received: SceneMessage[];
  close(): Promise<void>;
}

export class InMemoryTransport implements TransportPort {
  /** Every message ever pushed, in order. */
  readonly pushed: SceneMessage[] = [];
  private readonly subs: FakeSubscription[] = [];
  private readonly replay: ReplayCache = createReplayCache();
  private closed = false;

  push(message: SceneMessage): void {
    if (this.closed) throw new TransportClosedError();
    this.pushed.push(message);
    this.replay.record(message);
    for (const sub of this.subs) {
      if (sub.closed) continue;
      sub.received.push(message);
    }
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const sub of this.subs) sub.closed = true;
  }

  /**
   * Simulate a viewer connecting. The returned `received` array grows as
   * messages are pushed, starting with the per-page replay.
   */
  subscribe(): InMemorySubscription {
    const sub: FakeSubscription = { received: [], closed: this.closed };
    if (!this.closed) sub.received.push(...this.replay.replay());
    this.subs.push(sub);
    return {
      get received() {
        return sub.received;
      },
      close: async () => {
        sub.closed = true;
      },
    };
  }

  subscriberCount(): number {
    return this.subs.filter((s) => !s.closed).length;
  }

  /** Messages pushed for one page, in order - the usual multi-page assertion. */
  messagesFor(pageKey: string): SceneMessage[] {
    return this.pushed.filter((m) => m.kind !== "ping" && m.pageKey === pageKey);
  }

  lastMessage(): SceneMessage | undefined {
    return this.pushed.at(-1);
  }
}
