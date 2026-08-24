import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  claimServer,
  codeFingerprint,
  diagramOf,
  findServer,
  hashSource,
  newestMtimeMs,
  pageKeyFor,
  projectRootFor,
} from "./serve-registry.js";

// Well past any real OS pid range, so `process.kill(pid, 0)` reliably
// reports "no such process".
const DEAD_PID = 999_999_999;

// Mirrors the module's private path formula so a hand-written record lands
// exactly where it would look for it.
function pathForRoot(root: string): string {
  const hash = createHash("sha256").update(realpathSync(root)).digest("hex").slice(0, 16);
  return join(tmpdir(), "tldx-serve", `${hash}.json`);
}

const dirs: string[] = [];

/** A temp project directory containing one diagram, marked as a git repo. */
function tempProject(marker: ".git" | ".git-file" | "package.json" | "none" = ".git"): {
  root: string;
  file: string;
} {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "tldx-serve-test-")));
  dirs.push(root);
  if (marker === ".git") mkdirSync(join(root, ".git"));
  if (marker === ".git-file") writeFileSync(join(root, ".git"), "gitdir: /elsewhere\n");
  if (marker === "package.json") writeFileSync(join(root, "package.json"), "{}");
  const nested = join(root, "diagrams");
  mkdirSync(nested);
  const file = join(nested, "diagram.tldx.jsx");
  writeFileSync(file, "");
  return { root, file };
}

afterEach(() => {
  while (dirs.length > 0) {
    const dir = dirs.pop()!;
    rmSync(pathForRoot(dir), { force: true });
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("projectRootFor", () => {
  it("finds the nearest ancestor with a .git directory", () => {
    const { root, file } = tempProject(".git");
    expect(projectRootFor(file)).toBe(root);
  });

  it("finds a worktree root, where .git is a file", () => {
    const { root, file } = tempProject(".git-file");
    expect(projectRootFor(file)).toBe(root);
  });

  it("falls back to the nearest package.json", () => {
    const { root, file } = tempProject("package.json");
    expect(projectRootFor(file)).toBe(root);
  });

  it("falls back to the file's own directory", () => {
    const { file } = tempProject("none");
    expect(projectRootFor(file)).toBe(dirname(realpathSync(file)));
  });

  it("prefers .git over a nearer package.json's ancestor", () => {
    const { root, file } = tempProject(".git");
    writeFileSync(join(root, "package.json"), "{}");
    expect(projectRootFor(file)).toBe(root);
  });
});

describe("pageKeyFor", () => {
  it("is stable per path and differs between files", () => {
    const { root, file } = tempProject();
    const other = join(root, "diagrams", "other.tldx.jsx");
    writeFileSync(other, "");

    expect(pageKeyFor(file)).toBe(pageKeyFor(file));
    expect(pageKeyFor(file)).not.toBe(pageKeyFor(other));
    expect(pageKeyFor(file)).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("claimServer / findServer", () => {
  it("a published claim is findable, with its diagrams", () => {
    const { root, file } = tempProject();
    const claim = claimServer(root);
    expect(claim).toBeDefined();
    claim!.publish("http://127.0.0.1:4000/", 7, 60);
    claim!.addDiagram(file, { pageKey: pageKeyFor(file) });

    const found = findServer(file);
    expect(found).toMatchObject({
      pid: process.pid,
      url: "http://127.0.0.1:4000/",
      token: claim!.token,
      ttlMinutes: 60,
      codeFingerprint: 7,
    });
    expect(diagramOf(found!, file)).toEqual({ pageKey: pageKeyFor(file) });

    claim!.release();
    expect(findServer(file)).toBeUndefined();
  });

  it("a second claimant loses while the first holds the slot", () => {
    const { root } = tempProject();
    const first = claimServer(root);
    expect(first).toBeDefined();

    expect(claimServer(root)).toBeUndefined();

    first!.release();
    expect(claimServer(root)).toBeDefined();
  });

  it("a claim held by a dead process is taken over", () => {
    const { root } = tempProject();
    const path = pathForRoot(root);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({ pid: DEAD_PID, url: "http://127.0.0.1:4001/", diagrams: {} }),
    );

    expect(claimServer(root)).toBeDefined();
  });

  it("touchCompile updates only its own diagram", () => {
    const { root, file } = tempProject();
    const claim = claimServer(root)!;
    claim.publish("http://127.0.0.1:4000/", 0, 60);
    claim.addDiagram(file, { pageKey: "aaaaaaaa" });

    claim.touchCompile(file, "deadbeef", 1000);

    expect(diagramOf(findServer(file)!, file)).toEqual({
      pageKey: "aaaaaaaa",
      hash: "deadbeef",
      compiledAt: 1000,
    });
  });

  it("an update leaves a readable record even if a stray temp file is left behind", () => {
    const { root, file } = tempProject();
    const claim = claimServer(root)!;
    claim.publish("http://127.0.0.1:4000/", 0, 60);
    claim.addDiagram(file, { pageKey: "aaaaaaaa" });

    // The atomic write renames onto the target, so the target is never a
    // partially written file - only whole records are ever observable.
    const raw = readFileSync(pathForRoot(root), "utf8");
    expect(() => JSON.parse(raw)).not.toThrow();
    expect(existsSync(`${pathForRoot(root)}.${String(process.pid)}.tmp`)).toBe(false);

    claim.release();
  });

  it("a record whose pid is dead is removed and reported absent", () => {
    const { root, file } = tempProject();
    const path = pathForRoot(root);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(
      path,
      JSON.stringify({ pid: DEAD_PID, url: "http://127.0.0.1:4001/", diagrams: {} }),
    );

    expect(findServer(file)).toBeUndefined();
    expect(existsSync(path)).toBe(false);
  });

  it("a corrupt record is removed and reported absent", () => {
    const { root, file } = tempProject();
    const path = pathForRoot(root);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, "not json");

    expect(findServer(file)).toBeUndefined();
    expect(existsSync(path)).toBe(false);
  });

  it("a claim that has not published a url yet is not findable", () => {
    const { root, file } = tempProject();
    const claim = claimServer(root)!;

    expect(findServer(file)).toBeUndefined();

    claim.release();
  });
});

describe("hashSource", () => {
  it("is stable and short", () => {
    expect(hashSource("abc")).toBe(hashSource("abc"));
    expect(hashSource("abc")).toMatch(/^[0-9a-f]{8}$/);
    expect(hashSource("abc")).not.toBe(hashSource("abd"));
  });
});

describe("newestMtimeMs / codeFingerprint", () => {
  it("reports the newest mtime under a directory and skips node_modules", () => {
    const { root } = tempProject();
    const old = join(root, "old.ts");
    writeFileSync(old, "");
    utimesSync(old, new Date(1000), new Date(1000));
    const modules = join(root, "node_modules");
    mkdirSync(modules);
    const ignored = join(modules, "huge.ts");
    writeFileSync(ignored, "");

    const newest = newestMtimeMs(root);
    expect(newest).toBeGreaterThan(1000);
    expect(newest).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it("is 0 for a directory that does not exist", () => {
    expect(newestMtimeMs(join(tmpdir(), "tldx-does-not-exist-xyz"))).toBe(0);
    expect(codeFingerprint(join(tmpdir(), "tldx-does-not-exist-xyz", "cli"))).toBe(0);
  });
});
