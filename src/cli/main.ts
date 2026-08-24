#!/usr/bin/env node
/**
 * `tldx` CLI entry point. Composition root: wires real adapters
 * (NodeFs, ChokidarWatch, ElkLayoutAdapter, JsxExecute, SystemClock,
 * StderrLog, openBrowser) and dispatches subcommands. Per CONTEXT.md, this
 * is the ONLY place real adapters meet use cases.
 *
 * Subcommands:
 *   tldx check <file>   Validate a single `.tldx.jsx` file. Exits non-zero
 *                        on compile errors. Files not ending in `.tldx.jsx`
 *                        are accepted silently with exit 0 (PostToolUse
 *                        hook).
 *   tldx serve <file>   Watch the file, recompile on save, push the scene
 *                        to a local viewer over SSE. Stays alive until
 *                        SIGINT/SIGTERM.
 *   tldx render <file> <out.png>   Export the compiled diagram as an
 *                        image, cropped to content. Reuses a running
 *                        `tldx serve` for the file if one is recorded,
 *                        otherwise boots an ephemeral one.
 *   tldx verify <file>  Pass/fail: does the JSX source alone reproduce
 *                        what the overlay says the canvas looked like?
 *   tldx overlay show <file>   Report what's pending in a diagram's
 *                        overlay.
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
import { findServe, newestMtimeMs, recordServe } from "../infra/serve-registry/serve-registry.js";

import { runAbsorbCli } from "./absorb.js";
import { runCheck, type CheckIo } from "./check.js";
import { runMeasure } from "./measure.js";
import { runOverlayCli } from "./overlay.js";
import { runRender } from "./render.js";
import { runServe } from "./serve.js";
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
 * Resolve the built viewer bundle dir relative to this source file. With
 * `src/cli/main.ts` here and `dist/viewer/` at the repo root, walking two
 * directories up lands at the repo root regardless of cwd. Vite builds
 * write `index.html` and assets there; the dev server 404s gracefully if
 * the dir is empty (e.g. user ran `serve` before `npm run build:viewer`).
 */
function defaultViewerBundleDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, "..", "..", "dist", "viewer");
}

/**
 * A restart shouldn't pile up browser tabs (tldx-69w): if a live
 * `tldx serve` is already recorded for this file, a tab already points at
 * it, so this invocation should not open a second one - independent of
 * whether the user passed `--no-open`.
 */
export function shouldOpenBrowser(noOpen: boolean, live: { readonly pid: number } | undefined): boolean {
  return !noOpen && live === undefined;
}

/**
 * Detects a `dist/` built from an older `src/` than what's on disk - the
 * failure mode behind tldx-ppj: `overlay`/`verify` existed in source but a
 * stale build made them print "unknown command" instead of running. Only
 * fires when actually running the compiled `dist/cli/main.js` (not `tsx
 * src/cli/main.ts` in dev, where "stale" would be a false positive since
 * there is no build to be behind) and only in a dev checkout that still has
 * `src/` next to `dist/` - an installed package ships `dist/` alone.
 *
 * `here` defaults to this running file's own directory but is injectable so
 * tests can point it at a throwaway `dist/cli` + `src/` fixture instead of
 * mtime-racing the real repo.
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
 * Parked-process resolver. `runServe` returns a handle but the CLI must
 * stay alive until the user signals shutdown, OR (tldx-kts) the handle's
 * idle-TTL reaper decides no one's home. Either way the outcome is the
 * same: close the handle and exit 0 - the reaper has already logged its
 * own reason by the time `idleExpired` resolves.
 */
async function awaitShutdown(handle: { close(): Promise<void>; idleExpired: Promise<void> }): Promise<number> {
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
 * Parse `tldx serve`'s args: `<file> [--no-open] [--ttl <minutes>]`.
 * `--ttl` takes its value from the following token so the plain positional
 * scan for `path` (any non-`--` token) must skip it explicitly.
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
    description: "watch a .tldx or .tldx.jsx file and serve the live viewer locally (default --ttl 60; 0 disables)",
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
        const live = findServe(path);
        const openThisTime = shouldOpenBrowser(noOpen, live);
        if (!openThisTime && !noOpen && live !== undefined) {
          io.writeStdout(`tldx serve: a server for ${path} is already live at ${live.url}; not opening another tab\n`);
        }
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
            ...(openThisTime ? { openBrowser } : {}),
            ...(ttlMinutes !== undefined ? { ttlMinutes } : {}),
          },
          io,
        });
        const forgetServe = recordServe(path, handle.url, handle.compile);
        return await awaitShutdown({
          close: async () => {
            await handle.close();
            forgetServe();
          },
          idleExpired: handle.idleExpired,
        });
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
          // sidecar (tldx-jwh). runRender strips it defensively too, since
          // a reused server is a separate process this deps object doesn't
          // reach anyway.
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

// Run when invoked directly (not when imported by tests).
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
