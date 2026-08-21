/**
 * `tldsl render <file> <out.png>`: export a compiled diagram as an image via
 * tldraw's `editor.toImage`, cropped to content by construction (no viewport,
 * no zoom-to-fit, no UI-hiding CSS hack). The composition root
 * (`cli/main.ts`) wires real adapters and calls into `runRender`; this
 * module owns argv shape, format inference, serve-reuse, and the exit code.
 *
 * URL resolution: reuse a running `tldsl serve` for the file if one is
 * recorded and alive (`infra/serve-registry`); otherwise boot an in-process,
 * ephemeral `runServe` and close it in a `finally`.
 */

import { existsSync } from "node:fs";
import { extname, resolve } from "node:path";

import { exportImage, type RenderFormat, type RenderOptions } from "../infra/render/export-image.js";
import { findServe } from "../infra/serve-registry/serve-registry.js";

import { runServe, type ServeDeps, type ServeIo } from "./serve.js";

const EXPORT_TYPES: readonly RenderFormat[] = ["png", "svg", "jpeg", "webp"];

export type ParsedRenderArgs = {
  file: string;
  out: string;
  opts: RenderOptions;
};

export function parseArgs(argv: readonly string[]): ParsedRenderArgs {
  const positional: string[] = [];
  let requestedFormat: RenderFormat | undefined;
  const opts: RenderOptions = { dark: false, background: true, format: "png" };

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
        if (!EXPORT_TYPES.includes(fmt as RenderFormat)) {
          throw new Error(`--format must be one of ${EXPORT_TYPES.join(", ")}, got ${fmt}`);
        }
        requestedFormat = fmt as RenderFormat;
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
      "usage: tldsl render <file.tldsl.jsx> <out.png> [--frame <id>] [--shapes <a,b>] [--padding <px>] [--scale <n>] [--format png|svg|jpeg|webp] [--dark] [--no-background]",
    );
  }
  if (opts.frame !== undefined && opts.shapes !== undefined) {
    throw new Error("--frame and --shapes are mutually exclusive");
  }

  const out = resolve(process.cwd(), outArg);
  opts.format = requestedFormat ?? inferFormat(out);

  return { file: resolve(process.cwd(), fileArg), out, opts };
}

function inferFormat(outPath: string): RenderFormat {
  const ext = extname(outPath).slice(1).toLowerCase();
  return EXPORT_TYPES.includes(ext as RenderFormat) ? (ext as RenderFormat) : "png";
}

export type RunRenderArgs = {
  argv: readonly string[];
  deps: ServeDeps;
  io: ServeIo;
};

export async function runRender(args: RunRenderArgs): Promise<number> {
  const { deps, io } = args;
  try {
    const { file, out, opts } = parseArgs(args.argv);
    if (!existsSync(file)) {
      throw new Error(`no such file: ${file}`);
    }

    const reused = findServe(file);
    if (reused !== undefined) {
      io.writeStdout(`tldsl render: reusing serve on ${reused}\n`);
      await exportImage(reused, out, opts);
    } else {
      const handle = await runServe({ path: file, deps, io });
      try {
        await exportImage(handle.url, out, opts);
      } finally {
        await handle.close();
      }
    }

    io.writeStdout(`tldsl render: wrote ${out}\n`);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    io.writeStderr(`tldsl render: ${msg}\n`);
    return 1;
  }
}
