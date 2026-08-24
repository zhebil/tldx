/**
 * Discovery record letting `tldx render` reuse a running `tldx serve` instead
 * of booting its own. Stored in the OS temp dir, never in the user's repo.
 * Best-effort throughout: a failed write or read must never take `serve` down
 * with it.
 */

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

export type ServeRecord = {
  pid: number;
  url: string;
  file: string;
  /** sha256 (first 8 hex chars) of the source file as of the last successful compile. */
  hash?: string;
  /** `ClockPort.now()` reading at that same compile. */
  compiledAt?: number;
  /**
   * Newest mtime (ms) across the compiler source tree as of this server's
   * boot. Fixed at boot and never re-touched: a running process's own code
   * cannot change under it.
   */
  codeFingerprint?: number;
};

function recordPath(file: string): string {
  let key: string;
  try {
    key = realpathSync(file);
  } catch {
    key = resolve(file);
  }
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return join(tmpdir(), "tldx-serve", `${hash}.json`);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Short, stable content hash used both when recording a compile and when checking staleness against it. */
export function hashSource(source: string): string {
  return createHash("sha256").update(source).digest("hex").slice(0, 8);
}

/** Newest mtime (ms) of any file under `dir`, recursing but skipping `node_modules`. `0` if `dir` doesn't exist or is empty. */
export function newestMtimeMs(dir: string): number {
  let newest = 0;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return newest;
  }
  for (const entry of entries) {
    if (entry.name === "node_modules") continue;
    const full = resolve(dir, entry.name);
    try {
      newest = Math.max(newest, entry.isDirectory() ? newestMtimeMs(full) : statSync(full).mtimeMs);
    } catch {
      // best-effort; a raced-away file must not crash the caller
    }
  }
  return newest;
}

/**
 * Newest mtime (ms) across the compiler's own source tree, given the directory
 * of a running module one level under `cli/`. Running from `dist/cli` resolves
 * to the sibling `src/`; running from `src/cli` resolves to `src/` directly.
 * `0` when there is no `src/` (installed package), which makes any later
 * comparison against this fingerprint never register as stale.
 */
export function codeFingerprint(here: string): number {
  const parent = resolve(here, "..");
  const root = basename(parent) === "dist" ? resolve(parent, "..", "src") : parent;
  return existsSync(root) ? newestMtimeMs(root) : 0;
}

export function recordServe(
  file: string,
  url: string,
  compile?: { hash: string | undefined; at: number; codeFingerprint?: number },
): () => void {
  const path = recordPath(file);
  try {
    mkdirSync(dirname(path), { recursive: true });
    const record: ServeRecord = { pid: process.pid, url, file };
    if (compile?.hash !== undefined) {
      record.hash = compile.hash;
      record.compiledAt = compile.at;
    }
    if (compile?.codeFingerprint !== undefined) {
      record.codeFingerprint = compile.codeFingerprint;
    }
    writeFileSync(path, JSON.stringify(record));
  } catch {
    // best-effort; a failed write must not stop `serve` from running.
  }

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    try {
      rmSync(path, { force: true });
    } catch {
      // best-effort
    }
  };
}

/**
 * Update the hash/compiledAt of an already-recorded serve after a recompile.
 * No-op if nothing is recorded for `file`, or if the record belongs to another
 * process: an orphaned but still-alive server must never clobber a newer
 * process's record for the same file.
 */
export function touchServeCompile(file: string, hash: string, compiledAt: number): void {
  const path = recordPath(file);
  try {
    if (!existsSync(path)) return;
    const record = JSON.parse(readFileSync(path, "utf8")) as Partial<ServeRecord>;
    if (record.pid !== process.pid || record.url === undefined || record.file === undefined) return;
    const updated: ServeRecord = {
      pid: record.pid,
      url: record.url,
      file: record.file,
      hash,
      compiledAt,
    };
    writeFileSync(path, JSON.stringify(updated));
  } catch {
    // best-effort
  }
}

export function findServe(file: string): ServeRecord | undefined {
  const path = recordPath(file);
  try {
    if (!existsSync(path)) return undefined;
    const record = JSON.parse(readFileSync(path, "utf8")) as Partial<ServeRecord>;
    if (typeof record.pid === "number" && typeof record.url === "string" && isAlive(record.pid)) {
      const result: ServeRecord = { pid: record.pid, url: record.url, file: record.file ?? file };
      if (typeof record.hash === "string") result.hash = record.hash;
      if (typeof record.compiledAt === "number") result.compiledAt = record.compiledAt;
      if (typeof record.codeFingerprint === "number")
        result.codeFingerprint = record.codeFingerprint;
      return result;
    }
  } catch {
    // fall through to cleanup below
  }
  try {
    rmSync(path, { force: true });
  } catch {
    // best-effort
  }
  return undefined;
}
