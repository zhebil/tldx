/**
 * `tldx serve <file>`: watch a `.tldx` file, recompile on save, push the
 * result over SSE, and host the viewer bundle that consumes it.
 *
 * One server holds many diagrams. The first `serve` in a project starts it and
 * stays in the foreground owning every watcher; later `serve` invocations hand
 * their file to it over `POST /diagrams` and exit. Each diagram is a page in
 * the shared viewer, with its own watcher, compile and overlay sidecar - see
 * `app/watch-and-serve.ts`.
 *
 * Only the `.tldx.jsx` entries are watched - edits to the compiler source
 * itself need a restart, which the staleness checks below only warn about.
 */

import { randomUUID } from "node:crypto";
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
  pageKeyFor,
  type ServeClaim,
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
  /**
   * Registry slot this server owns. Present for a real `tldx serve`; absent for
   * the private server `tldx render` boots, which nobody should discover.
   */
  claim?: ServeClaim;
};

export type RunServeArgs = {
  path: string;
  deps: ServeDeps;
  io: ServeIo;
};

/** Compile state of one diagram as of its last successful compile. */
export type DiagramCompile = { hash: string | undefined; at: number; codeFingerprint: number };

export type AddedDiagram = {
  pageKey: string;
  /** Page name as compiled - the `<Doc title>` or the file name. */
  name?: string;
  /** True when this file was already being served, so nothing was added. */
  alreadyServed: boolean;
  /** Whether a viewer was connected when this diagram was added. */
  hasViewer: boolean;
};

export type ServeHandle = {
  /** URL of the viewer's index. */
  readonly url: string;
  /** Resolved TCP port the dev server bound. */
  readonly port: number;
  /** Secret required on this server's write endpoints. */
  readonly token: string;
  /** Idle timeout this server was started with, in minutes. */
  readonly ttlMinutes: number;
  /**
   * Source hash/timestamp as of the initial compile (`undefined` hash if that
   * read/compile failed) plus the compiler code's fingerprint at boot, so the
   * caller can seed the registry record atomically.
   */
  readonly compile: DiagramCompile;
  /**
   * Resolves once the idle-TTL reaper fires; never if `ttlMinutes` is `0`.
   * The reaper has already logged the reason by then.
   */
  readonly idleExpired: Promise<void>;
  /** Start serving another diagram as its own page. Idempotent per file. */
  addDiagram(file: string): Promise<AddedDiagram>;
  /** Whether any viewer is currently connected. */
  hasViewer(): boolean;
  /** Tear down every watcher, the transport, and the dev server. Idempotent. */
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

/** The viewer URL that opens straight onto one diagram's page. */
export function pageUrl(serverUrl: string, pageKey: string): string {
  return `${serverUrl}#page=${pageKey}`;
}

export async function runServe(args: RunServeArgs): Promise<ServeHandle> {
  const { path, deps, io } = args;
  const bootCodeFingerprint = codeFingerprint(dirname(fileURLToPath(import.meta.url)));

  const transport = createSseTransport({ clock: deps.clock });
  // The claim owns the token when there is one - it must, since it publishes
  // the token before this server exists. Without a claim (render's private
  // server, tests) the server still mints one: the write endpoints are gated
  // unconditionally, so "no token" must never mean "no gate".
  const token = deps.claim?.token ?? randomUUID();

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

  /** Every diagram this server holds, keyed by page key. */
  const diagrams = new Map<string, { file: string; watch: WatchAndServeHandle }>();

  let server;
  try {
    server = await startDevServer({
      port: deps.port ?? 0,
      ...(deps.host !== undefined ? { host: deps.host } : {}),
      viewerBundleDir: deps.viewerBundleDir,
      transport,
      token,
      onOverlayPut: async (pageKey, snapshot) => {
        await diagrams.get(pageKey)?.watch.putOverlay(snapshot);
      },
      onAddDiagram: (file) => addDiagram(file),
      onActivity: () => reaper.bump(),
    });
  } catch (err) {
    reaper.stop();
    await transport.close();
    throw err;
  }

  /**
   * Per-diagram log wrapper. It re-hashes the source on every successful
   * compile so a later `tldx render` reusing this server can detect staleness,
   * tags every line with the page it came from - output for a diagram you did
   * not start is otherwise unattributable - and warns once if the compiler's
   * own code moved under the running server.
   */
  let warnedCodeStale = false;
  const logFor = (file: string, pageKey: string): LogPort => ({
    log: (event) => {
      deps.log.log({ ...event, fields: { ...event.fields, pageKey, file } });
      if (event.code !== "watch/recompile-ok") return;
      // Only a file-change-triggered recompile counts as activity; the
      // initial boot compile does not.
      if (event.fields?.trigger === "change") reaper.bump();
      void readHashSafe(deps.fs, file).then((hash) => {
        if (hash !== undefined) deps.claim?.touchCompile(file, hash, deps.clock.now());
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
    },
  });

  async function addDiagram(file: string): Promise<AddedDiagram> {
    const pageKey = pageKeyFor(file);
    const hasViewer = transport.subscriberCount() > 0;
    const existing = diagrams.get(pageKey);
    if (existing !== undefined) {
      return {
        pageKey,
        ...(existing.watch.pageName() !== undefined ? { name: existing.watch.pageName()! } : {}),
        alreadyServed: true,
        hasViewer,
      };
    }

    const watch = watchAndServe(file, {
      pageKey,
      fs: deps.fs,
      ...(deps.fsWrite !== undefined ? { fsWrite: deps.fsWrite } : {}),
      watch: deps.watch,
      layout: deps.layout,
      execute: deps.execute,
      transport,
      log: logFor(file, pageKey),
    });
    diagrams.set(pageKey, { file, watch });

    try {
      await watch.ready;
    } catch (err) {
      diagrams.delete(pageKey);
      await watch.close();
      throw err;
    }

    const hash = await readHashSafe(deps.fs, file);
    const name = watch.pageName();
    deps.claim?.addDiagram(file, {
      pageKey,
      ...(name !== undefined ? { name } : {}),
      ...(hash !== undefined ? { hash, compiledAt: deps.clock.now() } : {}),
    });
    return { pageKey, ...(name !== undefined ? { name } : {}), alreadyServed: false, hasViewer };
  }

  let firstCompile: DiagramCompile;
  try {
    await addDiagram(path);
    firstCompile = {
      hash: await readHashSafe(deps.fs, path),
      at: deps.clock.now(),
      codeFingerprint: bootCodeFingerprint,
    };
  } catch (err) {
    reaper.stop();
    await transport.close();
    await server.close();
    throw err;
  }

  io.writeStdout(`tldx serving ${path} on ${server.url}\n`);

  const viewerWarning = viewerStalenessWarning(deps.viewerBundleDir);
  if (viewerWarning !== undefined) {
    deps.log.log({ level: "warn", code: "serve/viewer-stale", msg: viewerWarning, fields: {} });
  }

  if (deps.openBrowser !== undefined) {
    deps.openBrowser(pageUrl(server.url, pageKeyFor(path)));
  }

  let closing: Promise<void> | undefined;
  return {
    url: server.url,
    port: server.port,
    token,
    ttlMinutes,
    compile: firstCompile,
    idleExpired,
    addDiagram,
    hasViewer: () => transport.subscriberCount() > 0,
    close(): Promise<void> {
      return (closing ??= (async () => {
        reaper.stop();
        for (const { watch } of diagrams.values()) await watch.close();
        diagrams.clear();
        await transport.close();
        await server.close();
      })());
    },
  };
}
