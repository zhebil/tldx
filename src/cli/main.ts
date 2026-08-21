#!/usr/bin/env node
/**
 * `tldsl` CLI entry point. Composition root: wires real adapters
 * (NodeFs, ChokidarWatch, ElkLayoutAdapter, JsxExecute, SystemClock,
 * StderrLog, openBrowser) and dispatches subcommands. Per CONTEXT.md, this
 * is the ONLY place real adapters meet use cases.
 *
 * Subcommands:
 *   tldsl check <file>   Validate a single `.tldsl.jsx` file. Exits non-zero
 *                        on compile errors. Files not ending in `.tldsl.jsx`
 *                        are accepted silently with exit 0 (PostToolUse
 *                        hook).
 *   tldsl serve <file>   Watch the file, recompile on save, push the scene
 *                        to a local viewer over SSE. Stays alive until
 *                        SIGINT/SIGTERM.
 */

import { realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createSystemClock } from "../infra/clock/system-clock.js";
import { createJsxExecute } from "../infra/execute-jsx/execute-jsx.js";
import { createChokidarWatch } from "../infra/fs/chokidar-watch.js";
import { createNodeFsRead } from "../infra/fs/node-fs-read.js";
import { ElkLayoutAdapter } from "../infra/layout-elk/elk-layout.js";
import { createStderrLog } from "../infra/log/stderr-log.js";
import { openBrowser } from "../infra/open-browser/open-browser.js";

import { runCheck, type CheckIo } from "./check.js";
import { runServe } from "./serve.js";

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
 * Parked-process resolver. `runServe` returns a handle but the CLI must
 * stay alive until the user signals shutdown. We attach SIGINT and SIGTERM
 * handlers that tear the handle down and resolve `main`'s exit code.
 */
async function awaitShutdown(close: () => Promise<void>): Promise<number> {
  return new Promise<number>((resolveCode) => {
    let resolving = false;
    const onSignal = (): void => {
      if (resolving) return;
      resolving = true;
      close().then(
        () => resolveCode(0),
        () => resolveCode(1),
      );
    };
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
  });
}

const commands: readonly Command[] = [
  {
    name: "check",
    args: "<file>",
    description: "parse and validate a single .tldsl.jsx file",
    run: (rest, io) => {
      const path = rest[0];
      if (path === undefined) {
        io.writeStderr("tldsl check: missing <file> argument\n");
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
    name: "serve",
    args: "<file> [--no-open]",
    description: "watch a .tldsl or .tldsl.jsx file and serve the live viewer locally",
    run: async (rest, io) => {
      const noOpen = rest.includes("--no-open");
      const path = rest.find((arg) => !arg.startsWith("--"));
      if (path === undefined) {
        io.writeStderr("tldsl serve: missing <file> argument\n");
        return 1;
      }
      try {
        const handle = await runServe({
          path,
          deps: {
            fs: createNodeFsRead(),
            watch: createChokidarWatch(),
            layout: new ElkLayoutAdapter(),
            execute: createJsxExecute(),
            log: createStderrLog(),
            clock: createSystemClock(),
            viewerBundleDir: defaultViewerBundleDir(),
            ...(noOpen ? {} : { openBrowser }),
          },
          io,
        });
        return await awaitShutdown(() => handle.close());
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        io.writeStderr(`tldsl serve: ${msg}\n`);
        return 1;
      }
    },
  },
];

function parseArgs(argv: readonly string[]): ParsedInvocation {
  const [head, ...rest] = argv;
  if (head === undefined) return { kind: "help", explicit: false };
  if (head === "--help" || head === "-h") return { kind: "help", explicit: true };
  return { kind: "command", name: head, rest };
}

function buildUsage(cmds: readonly Command[]): string {
  const lines = ["usage: tldsl <command> [args]", "", "commands:"];
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
    io.writeStderr(`tldsl: unknown command: ${parsed.name}\n${usage}\n`);
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
