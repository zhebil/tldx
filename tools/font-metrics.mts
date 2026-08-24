/**
 * `tools/font-metrics.mts [out.ts]` - re-measure the per-glyph advance-width
 * tables in `src/domain/layout/glyph-metrics.ts` and print them as pasteable
 * TypeScript.
 *
 * `tools/text-metrics.mts` measures *labels a diagram already contains*;
 * this measures the *font itself*, which is what the layout engine's wrap
 * budget is built on. It starts `tldx serve` (the only place tldraw's
 * `--tl-font-*` CSS variables are defined - they live on `.tl-container`,
 * not on `document.body`, and measuring outside it silently resolves all
 * four fonts to Times), then renders each printable ASCII character 20 times
 * and divides. Space is measured by differencing `"a a a ... a"` against
 * `"aaaa..."`, because a trailing/leading space collapses.
 *
 * Only the `m` size is emitted: advance width scales exactly linearly with
 * font size (max error 0.001px across all 16 combinations), so
 * `glyph-metrics.ts` stores one table per font and scales. `--all` prints
 * the full 16-combination measurement instead, to re-check that claim.
 */

import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SERVE_URL_RE = /on (https?:\/\/\S+)/;
const SERVE_READY_TIMEOUT_MS = 20_000;

/** Any diagram works - `serve` is only here to provide a page with tldraw's fonts loaded. */
const PROBE_FILE = resolve(REPO_ROOT, "tests/corpus/hexagonal.tldx.jsx");

interface Combo {
  glyphs: Record<string, number>;
  lineH: number;
  resolved: string;
}

/**
 * Runs inside the page, so it is passed as a source string rather than a
 * function: `tsx` compiles arrow functions with an esbuild `__name` helper
 * that does not exist in the browser context.
 */
const MEASURE_SCRIPT = `(async () => {
  await document.fonts.ready;
  const FONTS = { draw: "var(--tl-font-draw)", sans: "var(--tl-font-sans)", serif: "var(--tl-font-serif)", mono: "var(--tl-font-mono)" };
  const SIZES = { s: 18, m: 22, l: 26, xl: 32 };
  const N = 20;
  const chars = [];
  for (let c = 33; c <= 126; c++) chars.push(String.fromCharCode(c));

  const span = document.createElement("div");
  span.style.position = "absolute";
  span.style.left = "-99999px";
  span.style.top = "0";
  span.style.whiteSpace = "pre";
  span.style.display = "inline-block";
  // tldraw's TEXT_PROPS.
  span.style.lineHeight = "1.35";
  span.style.fontWeight = "normal";
  span.style.fontVariant = "normal";
  span.style.fontStyle = "normal";
  span.style.padding = "0px";
  const host = document.querySelector(".tl-container");
  if (!host) throw new Error("no .tl-container on the page - tldraw font variables would not resolve");
  host.appendChild(span);

  const result = {};
  for (const fk of Object.keys(FONTS)) {
    for (const sk of Object.keys(SIZES)) {
      span.style.fontFamily = FONTS[fk];
      span.style.fontSize = SIZES[sk] + "px";
      const resolved = getComputedStyle(span).fontFamily;
      const glyphs = {};
      for (const ch of chars) {
        span.textContent = ch.repeat(N);
        glyphs[ch] = span.getBoundingClientRect().width / N;
      }
      span.textContent = "a".repeat(N);
      const noSpace = span.getBoundingClientRect().width;
      span.textContent = Array(N).fill("a").join(" ");
      glyphs[" "] = (span.getBoundingClientRect().width - noSpace) / (N - 1);
      span.textContent = "Ag";
      result[fk + "/" + sk] = { glyphs, lineH: span.getBoundingClientRect().height, resolved };
    }
  }
  span.remove();
  return result;
})()`;

async function main(): Promise<void> {
  const all = process.argv.includes("--all");
  const child = spawn(resolve(REPO_ROOT, "node_modules", ".bin", "tsx"), ["src/cli/main.ts", "serve", PROBE_FILE], {
    cwd: REPO_ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    const url = await waitForServeUrl(child);
    const combos = await measure(url);
    console.log(all ? formatAll(combos) : formatTables(combos));
  } finally {
    await killChild(child);
  }
}

function waitForServeUrl(child: ReturnType<typeof spawn>): Promise<string> {
  return new Promise((res, rej) => {
    let stderr = "";
    const timer = setTimeout(() => {
      rej(new Error(`tldx serve did not print a URL within ${SERVE_READY_TIMEOUT_MS}ms; stderr: ${stderr}`));
    }, SERVE_READY_TIMEOUT_MS);

    child.stdout?.on("data", (chunk: Buffer) => {
      const match = SERVE_URL_RE.exec(chunk.toString("utf8"));
      if (match?.[1] !== undefined) {
        clearTimeout(timer);
        res(match[1]);
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf8");
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      rej(new Error(`tldx serve exited early (code ${code}); stderr: ${stderr}`));
    });
    child.on("error", rej);
  });
}

async function measure(url: string): Promise<Record<string, Combo>> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 1 });
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-shape-id]", { timeout: 15_000, state: "attached" });
    await page.waitForTimeout(1_500);
    return (await page.evaluate(MEASURE_SCRIPT)) as Record<string, Combo>;
  } finally {
    await browser.close();
  }
}

function formatTables(combos: Record<string, Combo>): string {
  const out: string[] = [];
  for (const font of ["draw", "sans", "serif", "mono"]) {
    const combo = combos[`${font}/m`];
    if (combo === undefined) throw new Error(`missing measurement for ${font}/m`);
    const entries = Object.keys(combo.glyphs)
      .sort()
      .map((ch) => `${JSON.stringify(ch)}: ${combo.glyphs[ch]!.toFixed(2)}`);
    const lines: string[] = [];
    for (let i = 0; i < entries.length; i += 6) lines.push(`  ${entries.slice(i, i + 6).join(", ")},`);
    out.push(`const ${font.toUpperCase()}_ADVANCE: Record<string, number> = {\n${lines.join("\n")}\n};\n`);
  }
  return out.join("\n");
}

/** tldraw's `LABEL_FONT_SIZES` - box and note labels both use it. */
const LABEL_FONT_PX: Record<string, number> = { s: 18, m: 22, l: 26, xl: 32 };

/** `--all`: every combination's line height and worst deviation from the linear size scale. */
function formatAll(combos: Record<string, Combo>): string {
  const rows: string[] = [];
  for (const [key, combo] of Object.entries(combos)) {
    const [font = "", size = ""] = key.split("/");
    const base = combos[`${font}/m`];
    const scale = (LABEL_FONT_PX[size] ?? 22) / LABEL_FONT_PX.m!;
    let worst = 0;
    for (const [ch, w] of Object.entries(combo.glyphs)) {
      worst = Math.max(worst, Math.abs(w - (base?.glyphs[ch] ?? w) * scale));
    }
    rows.push(
      `${font}/${size}\tlineH ${combo.lineH.toFixed(2)}\tlinear-scale err ${worst.toFixed(4)}px\t${combo.resolved}`,
    );
  }
  return rows.join("\n");
}

function killChild(child: ReturnType<typeof spawn>): Promise<void> {
  return new Promise((res) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      res();
      return;
    }
    const forceKill = setTimeout(() => child.kill("SIGKILL"), 5_000);
    child.once("exit", () => {
      clearTimeout(forceKill);
      res();
    });
    child.kill("SIGTERM");
  });
}

main().catch((err: unknown) => {
  process.stderr.write(`tools/font-metrics.mts: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
