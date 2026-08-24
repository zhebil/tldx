/**
 * E2E smoke for `tldx serve`. Drives `runServe` in-process with the real
 * adapters the CLI wires, then reads a scene message off the dev server's
 * `/events` endpoint. `openBrowser` is the only stub, so no browser
 * launches. SSE parsing is hand-rolled because node has no EventSource.
 */

import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runServe, type ServeHandle, type ServeIo } from "../../src/cli/serve.js";
import { createSystemClock } from "../../src/infra/clock/system-clock.js";
import { createJsxExecute } from "../../src/infra/execute-jsx/execute-jsx.js";
import { createChokidarWatch } from "../../src/infra/fs/chokidar-watch.js";
import { createNodeFsRead } from "../../src/infra/fs/node-fs-read.js";
import { createNodeFsWrite } from "../../src/infra/fs/node-fs-write.js";
import { ElkLayoutAdapter } from "../../src/infra/layout-elk/elk-layout.js";
import { createStderrLog } from "../../src/infra/log/stderr-log.js";
import type { SceneMessage } from "../../src/contracts/scene-message.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");

interface CapturedIo extends ServeIo {
  stdout: string;
  stderr: string;
}

function makeCaptureIo(): CapturedIo {
  const buf = { stdout: "", stderr: "" };
  return {
    get stdout() {
      return buf.stdout;
    },
    get stderr() {
      return buf.stderr;
    },
    writeStdout(chunk) {
      buf.stdout += chunk;
    },
    writeStderr(chunk) {
      buf.stderr += chunk;
    },
  };
}

interface Setup {
  handle: ServeHandle;
  workDir: string;
  filePath: string;
  log: ReturnType<typeof createCaptureLog>;
  io: CapturedIo;
}

interface RecordedLogEvent {
  level: string;
  code: string;
}

function createCaptureLog(): ReturnType<typeof createStderrLog> & {
  events: RecordedLogEvent[];
} {
  const events: RecordedLogEvent[] = [];
  return {
    events,
    log(event) {
      events.push({ level: event.level, code: event.code });
    },
  };
}

async function bootServe(fixtureName: string, bundleDir: string): Promise<Setup> {
  const workDir = await mkdtemp(join(tmpdir(), "tldx-serve-"));
  const filePath = join(workDir, fixtureName);
  await copyFile(join(FIXTURES, fixtureName), filePath);

  const log = createCaptureLog();
  const io = makeCaptureIo();
  const handle = await runServe({
    path: filePath,
    deps: {
      fs: createNodeFsRead(),
      fsWrite: createNodeFsWrite(),
      watch: createChokidarWatch(),
      layout: new ElkLayoutAdapter(),
      execute: createJsxExecute(),
      log,
      clock: createSystemClock(),
      viewerBundleDir: bundleDir,
      openBrowser: () => {},
    },
    io,
  });
  return { handle, workDir, filePath, log, io };
}

async function teardown(setup: Setup | undefined): Promise<void> {
  if (setup === undefined) return;
  await setup.handle.close();
  await rm(setup.workDir, { recursive: true, force: true });
}

/**
 * Read a single `data:` SSE frame from the response body. Throws if the
 * stream closes without one within `timeoutMs`. Skips the `:` comment
 * frames the SSE adapter emits as its "stream open" sentinel.
 */
async function readFirstSceneMessage(
  body: ReadableStream<Uint8Array>,
  timeoutMs = 10_000,
): Promise<SceneMessage> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx = buf.indexOf("\n\n");
    while (idx >= 0) {
      const event = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      if (!event.startsWith(":")) {
        const dataLines = event.split("\n").filter((l) => l.startsWith("data: "));
        if (dataLines.length > 0) {
          const data = dataLines.map((l) => l.slice("data: ".length)).join("\n");
          return JSON.parse(data) as SceneMessage;
        }
      }
      idx = buf.indexOf("\n\n");
    }
  }
  throw new Error("timed out waiting for SSE message");
}

describe("e2e: tldx serve", () => {
  let setup: Setup | undefined;

  beforeEach(() => {
    setup = undefined;
  });

  afterEach(async () => {
    await teardown(setup);
  });

  it("serves the initial scene over SSE for a valid fixture", async () => {
    // viewerBundleDir is a real-but-empty dir; `/events` works regardless
    // and the static handler 404s gracefully on missing index.html.
    const bundleDir = await mkdtemp(join(tmpdir(), "tldx-serve-bundle-"));
    try {
      setup = await bootServe("auth.tldx.jsx", bundleDir);

      expect(setup.io.stdout).toContain("tldx serving");
      expect(setup.io.stdout).toContain(setup.handle.url);

      const controller = new AbortController();
      try {
        const res = await fetch(`${setup.handle.url}events`, {
          signal: controller.signal,
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type") ?? "").toMatch(/text\/event-stream/);
        if (res.body === null) throw new Error("SSE response had no body");

        const message = await readFirstSceneMessage(res.body);
        expect(message.v).toBe(1);
        expect(message.kind).toBe("scene");
        if (message.kind === "scene") {
          // The exact count is not pinned: a non-empty store is proof
          // enough that the pipeline ran end to end.
          const records = Object.values(message.payload.store);
          expect(records.length).toBeGreaterThan(1);
        }
      } finally {
        controller.abort();
      }

      expect(setup.log.events.some((e) => e.code === "watch/recompile-ok")).toBe(true);
    } finally {
      await rm(bundleDir, { recursive: true, force: true });
    }
  }, 30_000);
});
