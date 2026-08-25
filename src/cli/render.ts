/**
 * `tldx render <file> <out.png>`: export a compiled diagram as an image,
 * cropped to content. Reuses a running `tldx serve` for the file when one is
 * recorded, alive, not stale, and has no pending overlay; otherwise boots an
 * ephemeral `runServe`. `--reuse-only` refuses instead of booting one.
 *
 * `render` is read-only: it never writes an overlay sidecar, so its own
 * ephemeral server is wired without `fsWrite`.
 *
 * The export is a function of the source alone. A reused server applies the
 * overlay and render's own server does not, so a diagram with pending canvas
 * edits declines the reuse rather than silently exporting two different
 * pictures from one unchanged file - see `overlayReason`.
 */

import { existsSync } from "node:fs";
import { extname, resolve, basename, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { readOverlay } from "../app/absorb.js";
import type { FsReadPort } from "../app/ports/fs.js";
import { overlayPathFor } from "../domain/overlay/index.js";
import {
  exportImage,
  type RenderFormat,
  type RenderOptions,
} from "../infra/render/export-image.js";
import {
  codeFingerprint,
  diagramOf,
  findServer,
  hashSource,
} from "../infra/serve-registry/serve-registry.js";

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
        opts.shapes = (argv[++i] ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
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
      "usage: tldx render <file.tldx.jsx> <out.png> [--frame <id>] [--shapes <a,b>] [--padding <px>] [--scale <n>] [--format png|svg|jpeg|webp] [--dark] [--no-background] [--reuse-only]",
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

/**
 * A running server plus the entry for the diagram being rendered - everything
 * the reuse decision needs, flattened. Built only when that server actually
 * serves this file.
 */
export type ReusedServe = {
  url: string;
  pageKey: string;
  name?: string;
  hash?: string;
  compiledAt?: number;
  codeFingerprint?: number;
};

/**
 * The live server for `file`, but only when it actually serves `file`: a shared
 * server holding other diagrams is no use for rendering this one, and reusing
 * it would export whichever page happened to be showing.
 */
export function reusableServe(file: string): ReusedServe | undefined {
  const record = findServer(file);
  if (record === undefined) return undefined;
  const diagram = diagramOf(record, file);
  if (diagram === undefined) return undefined;
  return {
    url: record.url,
    ...diagram,
    ...(record.codeFingerprint !== undefined ? { codeFingerprint: record.codeFingerprint } : {}),
  };
}

export type RunRenderArgs = {
  argv: readonly string[];
  deps: ServeDeps;
  io: ServeIo;
};

/** `:port (file @ hash)`, or without the hash when the record has none. */
export function describeReused(file: string, reused: ReusedServe): string {
  let host = reused.url;
  try {
    host = `:${new URL(reused.url).port}`;
  } catch {
    // leave the raw url if it doesn't parse as one
  }
  const label = reused.hash !== undefined ? `${basename(file)} @ ${reused.hash}` : basename(file);
  return `${host} (${label})`;
}

/** Current on-disk hash disagrees with the reused server's last recorded compile. An unknown hash counts as fresh. */
export function isStale(currentHash: string, reused: ReusedServe): boolean {
  return reused.hash !== undefined && reused.hash !== currentHash;
}

/** The compiler source tree has a file newer than the reused server's boot fingerprint. An unknown fingerprint counts as fresh. */
export function isCodeStale(currentCodeFingerprint: number, reused: ReusedServe): boolean {
  return reused.codeFingerprint !== undefined && currentCodeFingerprint > reused.codeFingerprint;
}

/** Combined source/code verdict: `undefined` means fresh, otherwise the reason to report. */
export function staleReason(
  currentHash: string,
  currentCodeFingerprint: number,
  reused: ReusedServe,
): string | undefined {
  const sourceStale = isStale(currentHash, reused);
  const codeStale = isCodeStale(currentCodeFingerprint, reused);
  if (sourceStale && codeStale)
    return "source and the code that compiled it have both changed since that compile";
  if (sourceStale) return "source has changed since that compile";
  if (codeStale)
    return "the code that compiled it (src/domain, src/app, ...) has changed since that server started";
  return undefined;
}

/**
 * Reason to decline a reused server because its canvas holds edits the source
 * does not express. Counting entries is deliberately cheap and slightly
 * conservative: an entry that merely restates what the source already says
 * still costs a rebuild, and telling the two apart means compiling, which is
 * the work reuse exists to skip.
 */
export function overlayReason(entryCount: number): string | undefined {
  if (entryCount === 0) return undefined;
  const noun = entryCount === 1 ? "entry" : "entries";
  return `its canvas has ${entryCount} pending overlay ${noun} that the source alone does not reproduce - \`tldx absorb\` folds them in`;
}

/** Entries pending in `file`'s overlay sidecar. Absent or malformed counts as none, exactly as the server treats it. */
export async function pendingOverlayCount(fs: FsReadPort, file: string): Promise<number> {
  const overlay = await readOverlay(fs, overlayPathFor(file));
  return overlay === null ? 0 : Object.keys(overlay.entries).length;
}

/**
 * An "unknown --frame/--shapes id" error is easy to mistake for a compiler
 * bug when it is really a stale reused server, so annotate it with when that
 * server's scene was compiled.
 */
export function withCompiledContext(err: unknown, reused: ReusedServe): Error {
  const message = err instanceof Error ? err.message : String(err);
  if (reused.compiledAt === undefined || !/^unknown --(frame|shapes)/.test(message)) {
    return err instanceof Error ? err : new Error(message);
  }
  const when = new Date(reused.compiledAt).toISOString();
  return new Error(`${message} (reused server's scene was compiled ${when})`);
}

/**
 * Copy of `deps` with the `fsWrite` key absent (not set to `undefined`), so
 * render's own ephemeral server never enables the overlay round-trip.
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

    const reused = reusableServe(file);
    const currentCodeFingerprint = codeFingerprint(dirname(fileURLToPath(import.meta.url)));
    const reason =
      reused !== undefined
        ? (overlayReason(await pendingOverlayCount(deps.fs, file)) ??
          staleReason(hashSource(await deps.fs.read(file)), currentCodeFingerprint, reused))
        : undefined;
    const declined = reason !== undefined;

    if (reused !== undefined && !declined) {
      io.writeStdout(`tldx render: reusing serve on ${describeReused(file, reused)}\n`);
      try {
        await exportImage(reused.url, out, { ...opts, pageKey: reused.pageKey });
      } catch (err) {
        throw withCompiledContext(err, reused);
      }
    } else {
      if (reuseOnly) {
        throw declined && reused !== undefined
          ? new Error(
              `not reusing the serve on ${describeReused(file, reused)}: ${reason}; refusing under --reuse-only`,
            )
          : new Error(
              `no running \`tldx serve\` for ${file}; start one, or drop --reuse-only to boot a browser`,
            );
      }
      if (declined && reused !== undefined) {
        io.writeStdout(
          `tldx render: not reusing the serve on ${describeReused(file, reused)}: ${reason}; rendering from source\n`,
        );
      }
      const handle = await runServe({ path: file, deps: withoutFsWrite(deps), io });
      try {
        await exportImage(handle.url, out, opts);
      } finally {
        await handle.close();
      }
    }

    io.writeStdout(`tldx render: wrote ${out}\n`);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    io.writeStderr(`tldx render: ${msg}\n`);
    return 1;
  }
}
