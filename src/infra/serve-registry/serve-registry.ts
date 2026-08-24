/**
 * Discovery record letting a second `tldx serve` find the server already
 * running for this project, and letting `tldx render` reuse it. One record per
 * server, keyed by project root, listing every diagram that server holds.
 * Stored in the OS temp dir, never in the user's repo.
 *
 * Best-effort on reads and updates: a failed write or a corrupt file must never
 * take a running server down with it. The one exception is `claimServer`, whose
 * whole job is to fail when someone else got there first.
 */

import { createHash, randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  openSync,
  closeSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";

/** One diagram held by a server. */
export type ServeDiagram = {
  /** Page key in the shared viewer - `sha256(realpath)` truncated. */
  pageKey: string;
  /** Page name shown in the viewer's page menu, as of the last compile. */
  name?: string;
  /** sha256 (first 8 hex chars) of the source file as of the last successful compile. */
  hash?: string;
  /** `ClockPort.now()` reading at that same compile. */
  compiledAt?: number;
};

export type ServeRecord = {
  pid: number;
  url: string;
  /** Shared secret gating the server's write endpoints. */
  token: string;
  /** Idle-TTL the server was started with, in minutes; `0` means disabled. */
  ttlMinutes: number;
  /**
   * Newest mtime (ms) across the compiler source tree as of this server's
   * boot. Fixed at boot and never re-touched: a running process's own code
   * cannot change under it.
   */
  codeFingerprint?: number;
  /** Diagrams this server serves, keyed by resolved source path. */
  diagrams: Record<string, ServeDiagram>;
};

/** Resolved path of `file`, falling back to a plain resolve if it does not exist. */
function realPathOf(file: string): string {
  try {
    return realpathSync(file);
  } catch {
    return resolve(file);
  }
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * The viewer page key for a diagram: short, stable per path, and collision-free
 * in practice. Deliberately not a slug of the diagram's name - slugs collide
 * across directories and change when a diagram is retitled.
 */
export function pageKeyFor(file: string): string {
  return sha256(realPathOf(file)).slice(0, 8);
}

/**
 * The project a diagram belongs to: nearest ancestor holding `.git` (a
 * directory in a normal clone, a file in a worktree), else nearest holding
 * `package.json`, else the file's own directory. A filesystem walk rather than
 * `git rev-parse`, so it costs no subprocess.
 */
export function projectRootFor(file: string): string {
  let dir = dirname(realPathOf(file));
  const seen = new Set<string>();
  let packageRoot: string | undefined;
  for (;;) {
    if (seen.has(dir)) break;
    seen.add(dir);
    if (existsSync(join(dir, ".git"))) return dir;
    if (packageRoot === undefined && existsSync(join(dir, "package.json"))) packageRoot = dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return packageRoot ?? dirname(realPathOf(file));
}

function recordPath(projectRoot: string): string {
  // Resolved, so a claim taken on `/var/...` and a lookup that walked up to
  // `/private/var/...` (the same directory on macOS) land on the same record.
  return join(tmpdir(), "tldx-serve", `${sha256(realPathOf(projectRoot)).slice(0, 16)}.json`);
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
  return sha256(source).slice(0, 8);
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

/**
 * Replace the record at `path` atomically. A torn write here would discard
 * discovery info for every diagram on the server at once, not just one, so the
 * new content lands in a temp file and is renamed over the target.
 */
function writeRecordAtomically(path: string, record: ServeRecord): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.${String(process.pid)}.tmp`;
  writeFileSync(temp, JSON.stringify(record));
  renameSync(temp, path);
}

function readRecord(path: string): ServeRecord | undefined {
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Partial<ServeRecord>;
    if (typeof parsed.pid !== "number" || typeof parsed.url !== "string") return undefined;
    return {
      pid: parsed.pid,
      url: parsed.url,
      token: typeof parsed.token === "string" ? parsed.token : "",
      ttlMinutes: typeof parsed.ttlMinutes === "number" ? parsed.ttlMinutes : 0,
      ...(typeof parsed.codeFingerprint === "number"
        ? { codeFingerprint: parsed.codeFingerprint }
        : {}),
      diagrams:
        typeof parsed.diagrams === "object" && parsed.diagrams !== null ? parsed.diagrams : {},
    };
  } catch {
    return undefined;
  }
}

export type ServeClaim = {
  /** The project root this claim covers. */
  projectRoot: string;
  /** Secret to hand to the CLI, and to require on the server's write endpoints. */
  token: string;
  /** Publish the bound url and boot fingerprint. Call once the server is listening. */
  publish(url: string, codeFingerprint: number, ttlMinutes: number): void;
  /** Record (or update) a diagram this server serves. */
  addDiagram(file: string, diagram: ServeDiagram): void;
  /** Update a diagram's compile hash and timestamp after a recompile. */
  touchCompile(file: string, hash: string, compiledAt: number): void;
  /** Remove the record. Idempotent. */
  release(): void;
};

/**
 * Take ownership of the server slot for `projectRoot`, or fail if another
 * process holds it. The exclusive create happens BEFORE the port is bound, so
 * two `serve` invocations racing from cold cannot both end up listening - the
 * loser takes the handoff path instead.
 *
 * A slot held by a dead process is stale: it is removed and the claim retried
 * once.
 */
export function claimServer(projectRoot: string): ServeClaim | undefined {
  const path = recordPath(projectRoot);
  const token = randomUUID();
  const initial: ServeRecord = { pid: process.pid, url: "", token, ttlMinutes: 0, diagrams: {} };

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      mkdirSync(dirname(path), { recursive: true });
      // `wx` is the claim: it fails rather than truncating an existing record.
      const fd = openSync(path, "wx");
      try {
        writeFileSync(fd, JSON.stringify(initial));
      } finally {
        closeSync(fd);
      }
      return makeClaim(path, projectRoot, token);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") return undefined;
      const held = readRecord(path);
      if (held !== undefined && isAlive(held.pid)) return undefined;
      // Stale slot: the holder is gone (or the file is corrupt). Clear and retry.
      try {
        rmSync(path, { force: true });
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}

function makeClaim(path: string, projectRoot: string, token: string): ServeClaim {
  const update = (mutate: (record: ServeRecord) => void): void => {
    try {
      const current = readRecord(path);
      // Another process's record must never be clobbered by ours.
      if (current === undefined || current.pid !== process.pid) return;
      mutate(current);
      writeRecordAtomically(path, current);
    } catch {
      // best-effort; a failed update must not stop `serve` from running.
    }
  };

  let released = false;
  return {
    projectRoot,
    token,
    publish(url, fingerprint, ttlMinutes) {
      update((record) => {
        record.url = url;
        record.codeFingerprint = fingerprint;
        record.ttlMinutes = ttlMinutes;
      });
    },
    addDiagram(file, diagram) {
      update((record) => {
        record.diagrams[realPathOf(file)] = diagram;
      });
    },
    touchCompile(file, hash, compiledAt) {
      update((record) => {
        const existing = record.diagrams[realPathOf(file)];
        if (existing === undefined) return;
        existing.hash = hash;
        existing.compiledAt = compiledAt;
      });
    },
    release() {
      if (released) return;
      released = true;
      try {
        const current = readRecord(path);
        if (current !== undefined && current.pid !== process.pid) return;
        rmSync(path, { force: true });
      } catch {
        // best-effort
      }
    },
  };
}

/**
 * The live server for `file`'s project, or `undefined` if there is none. A
 * record naming a dead process, or one that cannot be parsed, is removed and
 * reported as absent.
 */
export function findServer(file: string): ServeRecord | undefined {
  const path = recordPath(projectRootFor(file));
  const record = readRecord(path);
  if (record !== undefined && record.url !== "" && isAlive(record.pid)) return record;
  if (record !== undefined && isAlive(record.pid)) return undefined; // claimed but not yet listening
  try {
    if (existsSync(path)) rmSync(path, { force: true });
  } catch {
    // best-effort
  }
  return undefined;
}

/** The entry for `file` on `record`, if that server serves it. */
export function diagramOf(record: ServeRecord, file: string): ServeDiagram | undefined {
  return record.diagrams[realPathOf(file)];
}
