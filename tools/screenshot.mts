/**
 * `tools/screenshot.mts <file.tldsl.jsx> <out.png>` - render a compiled
 * diagram in a real tldraw canvas and capture it to a PNG. Phase B's
 * text-only geometry report (`layout-report.mts`) can't see defects that
 * only exist post-render (e.g. tldraw resizing a note past the box the
 * layout reserved for it); this gets real pixels instead.
 *
 * Starts `tldsl serve <file>` as a child process, parses its ephemeral port
 * out of stdout, drives headless chromium via playwright, and always kills
 * the child before exiting - an orphaned `serve` would poison every later
 * run.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVE_URL_RE = /on (https?:\/\/\S+)/;
const SERVE_READY_TIMEOUT_MS = 15_000;

async function main(): Promise<void> {
  const [fileArg, outArg] = process.argv.slice(2);
  if (fileArg === undefined || outArg === undefined) {
    throw new Error("usage: tools/screenshot.mts <file.tldsl.jsx> <out.png>");
  }
  const file = resolve(process.cwd(), fileArg);
  const outPath = resolve(process.cwd(), outArg);
  if (!existsSync(file)) {
    throw new Error(`no such file: ${file}`);
  }

  const viewerBundleDir = resolve(REPO_ROOT, "dist", "viewer");
  if (!existsSync(viewerBundleDir)) {
    await run("npm", ["run", "build:viewer"], REPO_ROOT);
  }

  const child = spawn(resolve(REPO_ROOT, "node_modules", ".bin", "tsx"), ["src/cli/main.ts", "serve", file], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const url = await waitForServeUrl(child);
    await captureScreenshot(url, outPath);
  } finally {
    await killChild(child);
  }
}

function waitForServeUrl(child: ReturnType<typeof spawn>): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    let stderr = "";
    const timer = setTimeout(() => {
      reject(new Error(`tldsl serve did not print a URL within ${SERVE_READY_TIMEOUT_MS}ms; stderr: ${stderr}`));
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
      reject(new Error(`tldsl serve exited early (code ${code}); stderr: ${stderr}`));
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

async function captureScreenshot(url: string, outPath: string): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1200 },
      deviceScaleFactor: 1,
    });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-shape-id]", { timeout: 15_000 });
    // Fit the whole diagram in view before capturing - tldraw's default UI
    // wires this to shift+1, and without it a wide diagram overflows the
    // 1600x1200 viewport and defects outside the initial camera go unseen.
    await page.keyboard.press("Shift+1");
    await page.waitForTimeout(500);
    // Hide tldraw's own UI so the judged image is the diagram and nothing else.
    // Done after shift+1 because zoom-to-fit is driven through the UI layer.
    await page.addStyleTag({ content: ".tlui-layout { display: none !important; }" });
    await page.waitForTimeout(100);
    await page.screenshot({ path: outPath });
  } finally {
    await browser.close();
  }
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

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`tools/screenshot.mts: ${msg}\n`);
  process.exit(1);
});
