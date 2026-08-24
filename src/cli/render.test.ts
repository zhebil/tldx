import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { FakeClock } from "../app/ports/clock.fake.js";
import { FakeExecute } from "../app/ports/execute.fake.js";
import { InMemoryFs } from "../app/ports/fs.fake.js";
import { CaptureLog } from "../app/ports/log.fake.js";
import { FakeWatch } from "../app/ports/watch.fake.js";
import { StubLayout } from "../domain/ports/layout.fake.js";
import {
  hashSource,
  recordServe,
  type ServeRecord,
} from "../infra/serve-registry/serve-registry.js";

import {
  describeReused,
  isCodeStale,
  isStale,
  parseArgs,
  runRender,
  staleReason,
  withCompiledContext,
  withoutFsWrite,
} from "./render.js";
import type { ServeDeps, ServeIo } from "./serve.js";

describe("parseArgs", () => {
  it("resolves positional file/out and defaults", () => {
    const { file, out, opts } = parseArgs(["diagram.tldx.jsx", "out.png"]);
    expect(file).toBe(resolve(process.cwd(), "diagram.tldx.jsx"));
    expect(out).toBe(resolve(process.cwd(), "out.png"));
    expect(opts).toEqual({ dark: false, background: true, format: "png" });
  });

  it("parses --frame", () => {
    const { opts } = parseArgs(["a.tldx.jsx", "out.png", "--frame", "checkout"]);
    expect(opts.frame).toBe("checkout");
  });

  it("parses --shapes as a comma-separated, trimmed list", () => {
    const { opts } = parseArgs(["a.tldx.jsx", "out.png", "--shapes", "a, b ,c"]);
    expect(opts.shapes).toEqual(["a", "b", "c"]);
  });

  it("parses --padding and --scale as numbers", () => {
    const { opts } = parseArgs(["a.tldx.jsx", "out.png", "--padding", "10", "--scale", "2"]);
    expect(opts.padding).toBe(10);
    expect(opts.scale).toBe(2);
  });

  it("parses --dark and --no-background", () => {
    const { opts } = parseArgs(["a.tldx.jsx", "out.png", "--dark", "--no-background"]);
    expect(opts.dark).toBe(true);
    expect(opts.background).toBe(false);
  });

  it("infers format from the out extension", () => {
    expect(parseArgs(["a.tldx.jsx", "out.svg"]).opts.format).toBe("svg");
    expect(parseArgs(["a.tldx.jsx", "out.jpeg"]).opts.format).toBe("jpeg");
    expect(parseArgs(["a.tldx.jsx", "out.webp"]).opts.format).toBe("webp");
  });

  it("defaults to png for an unrecognized extension", () => {
    expect(parseArgs(["a.tldx.jsx", "out.bmp"]).opts.format).toBe("png");
  });

  it("--format overrides the inferred extension", () => {
    const { opts } = parseArgs(["a.tldx.jsx", "out.png", "--format", "svg"]);
    expect(opts.format).toBe("svg");
  });

  it("rejects an unknown --format value", () => {
    expect(() => parseArgs(["a.tldx.jsx", "out.png", "--format", "gif"])).toThrow(
      /--format must be one of/,
    );
  });

  it("rejects --frame and --shapes together", () => {
    expect(() => parseArgs(["a.tldx.jsx", "out.png", "--frame", "f1", "--shapes", "a,b"])).toThrow(
      /mutually exclusive/,
    );
  });

  it("parses --reuse-only", () => {
    const { reuseOnly } = parseArgs(["a.tldx.jsx", "out.png", "--reuse-only"]);
    expect(reuseOnly).toBe(true);
  });

  it("defaults --reuse-only to false", () => {
    const { reuseOnly } = parseArgs(["a.tldx.jsx", "out.png"]);
    expect(reuseOnly).toBe(false);
  });

  it("throws when the file positional is missing", () => {
    expect(() => parseArgs([])).toThrow(/usage: tldx render/);
  });

  it("throws when the out positional is missing", () => {
    expect(() => parseArgs(["a.tldx.jsx"])).toThrow(/usage: tldx render/);
  });
});

describe("describeReused", () => {
  it("formats as :port (file @ hash)", () => {
    const reused: ServeRecord = {
      pid: 1,
      url: "http://127.0.0.1:60278/",
      file: "board.tldx.jsx",
      hash: "a848f56a",
    };
    expect(describeReused("/some/dir/board.tldx.jsx", reused)).toBe(
      ":60278 (board.tldx.jsx @ a848f56a)",
    );
  });

  it("omits the hash when the registry record predates compile tracking", () => {
    const reused: ServeRecord = { pid: 1, url: "http://127.0.0.1:60278/", file: "board.tldx.jsx" };
    expect(describeReused("/some/dir/board.tldx.jsx", reused)).toBe(":60278 (board.tldx.jsx)");
  });
});

