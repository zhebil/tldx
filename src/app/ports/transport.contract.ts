/**
 * Contract suite for `TransportPort`, run by both the `InMemoryTransport`
 * fake and the real SSE adapter, so a fake that drifts fails.
 *
 * The harness owns the subscriber side: the fake calls `subscribe()`
 * directly, the SSE harness opens an HTTP stream. Both return a `received`
 * array appended to as messages arrive.
 */

import { describe, it, expect } from "vitest";

import { pageRecord, sceneJson, sceneMessage } from "../../contracts/builders.js";
import type { SceneMessage } from "../../contracts/scene-message.js";

import type { TransportPort } from "./transport.js";

export interface TransportSubscription {
  /** Messages received in push order, appended to as they arrive. */
  readonly received: SceneMessage[];
  close(): Promise<void>;
}

export interface TransportHarness {
  port: TransportPort;
  /**
   * Subscribe to the transport. Resolves once the subscription is wired up
   * end-to-end, so a `port.push()` made after `await subscribe()` is
   * guaranteed to reach this subscriber.
   */
  subscribe(): Promise<TransportSubscription>;
  dispose(): Promise<void>;
}

async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  if (!predicate()) {
    throw new Error(`waitFor: predicate did not become true within ${String(timeoutMs)}ms`);
  }
}

export function runTransportContract(
  label: string,
  make: () => Promise<TransportHarness>,
  options: { eventTimeoutMs?: number } = {},
): void {
  const timeout = options.eventTimeoutMs ?? 2000;

  describe(`TransportPort contract: ${label}`, () => {
    it("delivers a pushed message to a connected subscriber", async () => {
      const h = await make();
      try {
        const sub = await h.subscribe();
        try {
          const msg = sceneMessage.scene("pageA", sceneJson([]));
          h.port.push(msg);
          await waitFor(() => sub.received.length >= 1, timeout);
          expect(sub.received[0]).toEqual(msg);
        } finally {
          await sub.close();
        }
      } finally {
        await h.dispose();
      }
    });

    it("delivers multiple messages in push order", async () => {
      const h = await make();
      try {
        const sub = await h.subscribe();
        try {
          const m1 = sceneMessage.scene("pageA", sceneJson([]));
          const m2 = sceneMessage.error("pageA", [
            { severity: "error", code: "test/x", message: "boom" },
          ]);
          const m3 = sceneMessage.ping();
          h.port.push(m1);
          h.port.push(m2);
          h.port.push(m3);
          await waitFor(() => sub.received.length >= 3, timeout);
          expect(sub.received).toEqual([m1, m2, m3]);
        } finally {
          await sub.close();
        }
      } finally {
        await h.dispose();
      }
    });

    it("replays the most recent scene of each page, in the order pages were first pushed", async () => {
      const h = await make();
      try {
        const stale = sceneMessage.scene("pageA", sceneJson([]));
        const a = sceneMessage.scene("pageA", sceneJson([pageRecord({ id: "page:a" })]));
        const b = sceneMessage.scene("pageB", sceneJson([pageRecord({ id: "page:b" })]));
        h.port.push(stale);
        h.port.push(b);
        h.port.push(a);
        const sub = await h.subscribe();
        try {
          await waitFor(() => sub.received.length >= 2, timeout);
          expect(sub.received).toEqual([a, b]);
        } finally {
          await sub.close();
        }
      } finally {
        await h.dispose();
      }
    });

    it("replays a page's last good scene followed by its outstanding error", async () => {
      const h = await make();
      try {
        const scene = sceneMessage.scene("pageA", sceneJson([]));
        const error = sceneMessage.error("pageA", [
          { severity: "error", code: "test/x", message: "boom" },
        ]);
        h.port.push(scene);
        h.port.push(error);
        const sub = await h.subscribe();
        try {
          await waitFor(() => sub.received.length >= 2, timeout);
          expect(sub.received).toEqual([scene, error]);
        } finally {
          await sub.close();
        }
      } finally {
        await h.dispose();
      }
    });

    it("a successful scene clears that page's replayed error", async () => {
      const h = await make();
      try {
        const scene = sceneMessage.scene("pageA", sceneJson([]));
        h.port.push(scene);
        h.port.push(
          sceneMessage.error("pageA", [{ severity: "error", code: "test/x", message: "boom" }]),
        );
        h.port.push(scene);
        const sub = await h.subscribe();
        try {
          await waitFor(() => sub.received.length >= 1, timeout);
          await new Promise((r) => setTimeout(r, 50));
          expect(sub.received).toEqual([scene]);
        } finally {
          await sub.close();
        }
      } finally {
        await h.dispose();
      }
    });

    it("replays nothing for a page that was never pushed, and never replays a ping", async () => {
      const h = await make();
      try {
        h.port.push(sceneMessage.ping());
        const sub = await h.subscribe();
        try {
          await new Promise((r) => setTimeout(r, 100));
          expect(sub.received).toEqual([]);
        } finally {
          await sub.close();
        }
      } finally {
        await h.dispose();
      }
    });

    it("reports how many subscribers are connected", async () => {
      const h = await make();
      try {
        expect(h.port.subscriberCount()).toBe(0);
        const a = await h.subscribe();
        await waitFor(() => h.port.subscriberCount() === 1, timeout);
        const b = await h.subscribe();
        await waitFor(() => h.port.subscriberCount() === 2, timeout);
        await b.close();
        await waitFor(() => h.port.subscriberCount() === 1, timeout);
        await a.close();
        await waitFor(() => h.port.subscriberCount() === 0, timeout);
      } finally {
        await h.dispose();
      }
    });

    it("fans a single push out to multiple subscribers", async () => {
      const h = await make();
      try {
        const a = await h.subscribe();
        const b = await h.subscribe();
        try {
          const msg = sceneMessage.scene("pageA", sceneJson([]));
          h.port.push(msg);
          await waitFor(() => a.received.length >= 1 && b.received.length >= 1, timeout);
          expect(a.received[0]).toEqual(msg);
          expect(b.received[0]).toEqual(msg);
        } finally {
          await a.close();
          await b.close();
        }
      } finally {
        await h.dispose();
      }
    });

    it("stops delivering to a subscriber after it closes", async () => {
      const h = await make();
      try {
        const sub = await h.subscribe();
        await sub.close();
        const before = sub.received.length;
        h.port.push(sceneMessage.ping());
        // give the implementation a moment to NOT deliver
        await new Promise((r) => setTimeout(r, 100));
        expect(sub.received.length).toBe(before);
      } finally {
        await h.dispose();
      }
    });
  });
}
