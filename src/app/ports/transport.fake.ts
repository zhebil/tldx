/**
 * `InMemoryTransport` - canonical fake for `TransportPort`. Records every
 * pushed message and exposes a synthetic `subscribe()` that reproduces the
 * real adapter's last-message replay.
 */

import type { SceneMessage } from "../../contracts/scene-message.js";

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
   * Simulate a viewer connecting. The returned `received` array grows as
   * messages are pushed, starting with the cached most-recent message.
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

  activeSubscribers(): number {
    return this.subs.filter((s) => !s.closed).length;
  }

  lastMessage(): SceneMessage | undefined {
    return this.last;
  }
}