describe("isStale", () => {
  it("is stale when the current hash disagrees with the recorded compile", () => {
    const reused: ServeRecord = { pid: 1, url: "http://x", file: "f", hash: "aaaaaaaa" };
    expect(isStale("bbbbbbbb", reused)).toBe(true);
  });

  it("is fresh when hashes match", () => {
    const reused: ServeRecord = { pid: 1, url: "http://x", file: "f", hash: "aaaaaaaa" };
    expect(isStale("aaaaaaaa", reused)).toBe(false);
  });

  it("treats an unknown recorded hash as fresh, not stale", () => {
    const reused: ServeRecord = { pid: 1, url: "http://x", file: "f" };
    expect(isStale("aaaaaaaa", reused)).toBe(false);
  });
});

describe("isCodeStale", () => {
  it("is stale when the current code fingerprint is newer than the reused server's boot fingerprint", () => {
    const reused: ServeRecord = { pid: 1, url: "http://x", file: "f", codeFingerprint: 1000 };
    expect(isCodeStale(2000, reused)).toBe(true);
  });

  it("is fresh when the current code fingerprint matches or predates the boot fingerprint", () => {
    const reused: ServeRecord = { pid: 1, url: "http://x", file: "f", codeFingerprint: 1000 };
    expect(isCodeStale(1000, reused)).toBe(false);
    expect(isCodeStale(500, reused)).toBe(false);
  });

  it("treats an unknown recorded codeFingerprint as fresh, not stale", () => {
    const reused: ServeRecord = { pid: 1, url: "http://x", file: "f" };
    expect(isCodeStale(2000, reused)).toBe(false);
  });
});

describe("staleReason", () => {
  it("is undefined when neither source nor code has changed", () => {
    const reused: ServeRecord = {
      pid: 1,
      url: "http://x",
      file: "f",
      hash: "aaaaaaaa",
      codeFingerprint: 1000,
    };
    expect(staleReason("aaaaaaaa", 1000, reused)).toBeUndefined();
  });

  it("reports source staleness alone", () => {
    const reused: ServeRecord = {
      pid: 1,
      url: "http://x",
      file: "f",
      hash: "aaaaaaaa",
      codeFingerprint: 1000,
    };
    expect(staleReason("bbbbbbbb", 1000, reused)).toBe("source has changed since that compile");
  });

  it("reports code staleness alone", () => {
    const reused: ServeRecord = {
      pid: 1,
      url: "http://x",
      file: "f",
      hash: "aaaaaaaa",
      codeFingerprint: 1000,
    };
    expect(staleReason("aaaaaaaa", 2000, reused)).toBe(
      "the code that compiled it (src/domain, src/app, ...) has changed since that server started",
    );
  });

  it("reports both when source and code have both changed", () => {
    const reused: ServeRecord = {
      pid: 1,
      url: "http://x",
      file: "f",
      hash: "aaaaaaaa",
      codeFingerprint: 1000,
    };
    expect(staleReason("bbbbbbbb", 2000, reused)).toBe(
      "source and the code that compiled it have both changed since that compile",
    );
  });
});

describe("withCompiledContext", () => {
  it("annotates an unknown --frame error with when the reused scene was compiled", () => {
    const reused: ServeRecord = { pid: 1, url: "http://x", file: "f", compiledAt: 0 };
    const annotated = withCompiledContext(
      new Error('unknown --frame id "ctx". Valid ids: a, b'),
      reused,
    );
    expect(annotated.message).toBe(
      'unknown --frame id "ctx". Valid ids: a, b (reused server\'s scene was compiled 1970-01-01T00:00:00.000Z)',
    );
  });

  it("leaves unrelated errors untouched", () => {
    const reused: ServeRecord = { pid: 1, url: "http://x", file: "f", compiledAt: 0 };
    const original = new Error("some other failure");
    expect(withCompiledContext(original, reused)).toBe(original);
  });

  it("leaves the error untouched when compiledAt is unknown", () => {
    const reused: ServeRecord = { pid: 1, url: "http://x", file: "f" };
    const original = new Error('unknown --frame id "ctx". Valid ids: a, b');
    expect(withCompiledContext(original, reused)).toBe(original);
  });
});

