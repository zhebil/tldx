/**
 * Pins the guarantee `render.ts`'s module docs describe for the *reuse*
 * branch specifically (tldsl-mid): a reused server legitimately has
 * `fsWrite` wired (it's a real, independently-started `tldsl serve`), but
 * `runRender` itself must never use that capability - the only thing it does
 * with a reused server is call `exportImage` against its URL.
 *
 * `exportImage` is mocked rather than driven for real: it has no port (one
 * impl, no fake - CONTEXT.md's "render/" row), so there is no other seam,
 * and a real headless-chromium run would be slower and flakier for a
 * guarantee that's about `runRender`'s own code, not the browser's.
 * Whether the browser session itself could ever cause a stray PUT is a
 * separate, already-covered concern (R1 in the module docs) and isn't
 * re-tested here.
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../infra/render/export-image.js", () => ({
  exportImage: vi.fn().mockResolvedValue(undefined),
}));

import { FakeClock } from "../app/ports/clock.fake.js";
import { FakeExecute } from "../app/ports/execute.fake.js";
import { InMemoryFs } from "../app/ports/fs.fake.js";
import { CaptureLog } from "../app/ports/log.fake.js";
import { FakeWatch } from "../app/ports/watch.fake.js";
import { overlayPathFor } from "../domain/overlay/index.js";
import { StubLayout } from "../domain/ports/layout.fake.js";
import { hashSource, recordServe } from "../infra/serve-registry/serve-registry.js";

import { runRender } from "./render.js";
import type { ServeDeps, ServeIo } from "./serve.js";

const dirs: string[] = [];

afterEach(() => {
  while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
});

function tempFile(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), "tldsl-render-reuse-test-"));
  dirs.push(dir);
  const file = join(dir, "diagram.tldsl.jsx");
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

describe("runRender - reusing a serve that has fsWrite never writes an overlay (tldsl-mid)", () => {
  it("leaves the overlay file absent after a successful --reuse-only render", async () => {
    const content = "export default function Diagram() { return null; }";
    const file = tempFile(content);
    const fs = new InMemoryFs({ [file]: content });
    const deps: ServeDeps = {
      fs,
      // The reused server legitimately has this wired - it's a real,
      // independently-started `tldsl serve`, not render's own boot.
      fsWrite: fs,
      watch: new FakeWatch(),
      layout: new StubLayout(),
      execute: new FakeExecute(),
      log: new CaptureLog(),
      clock: new FakeClock(),
      viewerBundleDir: tmpdir(),
    };
    const forget = recordServe(file, "http://127.0.0.1:9999", { hash: hashSource(content), at: Date.now() });

    try {
      const io = makeIo();
      const code = await runRender({
        argv: [file, `${file}.png`, "--reuse-only"],
        deps,
        io,
      });

      expect(code).toBe(0);
      expect(io.stdout.join("")).toMatch(/reusing serve on/);
      expect(fs.has(overlayPathFor(file))).toBe(false);
    } finally {
      forget();
    }
  });
});
