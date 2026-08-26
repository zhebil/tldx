import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { findServer } from "../infra/serve-registry/serve-registry.js";

import { addEach, main, shouldOpenBrowser } from "./main.js";
import type { HandoffResult } from "./serve-handoff.js";

const dirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "tldx-main-"));
  dirs.push(dir);
  return dir;
}

function captureIo() {
  const buf = { stdout: "", stderr: "" };
  return {
    buf,
    writeStdout: (chunk: string) => {
      buf.stdout += chunk;
    },
    writeStderr: (chunk: string) => {
      buf.stderr += chunk;
    },
  };
}

function result(over: Partial<HandoffResult> = {}): HandoffResult {
  return { pageKey: "key", alreadyServed: false, hasViewer: false, ...over };
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("shouldOpenBrowser (a tab opens only when nobody is looking yet)", () => {
  it("opens when nothing is live and --no-open wasn't passed", () => {
    expect(shouldOpenBrowser(false, false)).toBe(true);
  });

  it("does not open when --no-open was passed", () => {
    expect(shouldOpenBrowser(true, false)).toBe(false);
  });

  it("does not open when a viewer is already connected, even without --no-open", () => {
    expect(shouldOpenBrowser(false, true)).toBe(false);
  });

  it("does not open when both --no-open and a connected viewer are present", () => {
    expect(shouldOpenBrowser(true, true)).toBe(false);
  });
});

describe("addEach (how a directory's files reach one server)", () => {
  it("adds every file in order and reports where each landed", async () => {
    const io = captureIo();
    const seen: string[] = [];
    const { first, failed } = await addEach(
      ["a.tldx.jsx", "b.tldx.jsx"],
      (file) => {
        seen.push(file);
        return Promise.resolve(result({ pageKey: file, name: file }));
      },
      "http://server/",
      io,
    );

    expect(seen).toEqual(["a.tldx.jsx", "b.tldx.jsx"]);
    expect(failed).toBe(false);
    expect(first?.pageKey).toBe("a.tldx.jsx");
    expect(io.buf.stdout).toBe(
      `tldx serve: added a.tldx.jsx as page "a.tldx.jsx" to the server at http://server/\n` +
        `tldx serve: added b.tldx.jsx as page "b.tldx.jsx" to the server at http://server/\n`,
    );
    expect(io.buf.stderr).toBe("");
  });

  it("distinguishes the files the server already served from the ones it added", async () => {
    const io = captureIo();
    const { failed } = await addEach(
      ["old.tldx.jsx", "new.tldx.jsx"],
      (file) => Promise.resolve(result({ pageKey: file, alreadyServed: file === "old.tldx.jsx" })),
      "http://server/",
      io,
    );

    expect(failed).toBe(false);
    expect(io.buf.stdout).toContain("already serving old.tldx.jsx at http://server/");
    expect(io.buf.stdout).toContain("added new.tldx.jsx to the server at http://server/");
  });

  it("reports a file that fails and keeps going, flagging the run as failed", async () => {
    const io = captureIo();
    const { first, failed } = await addEach(
      ["broken.tldx.jsx", "fine.tldx.jsx"],
      (file) =>
        file === "broken.tldx.jsx"
          ? Promise.reject(new Error("EACCES: permission denied"))
          : Promise.resolve(result({ pageKey: file })),
      "http://server/",
      io,
    );

    expect(failed).toBe(true);
    expect(io.buf.stderr).toBe("tldx serve: broken.tldx.jsx: EACCES: permission denied\n");
    // The healthy file still landed, and it is what a tab would open on.
    expect(io.buf.stdout).toContain("added fine.tldx.jsx");
    expect(first?.pageKey).toBe("fine.tldx.jsx");
  });

  it("is a no-op on an empty list", async () => {
    const io = captureIo();
    const { first, failed } = await addEach(
      [],
      () => Promise.reject(new Error("unreachable")),
      "u",
      io,
    );
    expect(first).toBeUndefined();
    expect(failed).toBe(false);
    expect(io.buf.stdout).toBe("");
  });
});

describe("tldx serve <dir> with no diagrams", () => {
  it("fails naming the directory, without starting or contacting a server", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "readme.md"), "");
    const io = captureIo();

    expect(await main(["serve", dir, "--no-open"], io)).toBe(1);
    expect(io.buf.stderr).toContain(dir);
    expect(io.buf.stderr).toContain(".tldx.jsx");
    expect(io.buf.stdout).toBe("");
    // Nothing claimed a slot for this project root, so nothing was started.
    expect(findServer(join(dir, "any.tldx.jsx"))).toBeUndefined();
  });

  it("treats a directory whose only diagrams are nested as empty", async () => {
    const dir = tempDir();
    mkdirSync(join(dir, "nested"));
    writeFileSync(join(dir, "nested", "deep.tldx.jsx"), "");
    const io = captureIo();

    expect(await main(["serve", dir, "--no-open"], io)).toBe(1);
    expect(io.buf.stderr).toContain(dir);
  });
});

describe("usage", () => {
  it("advertises that serve takes a file or a directory", async () => {
    const io = captureIo();
    expect(await main(["--help"], io)).toBe(0);
    expect(io.buf.stdout).toContain("serve <file|dir>");
  });

  it("names both forms when the path is missing", async () => {
    const io = captureIo();
    expect(await main(["serve"], io)).toBe(1);
    expect(io.buf.stderr).toBe("tldx serve: missing <file|dir> argument\n");
  });
});
