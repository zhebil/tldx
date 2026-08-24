/**
 * Contract suite for `TransportPort`, run by both the `InMemoryTransport`
 * fake and the real SSE adapter, so a fake that drifts fails.
 *
 * The harness owns the subscriber side: the fake calls `subscribe()`
 * directly, the SSE harness opens an HTTP stream. Both return a `received`
 * array appended to as messages arrive.
 */

import { describe, it, expect } from "vitest";

import { sceneJson, sceneMessage } from "../../contracts/builders.js";
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
          const msg = sceneMessage.scene(sceneJson([]));
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
          const m1 = sceneMessage.scene(sceneJson([]));
          const m2 = sceneMessage.error([{ severity: "error", code: "test/x", message: "boom" }]);
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

    it("replays the most recent message to a late subscriber", async () => {
      const h = await make();
      try {
        const m1 = sceneMessage.scene(sceneJson([]));
        const m2 = sceneMessage.ping();
        h.port.push(m1);
        h.port.push(m2);
        const sub = await h.subscribe();
        try {
          await waitFor(() => sub.received.length >= 1, timeout);
          expect(sub.received[0]).toEqual(m2);
          expect(sub.received).toHaveLength(1);
        } finally {
          await sub.close();
        }
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
          const msg = sceneMessage.scene(sceneJson([]));
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
