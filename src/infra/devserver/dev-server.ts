/**
 * Dev HTTP server for `tldsl serve`. Owns the HTTP listener that hosts both
 * the static viewer bundle and the SSE endpoint at `/events` fed by the
 * passed `TransportPort`. Per CONTEXT.md there is intentionally no
 * `DevServerPort` - one impl, no test variation. The CLI composes this
 * directly with `createSseTransport()`; HTTP/SSE wiring stays here, never
 * leaks into `cli/`.
 *
 * Implementation: Hono + `@hono/node-server`. Hono handles the static-bundle
 * routing (file lookup, MIME, SPA fallback to index.html, traversal rejection,
 * 405 on non-GET/HEAD). The SSE endpoint at `/events` bypasses Hono entirely:
 * it is intercepted on the underlying `node:http` server before Hono's request
 * listener runs, and the raw `(req, res)` are handed to `transport.handler` so
 * the SSE adapter keeps full control of headers, keepalive, and teardown.
 *
 * The transport is expected to expose `handler(req, res)` (the shape
 * implemented by `infra/transport/sse-transport.ts`); we accept any object
 * with that shape rather than importing the concrete adapter, so this module
 * stays in `infra/` without reaching back into another adapter.
 *
 * Static serving rules:
 * - GET `/` resolves to `<viewerBundleDir>/index.html`.
 * - Files under `viewerBundleDir` are served with the standard MIME table.
 * - Unknown paths fall back to `index.html` (SPA route fallback) so client-
 *   side routing does not 404 on hard reload.
 * - Path traversal (`..`) is rejected with `403` before any disk access.
 *
 * Method handling:
 * - Only `GET` and `HEAD` are supported. Everything else gets `405`.
 *
 * Lifecycle:
 * - `startDevServer` resolves once the listener is bound. The returned
 *   `port` is the actual TCP port (resolved from `0` when the caller asks
 *   for an ephemeral port).
 * - `close()` closes the underlying server and is idempotent.
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
 * Detect path-traversal attempts (`..` segments or repeated slashes) in a
 * URL path. Hono's `serveStatic` already rejects these by falling through
 * to `next()`, but we want a hard `403` rather than the SPA fallback for
 * traversal, which is unambiguously hostile.
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

function buildApp(bundleRoot: string): Hono {
  const app = new Hono();

  // 405 for anything other than GET/HEAD on any path. Registering this
  // before the static handlers means non-GET requests never reach disk.
  app.all("*", async (c, next) => {
    const method = c.req.method;
    if (method !== "GET" && method !== "HEAD") {
      return c.body(null, 405, { Allow: "GET, HEAD" });
    }
    await next();
  });

  // Reject path traversal up front with 403. `serveStatic` would otherwise
  // silently fall through to the SPA fallback for these paths.
  app.use("*", async (c, next) => {
    if (looksLikeTraversal(c.req.path)) {
      return c.body(null, 403);
    }
    await next();
  });

  // Static bundle. `root` is absolute - the warning in serveStatic's docs
  // about "absolute paths not supported" is stale; the implementation uses
  // path.join, which handles absolute roots fine.
  app.use(
    "*",
    serveStatic({
      root: bundleRoot,
      // `serveStatic` joins root + request path. With root="/abs/dir" and
      // path="/index.html", join yields "/abs/dir/index.html" - correct.
      rewriteRequestPath: (p) => (p === "/" ? "/index.html" : p),
    }),
  );

  // SPA fallback: anything the static handler did not serve falls through
  // here and gets index.html, so client-side routing survives a hard reload.
  app.get("*", async (c, next) =>
    serveStatic({ root: bundleRoot, path: "index.html" })(c, next),
  );

  return app;
}

/**
 * Wrap Hono's request listener with a pre-check that diverts `/events`
 * straight to the transport. Hono never sees those requests; the transport
 * owns the response stream.
 */
function makeRootListener(
  honoListener: RequestListener,
  transport: DevServerTransportHandler,
): RequestListener {
  return (req, res) => {
    const url = req.url ?? "/";
    // Strip query/hash before comparing.
    const pathOnly = url.split(/[?#]/, 1)[0] ?? "/";
    if (pathOnly === "/events") {
      transport.handler(req, res);
      return;
    }
    honoListener(req, res);
  };
}

export async function startDevServer(
  options: StartDevServerOptions,
): Promise<DevServerHandle> {
  const host = options.host ?? "127.0.0.1";
  const bundleRoot = resolve(options.viewerBundleDir);

  const app = buildApp(bundleRoot);

  // Use `@hono/node-server`'s `createServer` hook so we can wrap its request
  // listener with our `/events` interceptor. This is the documented escape
  // hatch (`Options.createServer`) - we pass our own factory that calls
  // node's `createHttpServer` with the wrapped listener.
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
        createServer: ((
          _serverOptions: ServerOptions,
          listener: RequestListener,
        ): Server => {
          const wrapped = makeRootListener(listener, options.transport);
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
    // Should be unreachable for a TCP listener; defensive so callers get a
    // typed handle and not `any`.
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
