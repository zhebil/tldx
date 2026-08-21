/**
 * `tools/screenshot.mts <file.tldsl.jsx> <out.png> [options]` - export a
 * compiled diagram straight from tldraw's own export API (`editor.toImage`),
 * not a viewport screenshot. Exports build from shape records and are
 * cropped to content by construction, so there's no zoom-to-fit keystroke,
 * no UI-hiding CSS hack, and no dependency on the browser viewport size.
 *
 * Options:
 *   --frame <id>     export that frame's contents (tldsl id). tldraw's export
 *                    semantics: the descendants are drawn, the frame's own
 *                    border and name label are not.
 *   --shapes <a,b>   comma-separated tldsl ids to export
 *   --padding <px>   default 32 (tldraw default)
 *   --scale <n>
 *   --format png|svg|jpeg|webp   default png, inferred from out extension
 *   --dark
 *   --no-background
 *
 * Starts `tldsl serve <file>` as a child process via the shared harness in
 * `serve-harness.mts`, drives headless chromium via playwright, and always
 * kills the child before exiting.
 */

import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

import { chromium } from "playwright";
import type { Editor, TLExportType, TLShapeId } from "tldraw";

import { withServedDiagram } from "./serve-harness.mjs";

type ExportType = TLExportType;
const EXPORT_TYPES: readonly ExportType[] = ["png", "svg", "jpeg", "webp"];

type Options = {
  frame?: string | undefined;
  shapes?: string[] | undefined;
  padding?: number | undefined;
  scale?: number | undefined;
  format?: ExportType | undefined;
  dark: boolean;
  background: boolean;
};

// tldraw defaults bitmap exports to pixelRatio 2; pinned explicitly so PNG
// output dimensions don't silently change if that default ever moves,
// since this repo diffs PNGs across revisions.
const PIXEL_RATIO = 2;

function parseArgs(argv: string[]): { file: string; out: string; opts: Options } {
  const positional: string[] = [];
  const opts: Options = { dark: false, background: true };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--frame":
        opts.frame = argv[++i];
        break;
      case "--shapes":
        opts.shapes = (argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "--padding":
        opts.padding = Number(argv[++i]);
        break;
      case "--scale":
        opts.scale = Number(argv[++i]);
        break;
      case "--format": {
        const fmt = argv[++i];
        if (!EXPORT_TYPES.includes(fmt as ExportType)) {
          throw new Error(`--format must be one of ${EXPORT_TYPES.join(", ")}, got ${fmt}`);
        }
        opts.format = fmt as ExportType;
        break;
      }
      case "--dark":
        opts.dark = true;
        break;
      case "--no-background":
        opts.background = false;
        break;
      default:
        if (arg !== undefined) positional.push(arg);
    }
  }

  const [fileArg, outArg] = positional;
  if (fileArg === undefined || outArg === undefined) {
    throw new Error(
      "usage: tools/screenshot.mts <file.tldsl.jsx> <out.png> [--frame <id>] [--shapes <a,b>] [--padding <px>] [--scale <n>] [--format png|svg|jpeg|webp] [--dark] [--no-background]",
    );
  }
  if (opts.frame !== undefined && opts.shapes !== undefined) {
    throw new Error("--frame and --shapes are mutually exclusive");
  }

  return { file: resolve(process.cwd(), fileArg), out: resolve(process.cwd(), outArg), opts };
}

function inferFormat(outPath: string, requested: ExportType | undefined): ExportType {
  if (requested !== undefined) return requested;
  const ext = extname(outPath).slice(1).toLowerCase();
  if (EXPORT_TYPES.includes(ext as ExportType)) return ext as ExportType;
  return "png";
}

async function main(): Promise<void> {
  const { file, out, opts } = parseArgs(process.argv.slice(2));
  if (!existsSync(file)) {
    throw new Error(`no such file: ${file}`);
  }
  const format = inferFormat(out, opts.format);

  await withServedDiagram(file, (url) => captureExport(url, out, format, opts));
}

async function captureExport(
  url: string,
  outPath: string,
  format: ExportType,
  opts: Options,
): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
    await page.goto(url, { waitUntil: "networkidle" });
    // `state: "attached"` because a perfectly vertical arrow has a zero-width
    // bounding box, which playwright's default visibility check never passes.
    await page.waitForSelector("[data-shape-id]", { timeout: 15_000, state: "attached" });

    const base64 = await page.evaluate(
      async ({ frame, shapes, padding, scale, format, dark, background, pixelRatio }) => {
        const editor = (window as unknown as { editor: Editor }).editor;

        const allIds = [...editor.getCurrentPageShapeIds()];
        const validIds = allIds.map((tlId) => tlId.replace(/^shape:/, "")).sort();

        // toImage/getSvgJsx already expands each given id to itself plus its
        // descendants internally, so a frame id alone is enough to pull in
        // its children - confirmed by reading getSvgJsx.mjs, which calls
        // editor.getShapeAndDescendantIds(ids) before rendering.
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

        const { blob } = await editor.toImage(targetIds, {
          format,
          darkMode: dark,
          background,
          pixelRatio,
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
        format,
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

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`tools/screenshot.mts: ${msg}\n`);
  process.exit(1);
});
