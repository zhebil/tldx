/**
 * Discovery record letting `tldsl render` reuse a running `tldsl serve`
 * instead of booting its own. Stored in the OS temp dir, never in the user's
 * repo. Best-effort throughout: a failed write or read must never take `serve`
 * down with it.
 */

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

function recordPath(file: string): string {
  let key: string;
  try {
    key = realpathSync(file);
  } catch {
    key = resolve(file);
  }
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 16);
  return join(tmpdir(), "tldsl-serve", `${hash}.json`);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

export function recordServe(file: string, url: string): () => void {
  const path = recordPath(file);
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ pid: process.pid, url, file }));
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

export function findServe(file: string): string | undefined {
  const path = recordPath(file);
  try {
    if (!existsSync(path)) return undefined;
    const record = JSON.parse(readFileSync(path, "utf8")) as { pid?: unknown; url?: unknown };
    if (typeof record.pid === "number" && typeof record.url === "string" && isAlive(record.pid)) {
      return record.url;
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
