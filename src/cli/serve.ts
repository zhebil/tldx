/**
 * `tldsl serve <file>`: watch a `.tldsl` file, recompile on save, push the
 * result over SSE, and host the viewer bundle that consumes it. The
 * composition root (`cli/main.ts`) wires real adapters and calls into
 * `runServe`; this module owns the wiring of transport + dev-server +
 * `watchAndServe` and exposes a teardown handle that the CLI ties to
 * SIGINT.
 *
 * Per CONTEXT.md "Per-use-case dependency structs": serve's deps superset
 * the watch-and-serve struct with the SSE transport's `clock`, plus the
 * dev-server bundle dir and an injectable `openBrowser`. The dev HTTP
 * server has no port (CONTEXT.md "Dev HTTP server | No port"); we compose
 * it directly here.
 *
 * Lifecycle:
 * - `runServe` resolves once the dev server has bound a port AND the
 *   initial compile has pushed (via `watchAndServe`'s `ready`). The
 *   returned handle's `close()` tears watcher → transport → server down in
 *   that order; idempotent. The CLI parks on SIGINT/SIGTERM and calls it.
 * - On infra failure during boot (`startDevServer` throws), already-created
 *   resources are torn down before the error propagates so the caller does
 *   not need to clean up.
 *
 * Overlay-write opt-out (tldsl-jwh): `deps.fsWrite` is optional. Omitting it
 * disables the overlay round-trip entirely for this server - `render`'s
 * ephemeral boot does this so a read-only export never writes a
 * `*.tldsl.overlay.json` sidecar. `tldsl serve` always wires a real one.
 */

import { watchAndServe, type WatchAndServeHandle } from "../app/watch-and-serve.js";
import type { ClockPort } from "../app/ports/clock.js";
import type { ExecutePort } from "../app/ports/execute.js";
import type { FsReadPort, FsWritePort } from "../app/ports/fs.js";
import type { LogPort } from "../app/ports/log.js";
import type { WatchPort } from "../app/ports/watch.js";
import type { LayoutPort } from "../domain/ports/layout.js";
import { startDevServer } from "../infra/devserver/dev-server.js";
import { createSseTransport } from "../infra/transport/sse-transport.js";

export type ServeIo = {
  writeStdout: (chunk: string) => void;
  writeStderr: (chunk: string) => void;
};

export type ServeDeps = {
  fs: FsReadPort;
  /** Enables the overlay round-trip when present. Omit for a read-only server (see module docs). */
  fsWrite?: FsWritePort;
  watch: WatchPort;
  layout: LayoutPort;
  execute: ExecutePort;
  log: LogPort;
  clock: ClockPort;
  /** Directory containing the built viewer bundle (must contain index.html). */
  viewerBundleDir: string;
  /**
   * Best-effort browser launcher. The CLI wires the real
   * `infra/open-browser` adapter; tests pass a no-op (or a spy). Omit to
   * skip browser launch entirely.
   */
  openBrowser?: (url: string) => void;
  /** Bind host. Defaults to `127.0.0.1` so MVP serves localhost only. */
  host?: string;
  /** Bind port. `0` (default) lets the OS pick an ephemeral port. */
  port?: number;
};

export type RunServeArgs = {
  path: string;
  deps: ServeDeps;
  io: ServeIo;
};

export type ServeHandle = {
  /** Convenience URL pointing at the viewer's index. */
  readonly url: string;
  /** Resolved TCP port the dev server bound. */
  readonly port: number;
  /**
   * Tear down watcher, transport, and dev server. Idempotent - subsequent
   * calls return the original outcome.
   */
  close(): Promise<void>;
};

export async function runServe(args: RunServeArgs): Promise<ServeHandle> {
  const { path, deps, io } = args;

  const transport = createSseTransport({ clock: deps.clock });

  // `startDevServer` is created before `watchAndServe`, but its
  // `onOverlayPut` callback needs the watch handle - hold a mutable box the
  // route handler closes over rather than reordering the two (the dev
  // server has to be up first so `runServe` can report its bound port).
  const watchBox: { current?: WatchAndServeHandle } = {};

  let server;
  try {
    server = await startDevServer({
      port: deps.port ?? 0,
      ...(deps.host !== undefined ? { host: deps.host } : {}),
      viewerBundleDir: deps.viewerBundleDir,
      transport,
      onOverlayPut: async (snapshot) => {
        await watchBox.current?.putOverlay(snapshot);
      },
    });
  } catch (err) {
    await transport.close();
    throw err;
  }

  const watch = watchAndServe(path, {
    fs: deps.fs,
    ...(deps.fsWrite !== undefined ? { fsWrite: deps.fsWrite } : {}),
    watch: deps.watch,
    layout: deps.layout,
    execute: deps.execute,
    transport,
    log: deps.log,
  });
  watchBox.current = watch;

  try {
    await watch.ready;
  } catch (err) {
    await watch.close();
    await transport.close();
    await server.close();
    throw err;
  }

  io.writeStdout(`tldsl serving ${path} on ${server.url}\n`);

  if (deps.openBrowser !== undefined) {
    deps.openBrowser(server.url);
  }

  let closing: Promise<void> | undefined;
  return {
    url: server.url,
    port: server.port,
    close(): Promise<void> {
      return (closing ??= (async () => {
        await watch.close();
        await transport.close();
        await server.close();
      })());
    },
  };
}
