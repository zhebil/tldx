#!/usr/bin/env node
/**
 * `tldx` CLI entry point and composition root: the only place real adapters
 * meet use cases. Subcommands and their usage lines live in `commands` below.
 */

import { existsSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createSystemClock } from "../infra/clock/system-clock.js";
import { createJsxExecute } from "../infra/execute-jsx/execute-jsx.js";
import { createChokidarWatch } from "../infra/fs/chokidar-watch.js";
import { createNodeFsRead } from "../infra/fs/node-fs-read.js";
import { createNodeFsWrite } from "../infra/fs/node-fs-write.js";
import { gitStatus } from "../infra/git/git-status.js";
import { ElkLayoutAdapter } from "../infra/layout-elk/elk-layout.js";
import { createStderrLog } from "../infra/log/stderr-log.js";
import { openBrowser } from "../infra/open-browser/open-browser.js";
import {
  claimServer,
  findServer,
  newestMtimeMs,
  projectRootFor,
  type ServeRecord,
} from "../infra/serve-registry/serve-registry.js";

import { runAbsorbCli } from "./absorb.js";
import { runCheck, type CheckIo } from "./check.js";
import { runMeasure } from "./measure.js";
import { runOverlayCli } from "./overlay.js";
import { runRender } from "./render.js";
import { handOff } from "./serve-handoff.js";
import { pageUrl, runServe } from "./serve.js";
import { runVerifyCli } from "./verify.js";

type CliIo = CheckIo;

type Command = {
  name: string;
  args: string;
  description: string;
  run: (rest: readonly string[], io: CliIo) => number | Promise<number>;
};

type ParsedInvocation =
  | { kind: "help"; explicit: boolean }
  | { kind: "command"; name: string; rest: readonly string[] };

/**
 * The built viewer bundle dir, resolved relative to this source file so it
 * does not depend on cwd. The dev server 404s gracefully if it is empty.
 */
function defaultViewerBundleDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "dist", "viewer");
}

/**
 * A tab is opened when nobody is looking at this server yet. A live record only
 * proves a server is up, not that a viewer is connected to it - the server
 * reports the latter, since only it can see its SSE clients.
 */
export function shouldOpenBrowser(noOpen: boolean, hasViewer: boolean): boolean {
  return !noOpen && !hasViewer;
}

/**
 * Give `path` to an already-running server and return this process's exit
 * code. The server owns the watcher from here on, so there is nothing left for
 * this process to do.
 */
async function handOffTo(
  live: ServeRecord,
  path: string,
  opts: { noOpen: boolean; ttlMinutes: number | undefined },
  io: { writeStdout: (chunk: string) => void },
): Promise<number> {
  const added = await handOff(live, path);
  const page = added.name !== undefined ? ` as page "${added.name}"` : "";
  io.writeStdout(
    added.alreadyServed
      ? `tldx serve: already serving ${path}${page} at ${live.url}\n`
      : `tldx serve: added ${path}${page} to the server at ${live.url}\n`,
  );
  if (opts.ttlMinutes !== undefined && opts.ttlMinutes !== live.ttlMinutes) {
    io.writeStdout(
      `tldx serve: --ttl ignored; server already running with ttl ${String(live.ttlMinutes)}m\n`,
    );
  }
  if (shouldOpenBrowser(opts.noOpen, added.hasViewer)) {
    openBrowser(pageUrl(live.url, added.pageKey));
  }
  return 0;
}

/**
 * Detects a `dist/` built from an older `src/` than what's on disk, so a
 * command missing only from a stale build doesn't just look unknown. Silent
 * unless running the compiled `dist/cli/main.js` from a checkout that still
 * has `src/` beside `dist/`. `here` is injectable for tests.
 */
export function distStalenessHint(
  here: string = dirname(fileURLToPath(import.meta.url)),
): string | undefined {
  if (basename(resolve(here, "..")) !== "dist") return undefined;
  const srcDir = resolve(here, "..", "..", "src");
  if (!existsSync(srcDir)) return undefined;
  try {
    const builtAt = statSync(resolve(here, "main.js")).mtimeMs;
    if (newestMtimeMs(srcDir) > builtAt) {
      return "dist/ looks stale (src/ has changed since the last build) - run `npm run build`";
    }
  } catch {
    // best-effort
  }
  return undefined;
}

/**
 * Parks the process until the user signals shutdown or the handle's idle-TTL
 * reaper fires. Either way: close the handle and exit 0.
 */
