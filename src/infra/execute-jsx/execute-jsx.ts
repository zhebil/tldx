/**
 * Real `ExecutePort` adapter: esbuild bundles a `.tldx.jsx` entry (from the
 * `source` string, not from disk - see the plugin below) and a fresh
 * `worker_threads` Worker runs the bundle, hard-terminated at a 2s budget.
 * See `docs/jsx-pivot.md` decisions 5, 7, 8, 12.
 */

import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath } from "node:url";
import { Worker } from "node:worker_threads";
import { SourceMap } from "node:module";

import { build, type BuildFailure, type Plugin } from "esbuild";

import { error, type Diagnostic, type SourceSpan } from "../../domain/diagnostics/index.js";
import type { AstNode } from "../../domain/parser/ast.js";
import type { ExecutePort, ExecuteResult } from "../../app/ports/execute.js";

const TIMEOUT_MS = 2000;

// Resolved extensionless so the same alias works from src/ (esbuild's
// resolver picks up .ts under vitest/tsx) and from dist/ (picks up .js).
const RUNTIME_DIR = fileURLToPath(new URL("../../runtime/", import.meta.url));

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function wrapperSource(path: string): string {
  return `import Diagram from ${JSON.stringify(path)};
import { parentPort } from "node:worker_threads";
try {
  parentPort.postMessage({ ok: true, ast: Diagram() });
} catch (err) {
  parentPort.postMessage({
    ok: false,
    message: String((err && err.message) || err),
    stack: String((err && err.stack) || ""),
  });
}
`;
}

// The bundle is handed to Module#_compile directly, under the entry file's
// own path as its filename - that's what makes every frame in a thrown
// stack trace read "<path>:<generatedLine>:<generatedColumn>", which is all
// threwDiagnostic() needs to find the frame to map through the sourcemap.
// setSourceMapsEnabled() is not required for that (we map manually with
// node:module's SourceMap), but costs nothing and improves any diagnostics
// Node itself prints if something goes wrong before postMessage.
const WORKER_BOOTSTRAP = `
process.setSourceMapsEnabled(true);
const { workerData } = require("node:worker_threads");
const Module = require("node:module");
const path = require("node:path");
const m = new Module(workerData.filename, null);
m.filename = workerData.filename;
m.paths = Module._nodeModulePaths(path.dirname(workerData.filename));
m._compile(workerData.code, workerData.filename);
`;

type WorkerMessage =
  | { ok: true; ast: unknown }
  | { ok: false; message: string; stack: string };

type BuildOk = { code: string; mapText: string; inputs: string[] };
type BuildOutcome = BuildOk | { diagnostics: Diagnostic[] };

export function createJsxExecute(): ExecutePort {
  return {
    async execute(source: string, path: string): Promise<ExecuteResult> {
      // esbuild requires an absolute `absWorkingDir` and resolves entry
      // points to absolute paths, so a relative `path` (what the CLI and the
      // PostToolUse hook pass) has to be resolved before anything reads it.
      // Every span this adapter returns is therefore absolute; `compileFile`
      // normalises them back to the caller's style.
      const entry = resolvePath(path);
      const built = await buildBundle(source, entry);
      if ("diagnostics" in built) return built;
      return runInWorker(built.code, built.mapText, entry, built.inputs);
    },
  };
}

async function buildBundle(source: string, path: string): Promise<BuildOutcome> {
  const dir = dirname(path);
  const entryFilter = new RegExp(`^${escapeRegExp(path)}$`);

  const entryPlugin: Plugin = {
    name: "tldx-entry",
    setup(build) {
      // The entry's *contents* come from `source`, but its resolved path
      // stays the real one - jsxDEV's `source.fileName` (and every span
      // downstream) depends on that, and it's what lets the same path
      // resolve to different sources on different calls (no on-disk read).
      build.onResolve({ filter: entryFilter }, (args) => ({
        path: args.path,
        namespace: "file",
      }));
      build.onLoad({ filter: entryFilter, namespace: "file" }, () => ({
        contents: source,
        loader: "jsx",
      }));
    },
  };

  try {
    const result = await build({
      stdin: {
        contents: wrapperSource(path),
        resolveDir: dir,
        sourcefile: "<tldx-entry>",
        loader: "js",
      },
      bundle: true,
      platform: "node",
      format: "cjs",
      write: false,
      metafile: true,
      sourcemap: "external",
      jsx: "automatic",
      jsxImportSource: "tldx",
      jsxDev: true,
      packages: "external",
      loader: { ".jsx": "jsx" },
      absWorkingDir: dir,
      // Only used to anchor metafile/sourcemap-relative paths - `write:
      // false` means nothing is ever written here.
      outfile: resolvePath(dir, "__tldx_bundle__.js"),
      alias: {
        tldx: resolvePath(RUNTIME_DIR, "index"),
        "tldx/jsx-runtime": resolvePath(RUNTIME_DIR, "jsx-runtime"),
        "tldx/jsx-dev-runtime": resolvePath(RUNTIME_DIR, "jsx-dev-runtime"),
      },
      logLevel: "silent",
      plugins: [entryPlugin],
    });

    const jsFile = result.outputFiles.find((f) => f.path.endsWith(".js"));
    const mapFile = result.outputFiles.find((f) => f.path.endsWith(".map"));
    if (!jsFile || !mapFile) {
      return {
        diagnostics: [
          error("runtime/compile", "esbuild produced no output", {
            file: path,
            line: 1,
            column: 1,
          }),
        ],
      };
    }

    const inputs = new Set<string>([path]);
    for (const relInput of Object.keys(result.metafile.inputs)) {
      if (relInput.endsWith("<tldx-entry>")) continue;
      inputs.add(resolvePath(dir, relInput));
    }

    return { code: jsFile.text, mapText: mapFile.text, inputs: [...inputs] };
  } catch (err) {
    return { diagnostics: compileDiagnostics(err, path, dir) };
  }
}

