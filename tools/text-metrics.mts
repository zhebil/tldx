/**
 * `tools/text-metrics.mts <file.tldsl.jsx>` - print the *rendered* text
 * metrics of every shape's label as measured by a real browser.
 *
 * The layout engine only has flat per-char estimates (`estimatedBoxSize` in
 * `src/domain/layout/defaults.ts`) and nothing in the repo can currently
 * observe what tldraw actually draws. This starts `tldsl serve <file>` as a
 * child process, parses its ephemeral port out of stdout, drives headless
 * chromium via playwright, and always kills the child before exiting - an
 * orphaned `serve` would poison every later run.
 */

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVE_URL_RE = /on (https?:\/\/\S+)/;
const SERVE_READY_TIMEOUT_MS = 15_000;

// tldraw appends a trailing zero-width space to label text; strip it before
// printing or measuring string length so the reported text matches the source.
const ZERO_WIDTH_SPACE_RE = /\u200B+$/;

// Frames render their label in `.tl-frame-label`; box and note shapes render
// theirs in `.tl-text-content` (found by inspecting the DOM in a headless
// browser - both selectors sit tight around the text, excluding the shape's
// own padding).
const LABEL_SELECTOR = ".tl-frame-label, .tl-text-content";

interface LabelMetrics {
  id: string;
  text: string;
  labelW: number;
  labelH: number;
  shapeW: number;
}

async function main(): Promise<void> {
  const [fileArg] = process.argv.slice(2);
  if (fileArg === undefined) {
    throw new Error("usage: tools/text-metrics.mts <file.tldsl.jsx>");
  }
  const file = resolve(process.cwd(), fileArg);
  if (!existsSync(file)) {
    throw new Error(`no such file: ${file}`);
  }

  const child = spawn(resolve(REPO_ROOT, "node_modules", ".bin", "tsx"), ["src/cli/main.ts", "serve", file], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const url = await waitForServeUrl(child);
    const rows = await measureLabels(url);
    console.log(formatTable(rows));
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

async function measureLabels(url: string): Promise<LabelMetrics[]> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1600, height: 1200 },
      deviceScaleFactor: 1,
    });
    await page.goto(url, { waitUntil: "networkidle" });
    // `state: "attached"` because a perfectly vertical arrow has a zero-width
    // bounding box, which playwright's default visibility check never passes.
    await page.waitForSelector("[data-shape-id]", { timeout: 15_000, state: "attached" });
    await page.waitForTimeout(800);

    // Camera must sit at zoom 1, or the numbers below would be screen px
    // instead of canvas units. Assert it rather than relying on it happening
    // to be true - do not zoom-to-fit (that would scale everything).
    const zoom = await page.evaluate(() =>
      getComputedStyle(document.querySelector(".tl-container")!).getPropertyValue("--tl-zoom").trim(),
    );
    if (zoom !== "1") {
      throw new Error(`expected camera zoom 1, got --tl-zoom: ${zoom}`);
    }

    return await page.evaluate((selector) => {
      const rows: { id: string; text: string; labelW: number; labelH: number; shapeW: number }[] = [];
      for (const el of Array.from(document.querySelectorAll("[data-shape-id]"))) {
        const label = el.querySelector<HTMLElement>(selector);
        if (!label) continue;
        const lr = label.getBoundingClientRect();
        const er = (el as HTMLElement).getBoundingClientRect();
        rows.push({
          id: el.getAttribute("data-shape-id") ?? "",
          text: label.textContent ?? "",
          labelW: lr.width,
          labelH: lr.height,
          shapeW: er.width,
        });
      }
      return rows;
    }, LABEL_SELECTOR);
  } finally {
    await browser.close();
  }
}

function formatTable(rows: LabelMetrics[]): string {
  const header = ["id", "text", "labelW", "labelH", "shapeW"];
  const dataRows = rows.map((r) => [
    r.id.replace(/^shape:/, ""),
    r.text.replace(ZERO_WIDTH_SPACE_RE, ""),
    r.labelW.toFixed(2),
    r.labelH.toFixed(2),
    r.shapeW.toFixed(2),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...dataRows.map((r) => (r[i] ?? "").length)));
  const fmt = (r: string[]): string => r.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ").trimEnd();
  return [fmt(header), ...dataRows.map(fmt)].join("\n");
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

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`tools/text-metrics.mts: ${msg}\n`);
  process.exit(1);
});
