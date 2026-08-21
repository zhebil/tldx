/**
 * `tools/screenshot.mts <file.tldsl.jsx> <out.png>` - render a compiled
 * diagram in a real tldraw canvas and capture it to a PNG. Phase B's
 * text-only geometry report (`layout-report.mts`) can't see defects that
 * only exist post-render (e.g. tldraw resizing a note past the box the
 * layout reserved for it); this gets real pixels instead.
 *
 * Starts `tldsl serve <file>` as a child process via the shared harness in
 * `serve-harness.mts`, drives headless chromium via playwright, and always
 * kills the child before exiting.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { chromium } from "playwright";

import { withServedDiagram } from "./serve-harness.mjs";

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

  await withServedDiagram(file, (url) => captureScreenshot(url, outPath));
}

async function captureScreenshot(url: string, outPath: string): Promise<void> {
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

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`tools/screenshot.mts: ${msg}\n`);
  process.exit(1);
});
