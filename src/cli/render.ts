/**
 * `tldsl render <file> <out.png>`: export a compiled diagram as an image via
 * tldraw's `editor.toImage`, cropped to content by construction (no viewport,
 * no zoom-to-fit, no UI-hiding CSS hack). The composition root
 * (`cli/main.ts`) wires real adapters and calls into `runRender`; this
 * module owns argv shape, format inference, serve-reuse, and the exit code.
 *
 * URL resolution: reuse a running `tldsl serve` for the file if one is
 * recorded, alive, and not stale (`infra/serve-registry`); otherwise boot an
 * in-process, ephemeral `runServe` and close it in a `finally`.
 *
 * `--reuse-only` skips the ephemeral-boot fallback and errors instead, so a
 * hook can render only when a warm `tldsl serve` is already free to use.
 *
 * Read-only (tldsl-jwh): `render` never writes `*.tldsl.overlay.json`. Its
 * own ephemeral boot strips `fsWrite` from the deps it hands to `runServe`
 * (`soloDeps` below), which disables the overlay round-trip for that
 * throwaway server entirely - see `cli/serve.ts`'s module docs. A reused
 * server is a separate, already-running `tldsl serve` process render does
 * not control; it was wired with `fsWrite` by its own invocation because it
 * legitimately supports human canvas edits.
 *
 * Reuse safety (tldsl-usr, tldsl-46n): a reused server's registry record
 * carries the source hash/timestamp of its last successful compile. Reusing
 * prints that hash so a stale server never looks like a compiler bug; a
 * mismatch against the current on-disk hash is treated as stale and
 * triggers a rebuild (or a refusal under `--reuse-only`, since that flag
 * exists specifically to avoid booting a browser).
 */

import { existsSync } from "node:fs";
import { extname, resolve, basename } from "node:path";

import { exportImage, type RenderFormat, type RenderOptions } from "../infra/render/export-image.js";
import { findServe, hashSource, type ServeRecord } from "../infra/serve-registry/serve-registry.js";

import { runServe, type ServeDeps, type ServeIo } from "./serve.js";

const EXPORT_TYPES: readonly RenderFormat[] = ["png", "svg", "jpeg", "webp"];

export type ParsedRenderArgs = {
  file: string;
  out: string;
  opts: RenderOptions;
  reuseOnly: boolean;
};

export function parseArgs(argv: readonly string[]): ParsedRenderArgs {
  const positional: string[] = [];
  let requestedFormat: RenderFormat | undefined;
  let reuseOnly = false;
  const opts: RenderOptions = { dark: false, background: true, format: "png" };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--reuse-only":
        reuseOnly = true;
        break;
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
      "usage: tldsl render <file.tldsl.jsx> <out.png> [--frame <id>] [--shapes <a,b>] [--padding <px>] [--scale <n>] [--format png|svg|jpeg|webp] [--dark] [--no-background] [--reuse-only]",
    );
  }
  if (opts.frame !== undefined && opts.shapes !== undefined) {
    throw new Error("--frame and --shapes are mutually exclusive");
  }

  const out = resolve(process.cwd(), outArg);
  opts.format = requestedFormat ?? inferFormat(out);

  return { file: resolve(process.cwd(), fileArg), out, opts, reuseOnly };
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

/** `:port (file @ hash)` - or without the hash if the registry record predates compile tracking. */
export function describeReused(file: string, reused: ServeRecord): string {
  let host = reused.url;
  try {
    host = `:${new URL(reused.url).port}`;
  } catch {
    // leave the raw url if it doesn't parse as one
  }
  const label = reused.hash !== undefined ? `${basename(file)} @ ${reused.hash}` : basename(file);
  return `${host} (${label})`;
}

/** Current on-disk hash disagrees with the reused server's last recorded compile. `undefined` hash = unknown, treated as fresh. */
export function isStale(currentHash: string, reused: ServeRecord): boolean {
  return reused.hash !== undefined && reused.hash !== currentHash;
}

/**
 * `export-image.ts`'s "unknown --frame/--shapes id" error is easy to
 * mistake for a compiler bug when it's really a stale reused server (tldsl-usr).
 * Annotate it with when that server's scene was actually compiled, without
 * touching export-image.ts itself.
 */
export function withCompiledContext(err: unknown, reused: ServeRecord): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (reused.compiledAt === undefined || !/^unknown --(frame|shapes)/.test(message)) {
    return err instanceof Error ? err : new Error(message);
  }
  const when = new Date(reused.compiledAt).toISOString();
  return new Error(`${message} (reused server's scene was compiled ${when})`);
}

/**
 * Render's own ephemeral server must never wire `fsWrite` - a read-only
 * export must not enable the overlay round-trip (tldsl-jwh). Returns a copy
 * of `deps` with `fsWrite` dropped entirely (not set to `undefined` - the
 * key is absent, matching `ServeDeps.fsWrite`'s optionality).
 */
export function withoutFsWrite(deps: ServeDeps): ServeDeps {
  const soloDeps: ServeDeps = { ...deps };
  delete soloDeps.fsWrite;
  return soloDeps;
}

export async function runRender(args: RunRenderArgs): Promise<number> {
  const { deps, io } = args;
  try {
    const { file, out, opts, reuseOnly } = parseArgs(args.argv);
    if (!existsSync(file)) {
      throw new Error(`no such file: ${file}`);
    }

    const reused = findServe(file);
    const stale = reused !== undefined && isStale(hashSource(await deps.fs.read(file)), reused);

    if (reused !== undefined && !stale) {
      io.writeStdout(`tldsl render: reusing serve on ${describeReused(file, reused)}\n`);
      try {
        await exportImage(reused.url, out, opts);
      } catch (err) {
        throw withCompiledContext(err, reused);
      }
    } else {
      if (reuseOnly) {
        throw stale && reused !== undefined
          ? new Error(
              `reused serve on ${describeReused(file, reused)} is stale (source has changed since that compile); refusing under --reuse-only`,
            )
          : new Error(`no running \`tldsl serve\` for ${file}; start one, or drop --reuse-only to boot a browser`);
      }
      if (stale && reused !== undefined) {
        io.writeStdout(`tldsl render: reused serve on ${describeReused(file, reused)} is stale, rebuilding\n`);
      }
      const handle = await runServe({ path: file, deps: withoutFsWrite(deps), io });
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
