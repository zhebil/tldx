/**
 * E2E for the shared server: one `tldx serve` owns the project, a second
 * invocation hands its file over and exits 0, and both diagrams end up as
 * their own page on the one server.
 *
 * The first server is booted in-process (the CLI's `serve` blocks on shutdown,
 * which a test cannot join); the second diagram goes through the real CLI, so
 * the handoff path - registry lookup, token, `POST /diagrams` - runs for real.
 */

import { existsSync } from "node:fs";
import { mkdir, mkdtemp, copyFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import type { SceneMessage } from "../../src/contracts/scene-message.js";
import { main } from "../../src/cli/main.js";
import { reusableServe, runRender } from "../../src/cli/render.js";
import {
  runServe,
  viewerStalenessWarning,
  type ServeDeps,
  type ServeHandle,
} from "../../src/cli/serve.js";
import { createSystemClock } from "../../src/infra/clock/system-clock.js";
import { createJsxExecute } from "../../src/infra/execute-jsx/execute-jsx.js";
import { createChokidarWatch } from "../../src/infra/fs/chokidar-watch.js";
import { createNodeFsRead } from "../../src/infra/fs/node-fs-read.js";
import { createNodeFsWrite } from "../../src/infra/fs/node-fs-write.js";
import { ElkLayoutAdapter } from "../../src/infra/layout-elk/elk-layout.js";
import {
  claimServer,
  findServer,
  projectRootFor,
  type ServeClaim,
} from "../../src/infra/serve-registry/serve-registry.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");
const BUILT_VIEWER = resolve(HERE, "../../dist/viewer");

/**
 * Rendering needs a real browser and a viewer bundle built from the current
 * `src/viewer`, neither of which a bare checkout has. That case runs where
 * `npm run build` and `playwright install` have happened and skips elsewhere -
 * a stale bundle would fail for reasons that have nothing to do with the test.
 */
const canRender =
  existsSync(join(BUILT_VIEWER, "index.html")) &&
  viewerStalenessWarning(BUILT_VIEWER) === undefined &&
  (await chromiumInstalled());