async function awaitShutdown(handle: {
  close(): Promise<void>;
  idleExpired: Promise<void>;
}): Promise<number> {
  return new Promise<number>((resolveCode) => {
    let resolving = false;
    const finish = (code: number): void => {
      if (resolving) return;
      resolving = true;
      handle.close().then(
        () => resolveCode(code),
        () => resolveCode(1),
      );
    };
    process.once("SIGINT", () => finish(0));
    process.once("SIGTERM", () => finish(0));
    void handle.idleExpired.then(() => finish(0));
  });
}

/**
 * Parse `tldx serve`'s args: `<file> [--no-open] [--ttl <minutes>]`. `--ttl`
 * consumes the next token, so the positional scan for `path` skips it.
 */
export function parseServeArgs(rest: readonly string[]): {
  path: string | undefined;
  noOpen: boolean;
  ttlMinutes: number | undefined;
  error: string | undefined;
} {
  const noOpen = rest.includes("--no-open");
  let ttlMinutes: number | undefined;
  let path: string | undefined;
  let error: string | undefined;
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === "--ttl") {
      const raw = rest[i + 1];
      i++;
      const n = raw === undefined ? NaN : Number(raw);
      if (!Number.isFinite(n) || n < 0) {
        error = "tldx serve: --ttl requires a non-negative number of minutes";
      } else {
        ttlMinutes = n;
      }
      continue;
    }
    if (arg?.startsWith("--")) continue;
    if (path === undefined) path = arg;
  }
  return { path, noOpen, ttlMinutes, error };
}

