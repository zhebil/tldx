/**
 * `editor.toImage` export adapter behind `tldx render`. Drives headless
 * chromium against a served diagram URL and writes the image to disk.
 *
 * playwright is a devDependency (it pulls browser binaries) but this file
 * ships in `dist/cli`, so the import is dynamic and optional: a missing
 * install fails with an actionable message instead of crashing every `tldx`
 * invocation that never renders.
 */

import { writeFile } from "node:fs/promises";

import type { Box, Editor, TLShapeId } from "tldraw";

export type RenderFormat = "png" | "svg" | "jpeg" | "webp";

export type RenderOptions = {
  frame?: string | undefined;
  shapes?: string[] | undefined;
  padding?: number | undefined;
  scale?: number | undefined;
  format: RenderFormat;
  dark: boolean;
  background: boolean;
};

// tldraw's own default, pinned so PNG dimensions cannot shift under us if
// that default ever moves; this repo diffs PNGs across revisions.
const PIXEL_RATIO = 2;

async function loadChromium(): Promise<(typeof import("playwright"))["chromium"]> {
  try {
    const playwright = await import("playwright");
    return playwright.chromium;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    const msg = err instanceof Error ? err.message : String(err);
    if (code === "ERR_MODULE_NOT_FOUND" || msg.includes("Cannot find")) {
      throw new Error(
        "tldx render needs playwright: npm i -g playwright && npx playwright install chromium\n" +
          "(drop the -g if you installed tldx as a local dependency)",
      );
    }
    throw err;
  }
}

export async function exportImage(url: string, outPath: string, opts: RenderOptions): Promise<void> {
  const chromium = await loadChromium();

  let browser;
  try {
    browser = await chromium.launch();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Executable doesn't exist") || msg.includes("browserType.launch")) {
      throw new Error(`${msg}\nRun: npx playwright install chromium`);
    }
    throw err;
  }

  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    // Not `networkidle`: the viewer holds an SSE connection open, so idle is
    // never reliably reached - the selector wait below is the real gate.
    await page.goto(url, { waitUntil: "domcontentloaded" });
    // `state: "attached"` because a perfectly vertical arrow has a zero-width
    // bounding box, which playwright's default visibility check never passes.
    await page.waitForSelector("[data-shape-id]", { timeout: 15_000, state: "attached" });

    const base64 = await page.evaluate(
      async ({ frame, shapes, padding, scale, format, dark, background, pixelRatio }) => {
        const editor = (window as unknown as { editor: Editor }).editor;

        // Arrow labels export as absolutely-positioned <tspan>s whose x values
        // come from measuring text in the DOM at export time. Measure before
        // the webfont lands and every x is a fallback-font advance while the
        // SVG renders the real font, so words overprint each other.
        await editor.fonts.loadRequiredFontsForCurrentPage();
        await document.fonts.ready;

        const allIds = [...editor.getCurrentPageShapeIds()];
        const validIds = allIds.map((tlId) => tlId.replace(/^shape:/, "")).sort();

        // toImage expands each given id to itself plus its descendants, so a
        // frame id alone is enough to pull in its children.
        let targetIds: TLShapeId[];
        if (frame !== undefined) {
          const frameId = `shape:${frame}` as TLShapeId;
          if (!editor.getShape(frameId)) {
            throw new Error(`unknown --frame id "${frame}". Valid ids: ${validIds.join(", ")}`);
          }
          targetIds = [frameId];
        } else if (shapes !== undefined) {
          const missing = shapes.filter((id) => !editor.getShape(`shape:${id}` as TLShapeId));
          if (missing.length > 0) {
            throw new Error(
              `unknown --shapes id(s): ${missing.join(", ")}. Valid ids: ${validIds.join(", ")}`,
            );
          }
          targetIds = shapes.map((id) => `shape:${id}` as TLShapeId);
        } else {
          targetIds = allIds;
        }

        // tldraw's own content-bounds pass unions getShapeMaskedPageBounds,
        // which excludes labels: right for selection boxes, wrong for the
        // export crop, where a label overhanging its arrow gets clipped. The
        // label child still reports correct bounds, so walk each shape's
        // geometry tree and union every label child back in, in page space.
        let bounds: Box | undefined;
        for (const id of editor.getShapeAndDescendantIds(targetIds)) {
          const shapeBounds = editor.getShapeMaskedPageBounds(id);
          if (shapeBounds) {
            if (bounds) bounds.union(shapeBounds);
            else bounds = shapeBounds.clone();
          }
          if (!bounds) continue;

          const geom = editor.getShapeGeometry(id) as { children?: { isLabel: boolean; bounds: Box }[] };
          if (!geom.children) continue;
          const pageTransform = editor.getShapePageTransform(id);
          for (const child of geom.children) {
            if (!child.isLabel) continue;
            const corners = pageTransform.applyToPoints(child.bounds.corners);
            let minX = Infinity;
            let minY = Infinity;
            let maxX = -Infinity;
            let maxY = -Infinity;
            for (const p of corners) {
              minX = Math.min(minX, p.x);
              minY = Math.min(minY, p.y);
              maxX = Math.max(maxX, p.x);
              maxY = Math.max(maxY, p.y);
            }
            bounds.union({ x: minX, y: minY, w: maxX - minX, h: maxY - minY });
          }
        }

        const { blob } = await editor.toImage(targetIds, {
          format,
          darkMode: dark,
          background,
          pixelRatio,
          ...(bounds === undefined ? {} : { bounds }),
          ...(padding === undefined ? {} : { padding }),
          ...(scale === undefined ? {} : { scale }),
        });
        const buf = await blob.arrayBuffer();
        let binary = "";
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
        return btoa(binary);
      },
      {
        frame: opts.frame,
        shapes: opts.shapes,
        padding: opts.padding,
        scale: opts.scale,
        format: opts.format,
        dark: opts.dark,
        background: opts.background,
        pixelRatio: PIXEL_RATIO,
      },
    );

    await writeFile(outPath, Buffer.from(base64, "base64"));
  } finally {
    await browser.close();
  }
}
