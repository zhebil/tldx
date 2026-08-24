import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

import { FakeClock } from "../../app/ports/clock.fake.js";
import {
  runTransportContract,
  type TransportHarness,
  type TransportSubscription,
} from "../../app/ports/transport.contract.js";
import type { SceneMessage } from "../../contracts/scene-message.js";

import { createSseTransport } from "./sse-transport.js";

interface ActiveSub {
  controller: AbortController;
}

runTransportContract(
  "createSseTransport",
  async (): Promise<TransportHarness> => {
    // FakeClock that's never advanced - heartbeats stay pending and never
    // fire during contract scenarios, keeping them deterministic.
    const clock = new FakeClock();
    const transport = createSseTransport({ clock, heartbeatMs: 15_000 });
    const server: Server = createServer((req, res) => {
      transport.handler(req, res);
    });
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const addr = server.address();
    if (addr === null || typeof addr === "string") {
      throw new Error("expected AddressInfo from server.address()");
    }
    const url = `http://127.0.0.1:${String((addr as AddressInfo).port)}/events`;
    const subs: ActiveSub[] = [];

    return {
      port: transport,
      subscribe: async (): Promise<TransportSubscription> => {
        const controller = new AbortController();
        const received: SceneMessage[] = [];
        const response = await fetch(url, { signal: controller.signal });
        if (response.body === null) {
          throw new Error("SSE response had no body");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        let resolveReady!: () => void;
        let rejectReady!: (err: Error) => void;
        const ready = new Promise<void>((resolve, reject) => {
          resolveReady = resolve;
          rejectReady = reject;
        });
        let opened = false;

        const consume = async (): Promise<void> => {
          try {
            for (;;) {
              const { value, done } = await reader.read();
              if (done) return;
              buf += decoder.decode(value, { stream: true });
              let idx = buf.indexOf("\n\n");
              while (idx >= 0) {
                const event = buf.slice(0, idx);
                buf = buf.slice(idx + 2);
                if (event.startsWith(":")) {
                  if (!opened) {
                    opened = true;
                    resolveReady();
                  }
                } else {
                  const dataLines = event.split("\n").filter((l) => l.startsWith("data: "));
                  if (dataLines.length > 0) {
                    const data = dataLines.map((l) => l.slice("data: ".length)).join("\n");
                    received.push(JSON.parse(data) as SceneMessage);
                  }
                }
                idx = buf.indexOf("\n\n");
              }
            }
          } catch (err) {
            if (controller.signal.aborted) return;
            if (!opened) {
              rejectReady(err instanceof Error ? err : new Error(String(err)));
            }
          }
        };
        void consume();
        await ready;

        subs.push({ controller });
        return {
          received,
          close: async () => {
            controller.abort();
          },
        };
      },
      dispose: async () => {
        for (const s of subs) s.controller.abort();
        await transport.close();
        await new Promise<void>((resolve, reject) => {
          server.close((err) => {
            if (err !== null && err !== undefined) reject(err);
            else resolve();
          });
        });
      },
    };
  },
  { eventTimeoutMs: 5000 },
);
