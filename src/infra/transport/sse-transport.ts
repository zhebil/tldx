/**
 * Real `TransportPort` adapter on Server-Sent Events. It hosts no HTTP server
 * of its own; it exposes `handler(req, res)` for the dev server to mount on
 * `/events`. Each push is one JSON `data:` event; on connect the stream emits
 * a `: ok` comment, then replays the per-page cache (see `transport-replay`),
 * so a reloaded viewer gets every served diagram back, not just the one that
 * compiled most recently.
 *
 * The recurring `: ping` comment is a transport-level keepalive against idle
 * proxies and sleeping laptops, distinct from the `kind="ping"` SceneMessage,
 * which is an app-level signal pushed via `push()`. It reschedules through
 * `ClockPort.setTimer` rather than `setInterval` so `FakeClock` can drive it.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import type { ClockPort, TimerHandle } from "../../app/ports/clock.js";
import { createReplayCache } from "../../app/ports/transport-replay.js";
import { TransportClosedError, type TransportPort } from "../../app/ports/transport.js";
import type { SceneMessage } from "../../contracts/scene-message.js";

export interface SseTransport extends TransportPort {
  /**
   * HTTP handler for the SSE endpoint. The dev server routes requests for
   * `/events` here. Holds the response open and streams subsequent pushes
   * until the client disconnects or `close()` is called on the transport.
   */
  handler(req: IncomingMessage, res: ServerResponse): void;
}

export interface CreateSseTransportOptions {
  /** Clock used to schedule per-client heartbeat writes. */
  clock: ClockPort;
  /**
   * Interval in milliseconds between `: ping` comment writes for each
   * connected client. Defaults to 15000ms. Must be > 0.
   */
  heartbeatMs?: number;
}

interface Client {
  res: ServerResponse;
  closed: boolean;
  heartbeat: TimerHandle | undefined;
}

const HEARTBEAT_FRAME = ": ping\n\n";

function format(message: SceneMessage): string {
  return `data: ${JSON.stringify(message)}\n\n`;
}

export function createSseTransport(options: CreateSseTransportOptions): SseTransport {
  const { clock } = options;
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  if (heartbeatMs <= 0) {
    throw new Error("createSseTransport: heartbeatMs must be > 0");
  }

  const clients = new Set<Client>();
  const replay = createReplayCache();
  let closed = false;

  function dropClient(client: Client): void {
    if (client.closed) return;
    client.closed = true;
    client.heartbeat?.cancel();
    client.heartbeat = undefined;
    clients.delete(client);
  }

  function scheduleHeartbeat(client: Client): void {
    if (client.closed || closed) return;
    client.heartbeat = clock.setTimer(heartbeatMs, () => {
      if (client.closed || closed) return;
      try {
        client.res.write(HEARTBEAT_FRAME);
      } catch {
        // Broken pipe: drop the client, same policy as `push`.
        dropClient(client);
        return;
      }
      scheduleHeartbeat(client);
    });
  }

  return {
    push(message: SceneMessage): void {
      if (closed) throw new TransportClosedError();
      replay.record(message);
      const wire = format(message);
      for (const client of clients) {
        if (client.closed) continue;
        try {
          client.res.write(wire);
        } catch {
          // Broken pipe / slow consumer: drop this client and keep going.
          dropClient(client);
        }
      }
    },

    subscriberCount(): number {
      return clients.size;
    },

    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      for (const client of [...clients]) {
        dropClient(client);
        try {
          client.res.end();
          // `end()` alone can leave the keep-alive socket parked during serve shutdown.
          client.res.destroy();
        } catch {
          // Already torn down by the network side; nothing to do.
        }
      }
    },

    handler(req: IncomingMessage, res: ServerResponse): void {
      if (closed) {
        res.writeHead(503).end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      // Sentinel so subscribers can wait for "stream ready" before any push.
      // EventSource ignores comments, so the viewer never sees it.
      res.write(": ok\n\n");

      const client: Client = { res, closed: false, heartbeat: undefined };
      clients.add(client);

      for (const message of replay.replay()) {
        try {
          res.write(format(message));
        } catch {
          dropClient(client);
          return;
        }
      }

      const cleanup = (): void => dropClient(client);
      req.on("close", cleanup);
      req.on("error", cleanup);
      res.on("error", cleanup);

      scheduleHeartbeat(client);
    },
  };
}
