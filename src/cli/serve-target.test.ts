import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveServeTargets } from "./serve-target.js";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "tldx-serve-target-"));
  dirs.push(dir);
  return dir;
}

function touch(dir: string, name: string): string {
  const path = join(dir, name);
  writeFileSync(path, "");
  return path;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("resolveServeTargets", () => {
  it("passes a file through as a one-element list", () => {
    const dir = tempDir();
    const file = touch(dir, "one.tldx.jsx");
    expect(resolveServeTargets(file)).toEqual([file]);
  });

  it("passes a missing path through, so a typo still reports as a compile diagnostic", () => {
    const missing = join(tempDir(), "gone.tldx.jsx");
    expect(resolveServeTargets(missing)).toEqual([missing]);
  });

  it("expands a directory to its diagrams, sorted by file name", () => {
    const dir = tempDir();
    touch(dir, "charlie.tldx.jsx");
    touch(dir, "alpha.tldx.jsx");
    touch(dir, "bravo.tldx.jsx");
    expect(resolveServeTargets(dir)).toEqual([
      join(dir, "alpha.tldx.jsx"),
      join(dir, "bravo.tldx.jsx"),
      join(dir, "charlie.tldx.jsx"),
    ]);
  });

  it("ignores everything that is not a .tldx.jsx file", () => {
    const dir = tempDir();
    const diagram = touch(dir, "kept.tldx.jsx");
    touch(dir, "kept.tldx.overlay.json");
    touch(dir, "kept.svg");
    touch(dir, "notes.md");
    touch(dir, "helper.jsx");
    expect(resolveServeTargets(dir)).toEqual([diagram]);
  });

  it("does not descend into subdirectories", () => {
    const dir = tempDir();
    const top = touch(dir, "top.tldx.jsx");
    mkdirSync(join(dir, "nested"));
    touch(join(dir, "nested"), "deep.tldx.jsx");
    expect(resolveServeTargets(dir)).toEqual([top]);
  });

  it("does not mistake a directory named like a diagram for one", () => {
    const dir = tempDir();
    const real = touch(dir, "real.tldx.jsx");
    mkdirSync(join(dir, "impostor.tldx.jsx"));
    expect(resolveServeTargets(dir)).toEqual([real]);
  });

  it("throws naming the directory when it holds no diagram", () => {
    const dir = tempDir();
    touch(dir, "readme.md");
    expect(() => resolveServeTargets(dir)).toThrow(dir);
    expect(() => resolveServeTargets(dir)).toThrow(".tldx.jsx");
  });

  it("throws when the only diagrams are nested", () => {
    const dir = tempDir();
    mkdirSync(join(dir, "nested"));
    touch(join(dir, "nested"), "deep.tldx.jsx");
    expect(() => resolveServeTargets(dir)).toThrow(dir);
  });
});