async function chromiumInstalled(): Promise<boolean> {
  try {
    const { chromium } = await import("playwright");
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
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

/** Every message the server replays to a fresh subscriber, then disconnect. */
async function readReplay(url: string, expected: number): Promise<SceneMessage[]> {
  const controller = new AbortController();
  const messages: SceneMessage[] = [];
  try {
    const res = await fetch(`${url}events`, { signal: controller.signal });
    if (res.body === null) throw new Error("SSE response had no body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const deadline = Date.now() + 10_000;
    while (messages.length < expected && Date.now() < deadline) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let idx = buf.indexOf("\n\n");
      while (idx >= 0) {
        const event = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const data = event
          .split("\n")
          .filter((l) => l.startsWith("data: "))
          .map((l) => l.slice("data: ".length))
          .join("\n");
        if (!event.startsWith(":") && data !== "") {
          messages.push(JSON.parse(data) as SceneMessage);
        }
        idx = buf.indexOf("\n\n");
      }
    }
  } finally {
    controller.abort();
  }
  return messages;
}

interface Shared {
  handle: ServeHandle;
  claim: ServeClaim;
  workDir: string;
  first: string;
  second: string;
  deps: ServeDeps;
  io: ReturnType<typeof captureIo>;
  /** Exit code of the second `tldx serve`, which handed its file over. */
  handoffCode: number;
}

/**
 * One server holding two diagrams, the second added through the real CLI -
 * either by naming the file, or (`target: "dir"`) by naming the directory both
 * live in, which is the same handoff with the expansion in front of it.
 *
 * The work dir also holds a non-diagram file and a nested diagram, so a
 * directory serve has something to correctly ignore.
 */
async function bootShared(
  viewerBundleDir: string,
  target: "file" | "dir" = "file",
): Promise<Shared> {
  const workDir = await mkdtemp(join(tmpdir(), "tldx-shared-"));
  const first = join(workDir, "auth.tldx.jsx");
  const second = join(workDir, "edge-labels.tldx.jsx");
  await copyFile(join(FIXTURES, "auth.tldx.jsx"), first);
  await copyFile(join(FIXTURES, "edge-labels.tldx.jsx"), second);
  await writeFile(join(workDir, "notes.md"), "not a diagram\n");
  await mkdir(join(workDir, "nested"));
  await copyFile(join(FIXTURES, "styles.tldx.jsx"), join(workDir, "nested", "styles.tldx.jsx"));

  // The temp dir holds both files and no `.git`/`package.json`, so it is the
  // project root, and this test's registry record is its own.
  const claim = claimServer(projectRootFor(first));
  if (claim === undefined) throw new Error("could not claim the server slot");

  const io = captureIo();
  const deps: ServeDeps = {
    fs: createNodeFsRead(),
    fsWrite: createNodeFsWrite(),
    watch: createChokidarWatch(),
    layout: new ElkLayoutAdapter(),
    execute: createJsxExecute(),
    log: { log: () => {} },
    clock: createSystemClock(),
    viewerBundleDir,
  };
  const handle = await runServe({ path: first, deps: { ...deps, claim }, io });
  // Published as "newer than any source on disk" on purpose: a sibling test
  // writes lint probes into `src/`, and `render --reuse-only` would then call
  // this server stale mid-test. Code staleness has its own tests in
  // `render.test.ts`; here it is noise.
  claim.publish(handle.url, Number.MAX_SAFE_INTEGER, handle.ttlMinutes);
  const handoffCode = await main(["serve", target === "dir" ? workDir : second, "--no-open"], io);
  return { handle, claim, workDir, first, second, deps, io, handoffCode };
}

describe("e2e: one server, many diagrams", () => {
  let shared: Shared | undefined;
  let bundleDir: string | undefined;

  afterEach(async () => {
    await shared?.handle.close();
    shared?.claim.release();
    for (const dir of [shared?.workDir, bundleDir]) {
      if (dir !== undefined) await rm(dir, { recursive: true, force: true });
    }
    shared = bundleDir = undefined;
  });

  it("hands the second diagram to the running server, as its own page", async () => {
    // The viewer bundle is irrelevant here: nothing loads the page.
    bundleDir = await mkdtemp(join(tmpdir(), "tldx-shared-bundle-"));
    shared = await bootShared(bundleDir);
    const { handle, first, second, io } = shared;

    expect(shared.handoffCode).toBe(0);
    expect(io.buf.stdout).toContain(`added ${second}`);
    expect(io.buf.stdout).toContain(handle.url);

    // Both diagrams are discoverable on the one server, on distinct pages -
    // this is exactly what `render --reuse-only` resolves before it navigates.
    const reusedFirst = reusableServe(first);
    const reusedSecond = reusableServe(second);
    expect(reusedFirst?.url).toBe(handle.url);
    expect(reusedSecond?.url).toBe(handle.url);
    expect(reusedFirst?.pageKey).not.toBe(reusedSecond?.pageKey);

    // A viewer connecting now gets both pages, each in its own page ids.
    const scenes = (await readReplay(handle.url, 2)).filter((m) => m.kind === "scene");
    expect(new Set(scenes.map((m) => m.pageKey))).toEqual(
      new Set([reusedFirst?.pageKey, reusedSecond?.pageKey]),
    );
    for (const message of scenes) {
      const ids = Object.keys(message.payload.store);
      expect(ids).toContain(`page:${message.pageKey}`);
      expect(ids.every((id) => id.includes(message.pageKey))).toBe(true);
    }
  }, 60_000);

  it("serves a whole directory into the running server, ignoring what is not a diagram", async () => {
    bundleDir = await mkdtemp(join(tmpdir(), "tldx-shared-bundle-"));
    shared = await bootShared(bundleDir, "dir");
    const { handle, workDir, first, second, io } = shared;

    expect(shared.handoffCode, io.buf.stderr).toBe(0);
    // `first` was already the server's; `second` is the one the directory added.
    expect(io.buf.stdout).toContain(`already serving ${first}`);
    expect(io.buf.stdout).toContain(`added ${second}`);
    // One level only, diagrams only: `notes.md` and `nested/styles.tldx.jsx`
    // are not served.
    expect(io.buf.stdout).not.toContain("notes.md");
    expect(io.buf.stdout).not.toContain("styles.tldx.jsx");

    const record = findServer(first)!;
    expect(Object.keys(record.diagrams)).toHaveLength(2);
    expect(reusableServe(first)?.url).toBe(handle.url);
    expect(reusableServe(second)?.url).toBe(handle.url);
    expect(reusableServe(join(workDir, "nested", "styles.tldx.jsx"))).toBeUndefined();

    // Two pages on the wire, one per diagram in the directory.
    const scenes = (await readReplay(handle.url, 2)).filter((m) => m.kind === "scene");
    expect(new Set(scenes.map((m) => m.pageKey)).size).toBe(2);
  }, 60_000);

  it.skipIf(!canRender)(
    "renders each diagram off the shared server",
    async () => {
      shared = await bootShared(BUILT_VIEWER);
      const { workDir, first, second, deps, io } = shared;
      const outFirst = join(workDir, "first.png");
      const outSecond = join(workDir, "second.png");

      const codes = [
        await runRender({ argv: [first, outFirst, "--reuse-only"], deps, io }),
        await runRender({ argv: [second, outSecond, "--reuse-only"], deps, io }),
      ];

      expect(codes, io.buf.stderr).toEqual([0, 0]);
      // Two different diagrams: identical output would mean both exports came
      // off whichever page happened to be showing.
      const [a, b] = await Promise.all([stat(outFirst), stat(outSecond)]);
      expect(a.size).toBeGreaterThan(1000);
      expect(b.size).toBeGreaterThan(1000);
      expect(a.size).not.toBe(b.size);
    },
    180_000,
  );
});