function isBuildFailure(err: unknown): err is BuildFailure {
  return err instanceof Error && Array.isArray((err as { errors?: unknown }).errors);
}

function compileDiagnostics(err: unknown, path: string, dir: string): Diagnostic[] {
  if (!isBuildFailure(err) || err.errors.length === 0) {
    const message = err instanceof Error ? err.message : String(err);
    return [error("runtime/compile", message, { file: path, line: 1, column: 1 })];
  }
  return err.errors.map((e) => {
    const span: SourceSpan = e.location
      ? {
          file: resolvePath(dir, e.location.file),
          line: e.location.line,
          column: e.location.column + 1,
        }
      : { file: path, line: 1, column: 1 };
    return error("runtime/compile", e.text, span);
  });
}

function runInWorker(
  code: string,
  mapText: string,
  path: string,
  inputs: string[],
): Promise<ExecuteResult> {
  return new Promise((resolve) => {
    const worker = new Worker(WORKER_BOOTSTRAP, {
      eval: true,
      workerData: { code, filename: path },
    });

    let settled = false;
    const finish = (result: ExecuteResult): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.removeAllListeners();
      void worker.terminate();
      resolve(result);
    };

    const timer = setTimeout(() => {
      finish({
        diagnostics: [
          error("runtime/timeout", "execution exceeded the 2s budget", {
            file: path,
            line: 1,
            column: 1,
          }),
        ],
      });
    }, TIMEOUT_MS);

    worker.on("message", (msg: WorkerMessage) => {
      if (msg.ok) {
        finish({ ast: msg.ast as AstNode, inputs });
      } else {
        finish({ diagnostics: [threwDiagnostic(msg.stack, path, mapText)] });
      }
    });

    worker.on("error", (err: Error) => {
      finish({
        diagnostics: [threwDiagnostic(err.stack ?? String(err), path, mapText)],
      });
    });

    worker.on("exit", (code) => {
      if (code !== 0) {
        finish({
          diagnostics: [
            error("runtime/threw", `worker exited with code ${String(code)}`, {
              file: path,
              line: 1,
              column: 1,
            }),
          ],
        });
      }
    });
  });
}

function threwDiagnostic(stack: string, path: string, mapText: string): Diagnostic {
  const span = mappedSpan(stack, path, mapText) ?? { file: path, line: 1, column: 1 };
  const message = stack.split("\n")[0] ?? "user code threw";
  return error("runtime/threw", message, span);
}

/** Finds the topmost frame inside the compiled bundle (frames carry `path`
 * as their filename - see WORKER_BOOTSTRAP) and maps it through the
 * sourcemap to the original file/line/column. `entry.originalSource` (when
 * present) is esbuild's source path relative to the entry's own directory -
 * see the `outfile`/`absWorkingDir` comments in `buildBundle` - so it's
 * resolved against `dirname(path)` to recover the imported file's path. */
function mappedSpan(stack: string, path: string, mapText: string): SourceSpan | undefined {
  let map: SourceMap;
  try {
    map = new SourceMap(JSON.parse(mapText));
  } catch {
    return undefined;
  }

  const dir = dirname(path);
  const frameRe = new RegExp(`${escapeRegExp(path)}:(\\d+):(\\d+)`);
  for (const line of stack.split("\n")) {
    const match = frameRe.exec(line);
    if (!match) continue;
    const generatedLine = Number(match[1]);
    const generatedColumn = Number(match[2]);
    const entry = map.findEntry(generatedLine - 1, generatedColumn - 1);
    if (!("originalLine" in entry)) continue;
    return {
      file: entry.originalSource ? resolvePath(dir, entry.originalSource) : path,
      line: entry.originalLine + 1,
      column: entry.originalColumn + 1,
    };
  }
  return undefined;
}
