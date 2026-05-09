/**
 * `InMemoryTransport` - canonical fake for `TransportPort`. Records every
 * pushed message for assertions and exposes a synthetic `subscribe()` so
 * integration tests can verify what the viewer would have observed. The
 * real SSE adapter is held to the same scenarios in `transport.contract.ts`.
 */

import type { SceneMessage } from "../../contracts/scene-message.js";

import { TransportClosedError, type TransportPort } from "./transport.js";

interface FakeSubscription {
  received: SceneMessage[];
  closed: boolean;
}

/** Handle returned by `InMemoryTransport.subscribe`. */
export interface InMemorySubscription {
  /** Messages received in push order, including any cached replay on connect. */
  readonly received: SceneMessage[];
  close(): Promise<void>;
}

export class InMemoryTransport implements TransportPort {
  /** Every message ever pushed, in order. Test assertions read this directly. */
  readonly pushed: SceneMessage[] = [];
  private readonly subs: FakeSubscription[] = [];
  private last: SceneMessage | undefined;
  private closed = false;

  push(message: SceneMessage): void {
    if (this.closed) throw new TransportClosedError();
    this.pushed.push(message);
    this.last = message;
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
   * Test helper - simulate a viewer connecting. Returns a handle whose
   * `received` array grows as messages are pushed; the cached most-recent
   * message is delivered immediately on connect.
   */
  subscribe(): InMemorySubscription {
    const sub: FakeSubscription = { received: [], closed: this.closed };
    if (!this.closed && this.last !== undefined) sub.received.push(this.last);
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

  /** Test helper - count active (un-closed) subscribers. */
  activeSubscribers(): number {
    return this.subs.filter((s) => !s.closed).length;
  }

  /** Test helper - the most recent message, if any. */
  lastMessage(): SceneMessage | undefined {
    return this.last;
  }
}
