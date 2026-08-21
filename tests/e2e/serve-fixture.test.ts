/**
 * E2E smoke for `tldsl serve`. Drives `runServe` with the same real
 * adapters the CLI wires (NodeFs, ChokidarWatch, ElkLayoutAdapter,
 * SystemClock, SseTransport, dev server) against a tldsl fixture, then
 * connects to the dev server's `/events` endpoint and confirms a
 * SceneMessage with `kind: "scene"` arrives.
 *
 * Per the issue and CONTEXT.md "Lifecycle: `tldsl check` is directly
 * testable from e2e tests without spawning a child process" - we drive
 * `runServe` in-process. The child-process spawn is unnecessary ceremony:
 * every adapter is real, the HTTP server is real, the file watcher is
 * real. The only injected stub is `openBrowser`, so the test does not
 * launch a browser.
 *
 * SSE parsing is hand-rolled (no EventSource in node) and mirrors the
 * approach used in `infra/devserver/dev-server.test.ts`.
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

async function bootServe(
  fixtureName: string,
  bundleDir: string,
): Promise<Setup> {
  const workDir = await mkdtemp(join(tmpdir(), "tldsl-serve-"));
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
      // Suppress real browser launch in tests.
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
 * Read a single `data:` SSE frame from the response body, returning the
 * parsed message. Throws if the stream closes without a data frame within
 * `timeoutMs`. Skips comment frames (`:` lines) emitted by the SSE
 * adapter for the "stream open" sentinel.
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

describe("e2e: tldsl serve", () => {
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
    const bundleDir = await mkdtemp(join(tmpdir(), "tldsl-serve-bundle-"));
    try {
      setup = await bootServe("auth.tldsl.jsx", bundleDir);

      // The CLI announces the URL on stdout once the server is bound.
      expect(setup.io.stdout).toContain("tldsl serving");
      expect(setup.io.stdout).toContain(setup.handle.url);

      const controller = new AbortController();
      try {
        const res = await fetch(`${setup.handle.url}events`, {
          signal: controller.signal,
        });
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type") ?? "").toMatch(
          /text\/event-stream/,
        );
        if (res.body === null) throw new Error("SSE response had no body");

        const message = await readFirstSceneMessage(res.body);
        expect(message.v).toBe(1);
        expect(message.kind).toBe("scene");
        if (message.kind === "scene") {
          // The auth fixture compiles to a frame + 5 boxes + 4 edges + 1
          // note. We don't pin the exact count - any non-empty store is
          // proof the pipeline ran end-to-end.
          const records = Object.values(message.payload.store);
          expect(records.length).toBeGreaterThan(1);
        }
      } finally {
        controller.abort();
      }

      // Successful initial compile is reported on the log port.
      expect(
        setup.log.events.some((e) => e.code === "watch/recompile-ok"),
      ).toBe(true);
    } finally {
      await rm(bundleDir, { recursive: true, force: true });
    }
  }, 30_000);
});