const commands: readonly Command[] = [
  {
    name: "check",
    args: "<file>",
    description: "parse and validate a single .tldx.jsx file",
    run: (rest, io) => {
      const path = rest[0];
      if (path === undefined) {
        io.writeStderr("tldx check: missing <file> argument\n");
        return 1;
      }
      return runCheck({
        path,
        deps: {
          fs: createNodeFsRead(),
          layout: new ElkLayoutAdapter(),
          execute: createJsxExecute(),
        },
        io,
      });
    },
  },
  {
    name: "absorb",
    args: "<file> [--force]",
    description: "fold a diagram's overlay back into its JSX source",
    run: (rest, io) => {
      const force = rest.includes("--force");
      const path = rest.find((arg) => !arg.startsWith("--"));
      if (path === undefined) {
        io.writeStderr("tldx absorb: missing <file> argument\n");
        return 1;
      }
      return runAbsorbCli({
        path,
        force,
        deps: {
          fs: createNodeFsRead(),
          fsWrite: createNodeFsWrite(),
          layout: new ElkLayoutAdapter(),
          execute: createJsxExecute(),
          gitStatus,
        },
        io,
      });
    },
  },
  {
    name: "serve",
    args: "<file> [--no-open] [--ttl <minutes>]",
    description:
      "watch a .tldx or .tldx.jsx file and serve the live viewer locally (default --ttl 60; 0 disables)",
    run: async (rest, io) => {
      const { path, noOpen, ttlMinutes, error } = parseServeArgs(rest);
      if (error !== undefined) {
        io.writeStderr(`${error}\n`);
        return 1;
      }
      if (path === undefined) {
        io.writeStderr("tldx serve: missing <file> argument\n");
        return 1;
      }
      try {
        // A server already up for this project takes the diagram; this process
        // prints where it landed and exits, leaving that server's terminal the
        // only one holding watchers.
        const live = findServer(path);
        if (live !== undefined) {
          return await handOffTo(live, path, { noOpen, ttlMinutes }, io);
        }

        // Claim the slot BEFORE binding a port, so two invocations racing from
        // cold cannot both end up listening. The loser hands off instead.
        const claim = claimServer(projectRootFor(path));
        if (claim === undefined) {
          const winner = findServer(path);
          if (winner === undefined) {
            io.writeStderr("tldx serve: another server is starting for this project; retry\n");
            return 1;
          }
          return await handOffTo(winner, path, { noOpen, ttlMinutes }, io);
        }

        try {
          const handle = await runServe({
            path,
            deps: {
              fs: createNodeFsRead(),
              fsWrite: createNodeFsWrite(),
              watch: createChokidarWatch(),
              layout: new ElkLayoutAdapter(),
              execute: createJsxExecute(),
              log: createStderrLog(),
              clock: createSystemClock(),
              viewerBundleDir: defaultViewerBundleDir(),
              claim,
              // A server this process just started has no viewer connected, so
              // the tab opens unless the user said not to.
              ...(shouldOpenBrowser(noOpen, false) ? { openBrowser } : {}),
              ...(ttlMinutes !== undefined ? { ttlMinutes } : {}),
            },
            io,
          });
          claim.publish(handle.url, handle.compile.codeFingerprint, handle.ttlMinutes);
          return await awaitShutdown({
            close: async () => {
              await handle.close();
              claim.release();
            },
            idleExpired: handle.idleExpired,
          });
        } catch (err) {
          claim.release();
          throw err;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        io.writeStderr(`tldx serve: ${msg}\n`);
        return 1;
      }
    },
  },
  {
    name: "render",
    args: "<file> <out.png> [options]",
    description: "export the compiled diagram as an image, cropped to content",
    run: (rest, io) =>
      runRender({
        argv: rest,
        deps: {
          fs: createNodeFsRead(),
          // No fsWrite: render is read-only and must never write an overlay
          // sidecar. runRender strips it defensively too.
          watch: createChokidarWatch(),
          layout: new ElkLayoutAdapter(),
          execute: createJsxExecute(),
          log: createStderrLog(),
          clock: createSystemClock(),
          viewerBundleDir: defaultViewerBundleDir(),
        },
        io,
      }),
  },
  {
    name: "verify",
    args: "<file>",
    description: "pass/fail: does the JSX source alone reproduce the overlay's canvas?",
    run: (rest, io) => {
      const path = rest[0];
      if (path === undefined) {
        io.writeStderr("tldx verify: missing <file> argument\n");
        return 1;
      }
      return runVerifyCli({
        path,
        deps: {
          fs: createNodeFsRead(),
          layout: new ElkLayoutAdapter(),
          execute: createJsxExecute(),
        },
        io,
      });
    },
  },
  {
    name: "overlay",
    args: "show <file>",
    description: "report what's pending in a diagram's overlay",
    run: (rest, io) =>
      runOverlayCli({
        argv: rest,
        deps: {
          fs: createNodeFsRead(),
          layout: new ElkLayoutAdapter(),
          execute: createJsxExecute(),
        },
        io,
      }),
  },
  {
    name: "measure",
    args: "<file> [--frame <id>]",
    description: "print each shape's id, size, and position",
    run: (rest, io) =>
      runMeasure({
        argv: rest,
        deps: {
          fs: createNodeFsRead(),
          layout: new ElkLayoutAdapter(),
          execute: createJsxExecute(),
        },
        io,
      }),
  },
];

function parseArgs(argv: readonly string[]): ParsedInvocation {
  const [head, ...rest] = argv;
  if (head === undefined) return { kind: "help", explicit: false };
  if (head === "--help" || head === "-h") return { kind: "help", explicit: true };
  return { kind: "command", name: head, rest };
}

function buildUsage(cmds: readonly Command[]): string {
  const lines = ["usage: tldx <command> [args]", "", "commands:"];
  const width = Math.max(...cmds.map((c) => `${c.name} ${c.args}`.length));
  for (const c of cmds) {
    const head = `${c.name} ${c.args}`.padEnd(width);
    lines.push(`  ${head}   ${c.description}`);
  }
  return lines.join("\n");
}

export async function main(argv: readonly string[], io: CliIo): Promise<number> {
  const usage = buildUsage(commands);
  const parsed = parseArgs(argv);

  if (parsed.kind === "help") {
    io.writeStdout(`${usage}\n`);
    return parsed.explicit ? 0 : 1;
  }

  const cmd = commands.find((c) => c.name === parsed.name);
  if (cmd === undefined) {
    const hint = distStalenessHint();
    const hintLine = hint !== undefined ? `${hint}\n` : "";
    io.writeStderr(`tldx: unknown command: ${parsed.name}\n${hintLine}${usage}\n`);
    return 1;
  }

  return cmd.run(parsed.rest, io);
}

function isEntrypoint(): boolean {
  if (
    typeof process === "undefined" ||
    !Array.isArray(process.argv) ||
    process.argv[1] === undefined
  ) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1]);
  } catch {
    return resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
  }
}

const isEntry = isEntrypoint();

if (isEntry) {
  const io: CliIo = {
    writeStdout: (chunk) => process.stdout.write(chunk),
    writeStderr: (chunk) => process.stderr.write(chunk),
  };
  void main(process.argv.slice(2), io).then((code) => {
    process.exitCode = code;
  });
}
