import { describe, it, expect } from "vitest";

import { sceneJson, sceneMessage } from "../../contracts/builders.js";

import { runTransportContract, type TransportHarness } from "./transport.contract.js";
import { InMemoryTransport } from "./transport.fake.js";

runTransportContract("InMemoryTransport", async (): Promise<TransportHarness> => {
  const transport = new InMemoryTransport();
  return {
    port: transport,
    subscribe: async () => transport.subscribe(),
    dispose: async () => {
      await transport.close();
    },
  };
});

describe("InMemoryTransport (fake-specific affordances)", () => {
  it("records pushed messages on `pushed` for assertions", () => {
    const t = new InMemoryTransport();
    const m1 = sceneMessage.scene("pageA", sceneJson([]));
    const m2 = sceneMessage.ping();
    t.push(m1);
    t.push(m2);
    expect(t.pushed).toEqual([m1, m2]);
    expect(t.messagesFor("pageA")).toEqual([m1]);
  });

  it("subscriberCount tracks open subscriptions", async () => {
    const t = new InMemoryTransport();
    expect(t.subscriberCount()).toBe(0);
    const a = t.subscribe();
    const b = t.subscribe();
    expect(t.subscriberCount()).toBe(2);
    await a.close();
    expect(t.subscriberCount()).toBe(1);
    await b.close();
    expect(t.subscriberCount()).toBe(0);
  });

  it("push throws after close", async () => {
    const t = new InMemoryTransport();
    await t.close();
    expect(() => t.push(sceneMessage.ping())).toThrowError(
      expect.objectContaining({ code: "TRANSPORT_CLOSED" }),
    );
  });

  it("close is idempotent", async () => {
    const t = new InMemoryTransport();
    await t.close();
    await expect(t.close()).resolves.toBeUndefined();
  });
});
