import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { codeFingerprint, findServe, hashSource, newestMtimeMs, recordServe, touchServeCompile } from "./serve-registry.js";

// Well past any real OS pid range, so `process.kill(pid, 0)` reliably
// reports "no such process".
const DEAD_PID = 999_999_999;

// Mirrors the module's private path formula so a hand-written record lands
// exactly where it would look for it.
function pathFor(file: string): string {
  const hash = createHash("sha256").update(realpathSync(file)).digest("hex").slice(0, 16);
  return join(tmpdir(), "tldx-serve", `${hash}.json`);
}

const dirs: string[] = [];

function tempFile(): string {
  const dir = mkdtempSync(join(tmpdir(), "tldx-serve-test-"));
  dirs.push(dir);
  const file = join(dir, "diagram.tldx.jsx");
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

  it("records a codeFingerprint up front when given one", () => {
    const file = tempFile();
    const forget = recordServe(file, "http://127.0.0.1:4000", { hash: "abcd1234", at: 42, codeFingerprint: 999 });

    expect(findServe(file)).toEqual({
      pid: process.pid,
      url: "http://127.0.0.1:4000",
      file,
      hash: "abcd1234",
      compiledAt: 42,
      codeFingerprint: 999,
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
    // pid 1 (init/launchd) is always alive and is never our own pid.
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

describe("newestMtimeMs", () => {
  it("returns the newest mtime among files, recursing into subdirectories", () => {
    const dir = mkdtempSync(join(tmpdir(), "tldx-mtime-test-"));
    dirs.push(dir);
    writeFileSync(join(dir, "old.txt"), "old");
    utimesSync(join(dir, "old.txt"), new Date(1000), new Date(1000));
    mkdirSync(join(dir, "nested"));
    writeFileSync(join(dir, "nested", "new.txt"), "new");
    utimesSync(join(dir, "nested", "new.txt"), new Date(2000), new Date(2000));

    expect(newestMtimeMs(dir)).toBeCloseTo(2000, -1);
  });

  it("skips node_modules", () => {
    const dir = mkdtempSync(join(tmpdir(), "tldx-mtime-test-"));
    dirs.push(dir);
    writeFileSync(join(dir, "old.txt"), "old");
    utimesSync(join(dir, "old.txt"), new Date(1000), new Date(1000));
    mkdirSync(join(dir, "node_modules"));
    writeFileSync(join(dir, "node_modules", "pkg.js"), "pkg");
    utimesSync(join(dir, "node_modules", "pkg.js"), new Date(9999), new Date(9999));

    expect(newestMtimeMs(dir)).toBeCloseTo(1000, -1);
  });

  it("returns 0 for a directory that doesn't exist", () => {
    expect(newestMtimeMs(join(tmpdir(), "tldx-does-not-exist-xyz"))).toBe(0);
  });
});

describe("codeFingerprint", () => {
  function makeCheckout(): { root: string; distCli: string; srcCli: string } {
    const root = mkdtempSync(join(tmpdir(), "tldx-codefp-test-"));
    dirs.push(root);
    const distCli = join(root, "dist", "cli");
    const srcCli = join(root, "src", "cli");
    mkdirSync(distCli, { recursive: true });
    mkdirSync(srcCli, { recursive: true });
    writeFileSync(join(distCli, "serve.js"), "// built");
    writeFileSync(join(srcCli, "serve.ts"), "// source");
    return { root, distCli, srcCli };
  }

  it("running from src/cli (dev via tsx) fingerprints the whole src/ tree", () => {
    const { srcCli } = makeCheckout();
    utimesSync(join(srcCli, "serve.ts"), new Date(1234), new Date(1234));

    expect(codeFingerprint(srcCli)).toBeCloseTo(1234, -1);
  });

  it("running from dist/cli fingerprints the sibling src/ tree, not dist/ itself", () => {
    const { distCli, srcCli } = makeCheckout();
    utimesSync(join(distCli, "serve.js"), new Date(1), new Date(1));
    utimesSync(join(srcCli, "serve.ts"), new Date(5678), new Date(5678));

    expect(codeFingerprint(distCli)).toBeCloseTo(5678, -1);
  });

  it("is 0 when running from dist/cli with no sibling src/ (installed package)", () => {
    const root = mkdtempSync(join(tmpdir(), "tldx-codefp-test-"));
    dirs.push(root);
    const distCli = join(root, "dist", "cli");
    mkdirSync(distCli, { recursive: true });
    writeFileSync(join(distCli, "serve.js"), "// built");

    expect(codeFingerprint(distCli)).toBe(0);
  });
});
