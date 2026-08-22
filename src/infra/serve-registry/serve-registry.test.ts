import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { findServe, hashSource, recordServe, touchServeCompile } from "./serve-registry.js";

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
  it("records then finds returns the record", () => {
    const file = tempFile();
    const forget = recordServe(file, "http://127.0.0.1:4000");

    expect(findServe(file)).toEqual({ pid: process.pid, url: "http://127.0.0.1:4000", file });

    forget();
    expect(findServe(file)).toBeUndefined();
  });

  it("records a compile hash/timestamp up front when given one", () => {
    const file = tempFile();
    const forget = recordServe(file, "http://127.0.0.1:4000", { hash: "abcd1234", at: 42 });

    expect(findServe(file)).toEqual({
      pid: process.pid,
      url: "http://127.0.0.1:4000",
      file,
      hash: "abcd1234",
      compiledAt: 42,
    });

    forget();
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

describe("touchServeCompile", () => {
  it("updates hash/compiledAt on an existing record owned by this process", () => {
    const file = tempFile();
    const forget = recordServe(file, "http://127.0.0.1:4000");

    touchServeCompile(file, "deadbeef", 1000);

    expect(findServe(file)).toEqual({
      pid: process.pid,
      url: "http://127.0.0.1:4000",
      file,
      hash: "deadbeef",
      compiledAt: 1000,
    });

    forget();
  });

  it("is a no-op when nothing is recorded yet", () => {
    const file = tempFile();
    touchServeCompile(file, "deadbeef", 1000);
    expect(findServe(file)).toBeUndefined();
  });

  it("never clobbers a record owned by a different (still-alive) pid", () => {
    const file = tempFile();
    const path = pathFor(file);
    mkdirSync(dirname(path), { recursive: true });
    // process.pid (the test's own, alive) but not process.pid+1 - use a
    // real, currently-alive, non-us pid: pid 1 (init/launchd) is always
    // alive and never process.pid on any platform this runs on.
    writeFileSync(path, JSON.stringify({ pid: 1, url: "http://127.0.0.1:4002", file }));

    touchServeCompile(file, "deadbeef", 1000);

    const record = JSON.parse(readFileSync(path, "utf8")) as { hash?: unknown };
    expect(record.hash).toBeUndefined();
  });
});

describe("hashSource", () => {
  it("is stable for identical content and differs for different content", () => {
    expect(hashSource("a")).toBe(hashSource("a"));
    expect(hashSource("a")).not.toBe(hashSource("b"));
    expect(hashSource("a")).toHaveLength(8);
  });
});
