/**
 * `tools/screenshot.mts <file.tldsl.jsx> <out.png> [options]` - thin wrapper
 * kept for this plan's other tasks that already shell out to this path. All
 * the actual logic (arg parsing, serve-reuse, `editor.toImage` export) now
 * lives in `tldsl render` (`src/cli/render.ts`); this file just builds the
 * viewer bundle on demand and calls into the same pieces `tldsl render`
 * uses, in-process (no more spawning a `tldsl serve` child).
 *
 * CLI surface, stderr prefix (`tools/screenshot.mts: <message>`), and exit
 * codes are unchanged from the old implementation.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { parseArgs } from "../src/cli/render.js";
import { runServe, type ServeIo } from "../src/cli/serve.js";
import { createSystemClock } from "../src/infra/clock/system-clock.js";
import { createJsxExecute } from "../src/infra/execute-jsx/execute-jsx.js";
import { createChokidarWatch } from "../src/infra/fs/chokidar-watch.js";
import { createNodeFsRead } from "../src/infra/fs/node-fs-read.js";
import { ElkLayoutAdapter } from "../src/infra/layout-elk/elk-layout.js";
import { createStderrLog } from "../src/infra/log/stderr-log.js";
import { exportImage } from "../src/infra/render/export-image.js";
import { findServe } from "../src/infra/serve-registry/serve-registry.js";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function ensureViewerBuilt(viewerBundleDir: string): Promise<void> {
  if (existsSync(viewerBundleDir)) return Promise.resolve();
  return new Promise((resolvePromise, reject) => {
    const proc = spawn("npm", ["run", "build:viewer"], { cwd: REPO_ROOT, stdio: "inherit" });
    proc.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`npm run build:viewer exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}

const silentIo: ServeIo = { writeStdout: () => {}, writeStderr: (chunk) => process.stderr.write(chunk) };

async function main(): Promise<void> {
  const { file, out, opts } = parseArgs(process.argv.slice(2));
  if (!existsSync(file)) {
    throw new Error(`no such file: ${file}`);
  }

  const viewerBundleDir = resolve(REPO_ROOT, "dist", "viewer");
  await ensureViewerBuilt(viewerBundleDir);

  const reused = findServe(file);
  if (reused !== undefined) {
    await exportImage(reused, out, opts);
    return;
  }

  // No fsWrite: this is a read-only export, same as `tldsl render` -
  // it must never write an overlay sidecar (tldsl-jwh).
  const handle = await runServe({
    path: file,
    deps: {
      fs: createNodeFsRead(),
      watch: createChokidarWatch(),
      layout: new ElkLayoutAdapter(),
      execute: createJsxExecute(),
      log: createStderrLog(),
      clock: createSystemClock(),
      viewerBundleDir,
    },
    io: silentIo,
  });
  try {
    await exportImage(handle.url, out, opts);
  } finally {
    await handle.close();
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`tools/screenshot.mts: ${msg}\n`);
  process.exit(1);
});
