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
 *
 * Compile tracking (tldsl-usr, tldsl-46n): every successful compile re-hashes
 * the source and records it via `infra/serve-registry`'s `touchServeCompile`,
 * so a later `tldsl render` that reuses this server can tell whether it's
 * still serving what's on disk. `ServeHandle.compile` carries the same
 * hash/timestamp from the initial compile so the CLI can seed the registry
 * record atomically at boot (no window where a reuser sees a hash-less
 * record). Both are no-ops if this file was never registered - `render`'s
 * own ephemeral servers never call `recordServe`, so the touch harmlessly
 * finds no record to update.
 *
 * Idle-TTL reaper (tldsl-kts): `deps.ttlMinutes` (default 60; `0` disables)
 * feeds `app/idle-reaper.ts`'s `createIdleReaper`, which owns the "no
 * activity for N minutes" timer via `deps.clock`. This is the one place
 * every activity signal converges - dev-server HTTP requests (any page
 * load, asset, overlay `PUT`, SSE connect, or viewer heartbeat, all behind
 * `onActivity`) and file-change-triggered recompiles (the `watch/recompile-ok`
 * log tap below, gated to `trigger === "change"` so the initial boot compile
 * doesn't itself count as "activity") - so this is where the reaper is wired
 * rather than in `app/` (which never sees HTTP) or `infra/devserver`
 * (which never sees compiles). On expiry it logs one line and resolves
 * `ServeHandle.idleExpired`; `cli/main.ts` races that against SIGINT/SIGTERM
 * and closes the handle the same way either way.
 */

import { createIdleReaper } from "../app/idle-reaper.js";
import { watchAndServe, type WatchAndServeHandle } from "../app/watch-and-serve.js";
import type { ClockPort } from "../app/ports/clock.js";
import type { ExecutePort } from "../app/ports/execute.js";
import type { FsReadPort, FsWritePort } from "../app/ports/fs.js";
import type { LogPort } from "../app/ports/log.js";
import type { WatchPort } from "../app/ports/watch.js";
import type { LayoutPort } from "../domain/ports/layout.js";
import { startDevServer } from "../infra/devserver/dev-server.js";
import { hashSource, touchServeCompile } from "../infra/serve-registry/serve-registry.js";
import { createSseTransport } from "../infra/transport/sse-transport.js";

const DEFAULT_TTL_MINUTES = 60;

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
  /**
   * Idle-TTL in minutes before the server exits itself (tldsl-kts).
   * Defaults to 60. `0` disables the reaper - the server runs until killed.
   */
  ttlMinutes?: number;
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
   * Source hash/timestamp as of the initial compile - `undefined` hash if
   * the initial read/compile failed. Lets the caller seed the serve-registry
   * record with a compile hash at boot, atomically (see module docs).
   */
  readonly compile: { hash: string | undefined; at: number };
  /**
   * Resolves once the idle-TTL reaper fires (tldsl-kts) - never, if
   * `ttlMinutes` is `0`. The reaper has already logged the reason by the
   * time this resolves; the caller (`cli/main.ts`) just needs to close the
   * handle, same as on SIGINT/SIGTERM.
   */
  readonly idleExpired: Promise<void>;
  /**
   * Tear down watcher, transport, and dev server. Idempotent - subsequent
   * calls return the original outcome.
   */
  close(): Promise<void>;
};

async function readHashSafe(fs: FsReadPort, path: string): Promise<string | undefined> {
  try {
    return hashSource(await fs.read(path));
  } catch {
    return undefined;
  }
}

export async function runServe(args: RunServeArgs): Promise<ServeHandle> {
  const { path, deps, io } = args;

  const transport = createSseTransport({ clock: deps.clock });

  const ttlMinutes = deps.ttlMinutes ?? DEFAULT_TTL_MINUTES;
  let resolveIdleExpired: () => void;
  const idleExpired = new Promise<void>((resolve) => {
    resolveIdleExpired = resolve;
  });
  const reaper = createIdleReaper({
    clock: deps.clock,
    ttlMs: ttlMinutes * 60_000,
    onExpire: () => {
      deps.log.log({
        level: "info",
        code: "serve/idle-timeout",
        msg: `no activity for ${ttlMinutes}m; exiting`,
        fields: { ttlMinutes },
      });
      resolveIdleExpired();
    },
  });

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
      onActivity: () => reaper.bump(),
    });
  } catch (err) {
    reaper.stop();
    await transport.close();
    throw err;
  }

  // Re-hashes and records the source on every successful compile (not just
  // the initial one) so a `tldsl render` reusing this server later can
  // detect staleness. Harmless no-op when `path` was never registered
  // (`recordServe` not called - e.g. render's own ephemeral boot).
  const log: LogPort = {
    log: (event) => {
      deps.log.log(event);
      if (event.code === "watch/recompile-ok") {
        // Only a file-change-triggered recompile counts as activity - the
        // initial boot compile isn't "someone doing something" (tldsl-kts).
        if (event.fields?.trigger === "change") reaper.bump();
        void readHashSafe(deps.fs, path).then((hash) => {
          if (hash !== undefined) touchServeCompile(path, hash, deps.clock.now());
        });
      }
    },
  };

  const watch = watchAndServe(path, {
    fs: deps.fs,
    ...(deps.fsWrite !== undefined ? { fsWrite: deps.fsWrite } : {}),
    watch: deps.watch,
    layout: deps.layout,
    execute: deps.execute,
    transport,
    log,
  });
  watchBox.current = watch;

  try {
    await watch.ready;
  } catch (err) {
    reaper.stop();
    await watch.close();
    await transport.close();
    await server.close();
    throw err;
  }

  const compile = { hash: await readHashSafe(deps.fs, path), at: deps.clock.now() };

  io.writeStdout(`tldsl serving ${path} on ${server.url}\n`);

  if (deps.openBrowser !== undefined) {
    deps.openBrowser(server.url);
  }

  let closing: Promise<void> | undefined;
  return {
    url: server.url,
    port: server.port,
    compile,
    idleExpired,
    close(): Promise<void> {
      return (closing ??= (async () => {
        reaper.stop();
        await watch.close();
        await transport.close();
        await server.close();
      })());
    },
  };
}
