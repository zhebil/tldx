import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { findServe, recordServe } from "./serve-registry.js";

// A pid this large is guaranteed unassigned (well past any real OS pid
// range), so `process.kill(pid, 0)` reliably reports "no such process".
const DEAD_PID = 999_999_999;

// Mirrors the path formula documented for `recordServe`/`findServe`, so a
// hand-written record lands exactly where the module would look for it.
function pathFor(file: string): string {
  const hash = createHash("sha256").update(realpathSync(file)).digest("hex").slice(0, 16);
  return join(tmpdir(), "tldsl-serve", `${hash}.json`);
}

const dirs: string[] = [];

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "tldsl-serve-test-"));
  dirs.push(dir);
  const file = join(dir, "diagram.tldsl.jsx");
  writeFileSync(file, "");
  return file;
}

afterEach(() => {
  while (dirs.length > 0) {
    rmSync(dirs.pop()!, { recursive: true, force: true });
  }
});

describe("recordServe / findServe", () => {
  it("records then finds returns the url", () => {
    const file = tempFile();
    const forget = recordServe(file, "http://127.0.0.1:4000");

    expect(findServe(file)).toBe("http://127.0.0.1:4000");

    forget();
    expect(findServe(file)).toBeUndefined();
  });

  it("a record whose pid is dead returns undefined and removes the file", () => {
    const file = tempFile();
    const path = pathFor(file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({ pid: DEAD_PID, url: "http://127.0.0.1:4001", file }));

    expect(findServe(file)).toBeUndefined();
    expect(existsSync(path)).toBe(false);
  });

  it("a corrupt record returns undefined and is removed", () => {
    const file = tempFile();
    const path = pathFor(file);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "not json");

    expect(findServe(file)).toBeUndefined();
    expect(existsSync(path)).toBe(false);
  });
});
