/**
 * `tldx serve <file>`: watch a `.tldx` file, recompile on save, push the
 * result over SSE, and host the viewer bundle that consumes it.
 *
 * Only the `.tldx.jsx` entry is watched - edits to the compiler source
 * itself need a restart, which the staleness checks below only warn about.
 */

import { existsSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createIdleReaper } from "../app/idle-reaper.js";
import { watchAndServe, type WatchAndServeHandle } from "../app/watch-and-serve.js";
import type { ClockPort } from "../app/ports/clock.js";
import type { ExecutePort } from "../app/ports/execute.js";
import type { FsReadPort, FsWritePort } from "../app/ports/fs.js";
import type { LogPort } from "../app/ports/log.js";
import type { WatchPort } from "../app/ports/watch.js";
import type { LayoutPort } from "../domain/ports/layout.js";
import { startDevServer } from "../infra/devserver/dev-server.js";
import {
  codeFingerprint,
  hashSource,
  newestMtimeMs,
  touchServeCompile,
} from "../infra/serve-registry/serve-registry.js";
import { createSseTransport } from "../infra/transport/sse-transport.js";

const DEFAULT_TTL_MINUTES = 60;

export type ServeIo = {
  writeStdout: (chunk: string) => void;
  writeStderr: (chunk: string) => void;
};

export type ServeDeps = {
  fs: FsReadPort;
  /** Enables the overlay round-trip when present. Omit for a read-only server. */
  fsWrite?: FsWritePort;
  watch: WatchPort;
  layout: LayoutPort;
  execute: ExecutePort;
  log: LogPort;
  clock: ClockPort;
  /** Directory containing the built viewer bundle (must contain index.html). */
  viewerBundleDir: string;
  /** Best-effort browser launcher. Omit to skip browser launch entirely. */
  openBrowser?: (url: string) => void;
  /** Bind host. Defaults to `127.0.0.1`. */
  host?: string;
  /** Bind port. `0` (default) lets the OS pick an ephemeral port. */
  port?: number;
  /** Minutes of inactivity before the server exits itself. Defaults to 60; `0` disables. */
  ttlMinutes?: number;
};

export type RunServeArgs = {
  path: string;
  deps: ServeDeps;
  io: ServeIo;
};

export type ServeHandle = {
  /** URL of the viewer's index. */
  readonly url: string;
  /** Resolved TCP port the dev server bound. */
  readonly port: number;
  /**
   * Source hash/timestamp as of the initial compile (`undefined` hash if that
   * read/compile failed) plus the compiler code's fingerprint at boot, so the
   * caller can seed the serve-registry record atomically.
   */
  readonly compile: { hash: string | undefined; at: number; codeFingerprint: number };
  /**
   * Resolves once the idle-TTL reaper fires; never if `ttlMinutes` is `0`.
   * The reaper has already logged the reason by then.
   */
  readonly idleExpired: Promise<void>;
  /** Tear down watcher, transport, and dev server. Idempotent. */
  close(): Promise<void>;
};

async function readHashSafe(fs: FsReadPort, path: string): Promise<string | undefined> {
  try {
    return hashSource(await fs.read(path));
  } catch {
    return undefined;
  }
}

/** Warns when `dist/viewer` predates its `src/viewer` sibling. `undefined` when there is no sibling to compare against. */
export function viewerStalenessWarning(viewerBundleDir: string): string | undefined {
  const distDir = resolve(viewerBundleDir, "..");
  if (basename(distDir) !== "dist") return undefined;
  const srcViewerDir = resolve(distDir, "..", "src", "viewer");
  if (!existsSync(srcViewerDir)) return undefined;
  if (newestMtimeMs(srcViewerDir) > newestMtimeMs(viewerBundleDir)) {
    return "dist/viewer looks stale (src/viewer has changed since the last build) - run `npm run build:viewer`";
  }
  return undefined;
}

export async function runServe(args: RunServeArgs): Promise<ServeHandle> {
  const { path, deps, io } = args;
  const bootCodeFingerprint = codeFingerprint(dirname(fileURLToPath(import.meta.url)));

  const transport = createSseTransport({ clock: deps.clock });

  const ttlMinutes = deps.ttlMinutes ?? DEFAULT_TTL_MINUTES;
  let resolveIdleExpired: () => void;
  const idleExpired = new Promise<void>((settle) => {
    resolveIdleExpired = settle;
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

  // The dev server must boot first so `runServe` can report its bound port,
  // but its `onOverlayPut` callback needs the watch handle. Box it.
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

  // Re-hash and record the source on every successful compile so a later
  // `tldx render` reusing this server can detect staleness. No-op when
  // `path` was never registered.
  let warnedCodeStale = false;
  const log: LogPort = {
    log: (event) => {
      deps.log.log(event);
      if (event.code === "watch/recompile-ok") {
        // Only a file-change-triggered recompile counts as activity; the
        // initial boot compile does not.
        if (event.fields?.trigger === "change") reaper.bump();
        void readHashSafe(deps.fs, path).then((hash) => {
          if (hash !== undefined) touchServeCompile(path, hash, deps.clock.now());
        });
        // The compiler code isn't watched, so this recompile is the cheapest
        // hook for noticing it moved since boot. Warn once; the fix is a restart.
        if (
          !warnedCodeStale &&
          codeFingerprint(dirname(fileURLToPath(import.meta.url))) > bootCodeFingerprint
        ) {
          warnedCodeStale = true;
          deps.log.log({
            level: "warn",
            code: "serve/code-stale",
            msg: "the code that compiled this scene (src/domain, src/app, ...) has changed since this server started - restart `tldx serve` to pick it up",
            fields: { bootCodeFingerprint },
          });
        }
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

  const compile = {
    hash: await readHashSafe(deps.fs, path),
    at: deps.clock.now(),
    codeFingerprint: bootCodeFingerprint,
  };

  io.writeStdout(`tldx serving ${path} on ${server.url}\n`);

  const viewerWarning = viewerStalenessWarning(deps.viewerBundleDir);
  if (viewerWarning !== undefined) {
    deps.log.log({ level: "warn", code: "serve/viewer-stale", msg: viewerWarning, fields: {} });
  }

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
