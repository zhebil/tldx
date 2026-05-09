/**
 * Real `TransportPort` adapter on top of Server-Sent Events. The transport
 * does NOT host its own HTTP server - it exposes a `handler(req, res)` that
 * the dev server (`infra/devserver/`) mounts on `/events`. This keeps the
 * HTTP wiring in one place and lets the transport be reused if the dev
 * server is replaced.
 *
 * Wire format: each pushed message is JSON-serialized and emitted as a
 * single SSE `data:` event (one line, no `event:` field - the envelope's
 * `kind` already discriminates). On connect the server emits a `: ok`
 * comment so subscribers can detect that the stream is live, then replays
 * the most recently pushed message (last-wins replay; see TransportPort
 * docs).
 *
 * Heartbeat: each connected client gets a recurring `: ping` SSE comment
 * write at `heartbeatMs` intervals (default 15s). This is a transport-level
 * keepalive that prevents idle proxies / sleeping laptops from killing the
 * connection. Comments are ignored by EventSource consumers, so the viewer
 * never sees them. This is DISTINCT from the `kind="ping"` SceneMessage
 * envelope, which is an app-level signal pushed via `push()`. The schedule
 * is driven by `ClockPort.setTimer` in a self-rescheduling loop (no native
 * `setInterval`) so tests with `FakeClock` can drive heartbeats deterministically.
 */

import type { IncomingMessage, ServerResponse } from "node:http";

import type { ClockPort, TimerHandle } from "../../app/ports/clock.js";
import {
  TransportClosedError,
  type TransportPort,
} from "../../app/ports/transport.js";
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

export function createSseTransport(
  options: CreateSseTransportOptions,
): SseTransport {
  const { clock } = options;
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  if (heartbeatMs <= 0) {
    throw new Error("createSseTransport: heartbeatMs must be > 0");
  }

  const clients = new Set<Client>();
  let last: SceneMessage | undefined;
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
        // Broken pipe: drop client; keepalive failures are not the use
        // case's concern. Same policy as `push`.
        dropClient(client);
        return;
      }
      scheduleHeartbeat(client);
    });
  }

  return {
    push(message: SceneMessage): void {
      if (closed) throw new TransportClosedError();
      last = message;
      const wire = format(message);
      for (const client of clients) {
        if (client.closed) continue;
        try {
          client.res.write(wire);
        } catch {
          // Broken pipe / slow consumer: drop this client and keep going.
          // Per-client failures are not the use case's concern.
          dropClient(client);
        }
      }
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
      // Sentinel comment so subscribers can wait for "stream ready" before
      // any push happens. Comments are valid SSE per the spec and are
      // ignored by EventSource consumers.
      res.write(": ok\n\n");

      const client: Client = { res, closed: false, heartbeat: undefined };
      clients.add(client);

      if (last !== undefined) {
        try {
          res.write(format(last));
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