describe("withoutFsWrite", () => {
  it("drops fsWrite from a deps copy entirely (not merely to undefined)", () => {
    const deps = { fsWrite: {} } as unknown as ServeDeps;
    const solo = withoutFsWrite(deps);
    expect("fsWrite" in solo).toBe(false);
  });
});

describe("runRender - reuse-only refusal (no chromium needed: both paths throw before booting anything)", () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  function tempFile(content: string): string {
    const dir = mkdtempSync(join(tmpdir(), "tldx-render-test-"));
    dirs.push(dir);
    const file = join(dir, "diagram.tldx.jsx");
    writeFileSync(file, content);
    return file;
  }

  function makeIo(): ServeIo & { stdout: string[]; stderr: string[] } {
    const stdout: string[] = [];
    const stderr: string[] = [];
    return {
      stdout,
      stderr,
      writeStdout: (chunk) => stdout.push(chunk),
      writeStderr: (chunk) => stderr.push(chunk),
    };
  }

  function makeDeps(file: string, content: string): ServeDeps {
    const fs = new InMemoryFs({ [file]: content });
    return {
      fs,
      fsWrite: fs,
      watch: new FakeWatch(),
      layout: new StubLayout(),
      execute: new FakeExecute(),
      log: new CaptureLog(),
      clock: new FakeClock(),
      viewerBundleDir: tmpdir(),
    };
  }

  it("refuses with 'no running serve' when nothing is registered", async () => {
    const content = "export default function Diagram() { return null; }";
    const file = tempFile(content);
    const io = makeIo();

    const code = await runRender({
      argv: [file, `${file}.png`, "--reuse-only"],
      deps: makeDeps(file, content),
      io,
    });

    expect(code).toBe(1);
    expect(io.stderr.join("")).toMatch(/no running `tldx serve`/);
  });

  it("refuses with a stale message (not the generic 'no running serve' one) when the registered server predates the current source", async () => {
    const content = "export default function Diagram() { return null; }";
    const file = tempFile(content);
    const forget = recordServe(file, "http://127.0.0.1:9999", { hash: "notarealhash", at: 0 });
    const io = makeIo();

    try {
      const code = await runRender({
        argv: [file, `${file}.png`, "--reuse-only"],
        deps: makeDeps(file, content),
        io,
      });

      expect(code).toBe(1);
      const stderr = io.stderr.join("");
      expect(stderr).toMatch(/is stale/);
      expect(stderr).toMatch(/--reuse-only/);
      expect(stderr).not.toMatch(/no running `tldx serve`/);
    } finally {
      forget();
    }
  });

  it("refuses with a stale message when the registered server's code fingerprint predates the current tree, even though the source hash matches", async () => {
    const content = "export default function Diagram() { return null; }";
    const file = tempFile(content);
    // codeFingerprint 0 predates any real file's mtime, so isCodeStale trips.
    const forget = recordServe(file, "http://127.0.0.1:9999", {
      hash: hashSource(content),
      at: 0,
      codeFingerprint: 0,
    });
    const io = makeIo();

    try {
      const code = await runRender({
        argv: [file, `${file}.png`, "--reuse-only"],
        deps: makeDeps(file, content),
        io,
      });

      expect(code).toBe(1);
      const stderr = io.stderr.join("");
      expect(stderr).toMatch(/is stale/);
      expect(stderr).toMatch(/code that compiled it/);
      expect(stderr).toMatch(/--reuse-only/);
    } finally {
      forget();
    }
  });

  it("does not refuse when the registered server's hash matches the current source (would proceed to reuse it)", async () => {
    const content = "export default function Diagram() { return null; }";
    const file = tempFile(content);
    const forget = recordServe(file, "http://127.0.0.1:9999", { hash: hashSource(content), at: 0 });
    const io = makeIo();

    try {
      const code = await runRender({
        argv: [file, `${file}.png`, "--reuse-only"],
        deps: makeDeps(file, content),
        io,
      });

      // Exit 1 because `exportImage` hits a URL with nothing listening, not
      // because a refusal fired.
      expect(code).toBe(1);
      const stderr = io.stderr.join("");
      expect(stderr).not.toMatch(/is stale/);
      expect(stderr).not.toMatch(/no running `tldx serve`/);
      expect(io.stdout.join("")).toMatch(/reusing serve on :9999 \(diagram\.tldx\.jsx @ /);
    } finally {
      forget();
    }
  });
});
