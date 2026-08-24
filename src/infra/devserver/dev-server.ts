/**
 * Dev HTTP server for `tldx serve`, on Hono + `@hono/node-server`: the static
 * viewer bundle plus the SSE endpoint at `/events`.
 *
 * `/events` bypasses Hono entirely. It is intercepted on the underlying
 * `node:http` server before Hono's request listener runs, and the raw
 * `(req, res)` go to `transport.handler`, so the SSE adapter keeps full
 * control of headers, keepalive and teardown.
 */

import {
  createServer as createHttpServer,
  type IncomingMessage,
  type RequestListener,
  type Server,
  type ServerOptions,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { resolve } from "node:path";

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

import type { SceneJSON } from "../../contracts/scene-json.js";

/** Subset of the SSE transport this server depends on. */
export interface DevServerTransportHandler {
  handler(req: IncomingMessage, res: ServerResponse): void;
}

export interface StartDevServerOptions {
  /**
   * TCP port to bind. Pass `0` to let the OS pick an ephemeral port; the
   * resolved port is exposed on the returned handle.
   */
  port: number;
  /** Directory containing the built viewer bundle (must contain index.html). */
  viewerBundleDir: string;
  /** Transport whose `/events` SSE handler this server mounts. */
  transport: DevServerTransportHandler;
  /**
   * Hostname to bind to. Defaults to `127.0.0.1` so MVP serves localhost
   * only (no surprise LAN exposure). Override (e.g. `0.0.0.0`) deliberately.
   */
  host?: string;
  /**
   * Handler for `PUT /overlay`, the viewer's canvas-edit round-trip. Omit to
   * 404 the route entirely.
   */
  onOverlayPut?: (snapshot: SceneJSON) => Promise<void>;
  /**
   * Called once per incoming request, before routing - static assets,
   * `PUT /overlay`, `/events` connects and `/heartbeat` pings all go through
   * here. Feeds the idle-TTL reaper in `cli/serve.ts`. Omit to skip activity
   * tracking entirely.
   */
  onActivity?: () => void;
}

export interface DevServerHandle {
  /** Resolved TCP port the server is listening on. */
  port: number;
  /** Resolved hostname the server is bound to. */
  host: string;
  /** Convenience URL pointing at the viewer's index. */
  url: string;
  /** Idempotently stop the listener. Resolves once fully shut down. */
  close(): Promise<void>;
}

/**
 * Detect path traversal (`..` segments or repeated slashes). `serveStatic`
 * merely falls through to `next()` on these, which would hand them the SPA
 * fallback; we want a hard `403` instead.
 */
function looksLikeTraversal(rawPath: string): boolean {
  let decoded: string;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch {
    return true;
  }
  return /(?:^|[/\\])\.{1,2}(?:$|[/\\])|[/\\]{2,}/.test(decoded);
}

function isSceneJsonLike(value: unknown): value is SceneJSON {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const store = record.store;
  const schema = record.schema;
  return (
    typeof store === "object" &&
    store !== null &&
    !Array.isArray(store) &&
    typeof schema === "object" &&
    schema !== null &&
    !Array.isArray(schema)
  );
}

function buildApp(
  bundleRoot: string,
  onOverlayPut: ((snapshot: SceneJSON) => Promise<void>) | undefined,
): Hono {
  const app = new Hono();

  // Must stay ahead of the blanket 405 guard below: Hono matches in
  // registration order and that guard returns without calling `next()`.
  // Exists only so the viewer's ping gets a cheap 204 instead of index.html.
  app.get("/heartbeat", (c) => c.body(null, 204));

  app.put("/overlay", async (c) => {
    if (onOverlayPut === undefined) return c.body(null, 404);
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.body(null, 400);
    }
    if (!isSceneJsonLike(body)) return c.body(null, 400);
    try {
      await onOverlayPut(body);
    } catch {
      return c.body(null, 500);
    }
    return c.body(null, 204);
  });

  // Ahead of the static handlers, so non-GET requests never reach disk.
  app.all("*", async (c, next) => {
    const method = c.req.method;
    if (method !== "GET" && method !== "HEAD") {
      return c.body(null, 405, { Allow: "GET, HEAD" });
    }
    await next();
  });

  // Reject traversal up front, before any disk access.
  app.use("*", async (c, next) => {
    if (looksLikeTraversal(c.req.path)) {
      return c.body(null, 403);
    }
    await next();
  });

  // `root` is absolute: serveStatic's docs warn against that, but the warning
  // is stale - the implementation uses path.join, which handles it fine.
  app.use(
    "*",
    serveStatic({
      root: bundleRoot,
      rewriteRequestPath: (p) => (p === "/" ? "/index.html" : p),
    }),
  );

  // SPA fallback, so client-side routing survives a hard reload.
  app.get("*", async (c, next) => serveStatic({ root: bundleRoot, path: "index.html" })(c, next));

  return app;
}

/**
 * Wrap Hono's request listener with a pre-check that diverts `/events` to the
 * transport. Hono never sees those requests; the transport owns the stream.
 */
function makeRootListener(
  honoListener: RequestListener,
  transport: DevServerTransportHandler,
  onActivity: (() => void) | undefined,
): RequestListener {
  return (req, res) => {
    onActivity?.();
    const url = req.url ?? "/";
    const pathOnly = url.split(/[?#]/, 1)[0] ?? "/";
    if (pathOnly === "/events") {
      transport.handler(req, res);
      return;
    }
    honoListener(req, res);
  };
}

export async function startDevServer(options: StartDevServerOptions): Promise<DevServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const bundleRoot = resolve(options.viewerBundleDir);

  const app = buildApp(bundleRoot, options.onOverlayPut);

  // `Options.createServer` is the documented hook for supplying our own
  // factory, which is how the `/events` interceptor gets to wrap the listener.
  const server: Server = await new Promise<Server>((resolveListen, rejectListen) => {
    let bound = false;
    const onError = (err: Error): void => {
      if (!bound) rejectListen(err);
    };
    const s = serve(
      {
        fetch: app.fetch,
        port: options.port,
        hostname: host,
        createServer: ((_serverOptions: ServerOptions, listener: RequestListener): Server => {
          const wrapped = makeRootListener(listener, options.transport, options.onActivity);
          return createHttpServer(wrapped);
        }) as unknown as typeof createHttpServer,
      },
      () => {
        bound = true;
        resolveListen(s as Server);
      },
    ) as Server;
    s.once("error", onError);
  });

  const addr = server.address();
  if (addr === null || typeof addr === "string") {
    // Unreachable for a TCP listener; keeps the returned handle typed.
    await new Promise<void>((r) => server.close(() => r()));
    throw new Error("dev server failed to bind a TCP socket");
  }
  const boundPort = (addr as AddressInfo).port;

  let closed = false;
  return {
    port: boundPort,
    host,
    url: `http://${host}:${String(boundPort)}/`,
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => {
          if (err !== null && err !== undefined) rejectClose(err);
          else resolveClose();
        });
      });
    },
  };
}
