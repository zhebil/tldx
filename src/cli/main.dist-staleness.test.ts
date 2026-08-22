import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { distStalenessHint } from "./main.js";

describe("distStalenessHint (tldsl-ppj: a stale dist/ should say so, not look like a missing command)", () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  function makeRepo(): { root: string; distCli: string; srcDir: string } {
    const root = mkdtempSync(join(tmpdir(), "tldsl-staleness-test-"));
    dirs.push(root);
    const distCli = join(root, "dist", "cli");
    const srcDir = join(root, "src");
    mkdirSync(distCli, { recursive: true });
    mkdirSync(srcDir, { recursive: true });
    writeFileSync(join(distCli, "main.js"), "// built");
    writeFileSync(join(srcDir, "main.ts"), "// source");
    return { root, distCli, srcDir };
  }

  it("is silent when dist/ is newer than every file in src/", () => {
    const { distCli, srcDir } = makeRepo();
    utimesSync(join(srcDir, "main.ts"), new Date(1000), new Date(1000));
    utimesSync(join(distCli, "main.js"), new Date(2000), new Date(2000));

    expect(distStalenessHint(distCli)).toBeUndefined();
  });

  it("flags dist/ as stale when src/ has a file newer than the build", () => {
    const { distCli, srcDir } = makeRepo();
    utimesSync(join(distCli, "main.js"), new Date(1000), new Date(1000));
    utimesSync(join(srcDir, "main.ts"), new Date(2000), new Date(2000));

    expect(distStalenessHint(distCli)).toMatch(/dist\/ looks stale.*npm run build/);
  });

  it("is silent when src/ doesn't exist next to dist/ (an installed package)", () => {
    const root = mkdtempSync(join(tmpdir(), "tldsl-staleness-test-"));
    dirs.push(root);
    const distCli = join(root, "dist", "cli");
    mkdirSync(distCli, { recursive: true });
    writeFileSync(join(distCli, "main.js"), "// built");

    expect(distStalenessHint(distCli)).toBeUndefined();
  });

  it("is silent when not running from a dist/ directory (dev checkout via tsx)", () => {
    const root = mkdtempSync(join(tmpdir(), "tldsl-staleness-test-"));
    dirs.push(root);
    const srcCli = join(root, "src", "cli");
    mkdirSync(srcCli, { recursive: true });
    writeFileSync(join(srcCli, "main.js"), "// not actually a build");

    expect(distStalenessHint(srcCli)).toBeUndefined();
  });
});
