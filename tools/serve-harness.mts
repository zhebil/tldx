/**
 * Shared child-process plumbing for tools that need a live `tldx serve`
 * instance: spawns it, waits for it to print its URL, hands the URL to the
 * caller, and always kills the child on the way out - an orphaned `serve`
 * would poison every later run.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVE_URL_RE = /on (https?:\/\/\S+)/;
const SERVE_READY_TIMEOUT_MS = 15_000;

export async function withServedDiagram<T>(
  file: string,
  fn: (url: string) => Promise<T>,
): Promise<T> {
  const viewerBundleDir = resolve(REPO_ROOT, "dist", "viewer");
  if (!existsSync(viewerBundleDir)) {
    await run("npm", ["run", "build:viewer"], REPO_ROOT);
  }

  const child = spawn(
    resolve(REPO_ROOT, "node_modules", ".bin", "tsx"),
    ["src/cli/main.ts", "serve", file, "--no-open"],
    {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  try {
    const url = await waitForServeUrl(child);
    return await fn(url);
  } finally {
    await killChild(child);
  }
}

function waitForServeUrl(child: ReturnType<typeof spawn>): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let stderr = "";
    const timer = setTimeout(() => {
      reject(
        new Error(
          `tldx serve did not print a URL within ${SERVE_READY_TIMEOUT_MS}ms; stderr: ${stderr}`,
        ),
      );
    }, SERVE_READY_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      const match = SERVE_URL_RE.exec(chunk.toString("utf8"));
      if (match?.[1] !== undefined) {
        clearTimeout(timer);
        resolvePromise(match[1]);
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`tldx serve exited early (code ${code}); stderr: ${stderr}`));
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function killChild(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((resolvePromise) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolvePromise();
      return;
    }
    const forceKill = setTimeout(() => child.kill("SIGKILL"), 5_000);
    child.once("exit", () => {
      clearTimeout(forceKill);
      resolvePromise();
    });
    child.kill("SIGTERM");
  });
}

function run(cmd: string, args: readonly string[], cwd: string): Promise<void> {
  return new Promise((resolvePromise, reject) => {
    const proc = spawn(cmd, args, { cwd, stdio: "inherit" });
    proc.on("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`));
    });
    proc.on("error", reject);
  });
}
