/**
 * Real adapters for the dev server and SSE transport (port 0 keeps the bind
 * ephemeral); domain ports are stubbed via the colocated fakes.
 */

import { createServer as createHttpServer } from "node:http";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeClock } from "../app/ports/clock.fake.js";
import { FakeExecute } from "../app/ports/execute.fake.js";
import { InMemoryFs } from "../app/ports/fs.fake.js";
import { CaptureLog } from "../app/ports/log.fake.js";
import { FakeWatch } from "../app/ports/watch.fake.js";
import { overlayPathFor } from "../domain/overlay/index.js";
import { StubLayout } from "../domain/ports/layout.fake.js";
import {
  claimServer,
  diagramOf,
  findServer,
  hashSource,
  pageKeyFor,
  type ServeClaim,
} from "../infra/serve-registry/serve-registry.js";

import {
  pageUrl,
  runServe,
  viewerStalenessWarning,
  type ServeDeps,
  type ServeHandle,
  type ServeIo,
} from "./serve.js";

// FakeExecute has no result programmed for this source, so it falls back to
// its default empty-doc AST.
const SRC = "export default function Diagram() { return null; }";

function makeIo(): ServeIo {
  return {
    writeStdout: () => {},
    writeStderr: () => {},
  };
}

/**
 * A real project directory on disk, so the registry's project-root walk and
 * page keys have something to resolve. The diagram sources themselves stay in
 * the in-memory fs the compile ports read.
 */
function makeProject(files: string[] = ["doc.tldx.jsx"]): { root: string; paths: string[] } {
  const root = mkdtempSync(join(tmpdir(), "tldx-serve-project-"));
  projectDirs.push(root);
  mkdirSync(join(root, ".git"));
  const paths = files.map((name) => {
    const path = join(root, name);
    writeFileSync(path, SRC);
    return path;
  });
  return { root, paths };
}

const projectDirs: string[] = [];
const claims: ServeClaim[] = [];

/** A claimed registry slot for `root`, released after the test. */
function makeClaim(root: string): ServeClaim {
  const claim = claimServer(root);
  if (claim === undefined) throw new Error("failed to claim the server slot");
  claims.push(claim);
  return claim;
}

function makeDeps(sources: Record<string, string> = { "doc.tldx.jsx": SRC }): ServeDeps {
  const fs = new InMemoryFs(sources);
  return {
    fs,
    fsWrite: fs,
    watch: new FakeWatch(),
    layout: new StubLayout(),
    execute: new FakeExecute(),
    log: new CaptureLog(),
    clock: new FakeClock(),
    viewerBundleDir: tmpdir(),
    host: "127.0.0.1",
    port: 0,
    openBrowser: () => {},
  };
}

describe("runServe", () => {
  let started: ServeHandle | undefined;

  beforeEach(() => {
    started = undefined;
  });

  afterEach(async () => {
    if (started !== undefined) await started.close();
    while (claims.length > 0) claims.pop()!.release();
    while (projectDirs.length > 0) rmSync(projectDirs.pop()!, { recursive: true, force: true });
  });

  it("close() is idempotent", async () => {
    started = await runServe({ path: "doc.tldx.jsx", deps: makeDeps(), io: makeIo() });
    await started.close();
    await expect(started.close()).resolves.toBeUndefined();
  });

  it("close() resolves while an SSE client is connected", async () => {
    started = await runServe({ path: "doc.tldx.jsx", deps: makeDeps(), io: makeIo() });
    const controller = new AbortController();
    try {
      const res = await fetch(`${started.url}events`, { signal: controller.signal });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type") ?? "").toMatch(/text\/event-stream/);

      let timeout: ReturnType<typeof setTimeout> | undefined;
      try {
        const outcome = await Promise.race([
          started.close().then(() => "closed" as const),
          new Promise<"timeout">((resolve) => {
            timeout = setTimeout(() => resolve("timeout"), 1_000);
          }),
        ]);
        expect(outcome).toBe("closed");
        started = undefined;
      } finally {
        if (timeout !== undefined) clearTimeout(timeout);
      }
    } finally {
      controller.abort();
    }
  });

  it("exposes the source hash of the initial compile on the handle", async () => {
    started = await runServe({ path: "doc.tldx.jsx", deps: makeDeps(), io: makeIo() });
    expect(started.compile.hash).toBe(hashSource(SRC));
  });

  it("exposes a non-zero code fingerprint on the handle (this checkout has a real src/ tree)", async () => {
    started = await runServe({ path: "doc.tldx.jsx", deps: makeDeps(), io: makeIo() });
    expect(started.compile.codeFingerprint).toBeGreaterThan(0);
  });

  it("omitting fsWrite disables the overlay round-trip - PUT /overlay is accepted but writes nothing", async () => {
    const { root, paths } = makeProject();
    const deps = makeDeps({ [paths[0]!]: SRC });
    deps.claim = makeClaim(root);
    delete deps.fsWrite;
    started = await runServe({ path: paths[0]!, deps, io: makeIo() });

    const res = await fetch(`${started.url}overlay`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-tldx-token": started.token },
      body: JSON.stringify({ pageKey: pageKeyFor(paths[0]!), snapshot: { store: {}, schema: {} } }),
    });
    expect(res.status).toBe(204);

    const fs = deps.fs as InMemoryFs;
    expect(fs.has(overlayPathFor(paths[0]!))).toBe(false);
  });

  it("touches the registry's compile hash after a recompile", async () => {
    const { root, paths } = makeProject();
    const path = paths[0]!;
    const deps = makeDeps({ [path]: SRC });
    deps.claim = makeClaim(root);
    const watch = deps.watch as FakeWatch;
    started = await runServe({ path, deps, io: makeIo() });
    deps.claim.publish(started.url, started.compile.codeFingerprint, started.ttlMinutes);

    const fs = deps.fs as InMemoryFs;
    const nextSrc = `${SRC}\n// v2`;
    fs.setFile(path, nextSrc);
    watch.emitChange(path);

    const wantHash = hashSource(nextSrc);
    let diagram = diagramOf(findServer(path)!, path);
    for (let i = 0; i < 50 && diagram?.hash !== wantHash; i++) {
      await new Promise((r) => setTimeout(r, 10));
      diagram = diagramOf(findServer(path)!, path);
    }
    expect(diagram?.hash).toBe(wantHash);
  });

  describe("many diagrams on one server", () => {
    it("adds a second diagram as its own page and is idempotent per file", async () => {
      const { root, paths } = makeProject(["a.tldx.jsx", "b.tldx.jsx"]);
      const [a, b] = paths as [string, string];
      const deps = makeDeps({ [a]: SRC, [b]: SRC });
      deps.claim = makeClaim(root);
      started = await runServe({ path: a, deps, io: makeIo() });
      deps.claim.publish(started.url, started.compile.codeFingerprint, started.ttlMinutes);

      const added = await started.addDiagram(b);
      expect(added).toMatchObject({ pageKey: pageKeyFor(b), alreadyServed: false });
      expect(added.pageKey).not.toBe(pageKeyFor(a));

      const again = await started.addDiagram(b);
      expect(again).toMatchObject({ pageKey: pageKeyFor(b), alreadyServed: true });

      // Both are discoverable through the one record for this project.
      const record = findServer(a)!;
      expect(Object.keys(record.diagrams)).toHaveLength(2);
      expect(diagramOf(record, b)?.pageKey).toBe(pageKeyFor(b));
    });

    it("reports whether a viewer is connected, which is what decides opening a tab", async () => {
      const { root, paths } = makeProject();
      const deps = makeDeps({ [paths[0]!]: SRC });
      deps.claim = makeClaim(root);
      started = await runServe({ path: paths[0]!, deps, io: makeIo() });

      expect(started.hasViewer()).toBe(false);

      const controller = new AbortController();
      try {
        await fetch(`${started.url}events`, { signal: controller.signal });
        for (let i = 0; i < 50 && !started.hasViewer(); i++) {
          await new Promise((r) => setTimeout(r, 10));
        }
        expect(started.hasViewer()).toBe(true);
      } finally {
        controller.abort();
      }
    });

    it("opens the browser on the served diagram's page", async () => {
      const { root, paths } = makeProject();
      const opened: string[] = [];
      const deps = makeDeps({ [paths[0]!]: SRC });
      deps.claim = makeClaim(root);
      deps.openBrowser = (url) => opened.push(url);
      started = await runServe({ path: paths[0]!, deps, io: makeIo() });

      expect(opened).toEqual([pageUrl(started.url, pageKeyFor(paths[0]!))]);
      expect(pageUrl("http://x/", "abc")).toBe("http://x/#page=abc");
    });
  });

  describe("idle-TTL reaper", () => {
    it("exits (resolves idleExpired) after ttlMinutes with no activity", async () => {
      const deps = makeDeps();
      deps.ttlMinutes = 1;
      const clock = deps.clock as FakeClock;
      const log = deps.log as CaptureLog;
      started = await runServe({ path: "doc.tldx.jsx", deps, io: makeIo() });

      clock.advance(59_000);
      expect(log.byCode("serve/idle-timeout")).toHaveLength(0);

      clock.advance(1_000);
      await started.idleExpired;
      expect(log.byCode("serve/idle-timeout")).toHaveLength(1);
    });

    it("an HTTP request defers expiry", async () => {
      const deps = makeDeps();
      deps.ttlMinutes = 1;
      const clock = deps.clock as FakeClock;
      started = await runServe({ path: "doc.tldx.jsx", deps, io: makeIo() });

      clock.advance(59_000);
      await fetch(started.url);
      clock.advance(59_000);

      let idleFired = false;
      void started.idleExpired.then(() => {
        idleFired = true;
      });
      await Promise.resolve();
      expect(idleFired).toBe(false);

      clock.advance(1_000);
      await started.idleExpired;
    });

    it("a file-change-triggered recompile defers expiry; the initial compile does not double-arm it", async () => {
      const deps = makeDeps();
      deps.ttlMinutes = 1;
      const clock = deps.clock as FakeClock;
      const watch = deps.watch as FakeWatch;
      const log = deps.log as CaptureLog;
      started = await runServe({ path: "doc.tldx.jsx", deps, io: makeIo() });

      // The boot compile logs one "watch/recompile-ok" but must not re-arm
      // the reaper on top of its construction-time arm.
      expect(log.byCode("watch/recompile-ok")).toHaveLength(1);

      clock.advance(59_000);
      watch.emitChange("doc.tldx.jsx");

      // Real timers: FakeExecute resolves on a macrotask, not the fake clock.
      for (let i = 0; i < 50 && log.byCode("watch/recompile-ok").length < 2; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5));
      }
      expect(log.byCode("watch/recompile-ok")).toHaveLength(2);

      // Without the bump this is past the original 60s deadline (59 + 59).
      clock.advance(59_000);
      let idleFired = false;
      void started.idleExpired.then(() => {
        idleFired = true;
      });
      await Promise.resolve();
      expect(idleFired).toBe(false);

      clock.advance(1_000);
      await started.idleExpired;
    });

    it("--ttl 0 (ttlMinutes: 0) never exits, even after a very long idle", async () => {
      const deps = makeDeps();
      deps.ttlMinutes = 0;
      const clock = deps.clock as FakeClock;
      started = await runServe({ path: "doc.tldx.jsx", deps, io: makeIo() });

      clock.advance(1_000 * 60 * 60 * 24 * 365);

      const sentinel = Symbol("not-yet");
      const outcome = await Promise.race([
        started.idleExpired.then(() => "expired" as const),
        Promise.resolve(sentinel),
      ]);
      expect(outcome).toBe(sentinel);
    });
  });

  it("propagates dev-server boot failure (port collision)", async () => {
    // Grab a port so runServe hits EADDRINUSE inside startDevServer.
    const blocker = createHttpServer();
    await new Promise<void>((resolve, reject) => {
      blocker.once("error", reject);
      blocker.listen(0, "127.0.0.1", () => {
        resolve();
      });
    });
    const blockedPort = (blocker.address() as AddressInfo).port;

    try {
      const deps = makeDeps();
      deps.port = blockedPort;
      await expect(runServe({ path: "doc.tldx.jsx", deps, io: makeIo() })).rejects.toBeDefined();
    } finally {
      await new Promise<void>((resolve) => {
        blocker.close(() => {
          resolve();
        });
      });
    }
  });
});

describe("viewerStalenessWarning", () => {
  const dirs: string[] = [];

  afterEach(() => {
    while (dirs.length > 0) rmSync(dirs.pop()!, { recursive: true, force: true });
  });

  function makeCheckout(): { distViewer: string; srcViewer: string } {
    const root = mkdtempSync(join(tmpdir(), "tldx-viewer-staleness-test-"));
    dirs.push(root);
    const distViewer = join(root, "dist", "viewer");
    const srcViewer = join(root, "src", "viewer");
    mkdirSync(distViewer, { recursive: true });
    mkdirSync(srcViewer, { recursive: true });
    writeFileSync(join(distViewer, "index.html"), "<!-- built -->");
    writeFileSync(join(srcViewer, "app.tsx"), "// source");
    return { distViewer, srcViewer };
  }

  it("is silent when dist/viewer is newer than every file in src/viewer", () => {
    const { distViewer, srcViewer } = makeCheckout();
    utimesSync(join(srcViewer, "app.tsx"), new Date(1000), new Date(1000));
    utimesSync(join(distViewer, "index.html"), new Date(2000), new Date(2000));

    expect(viewerStalenessWarning(distViewer)).toBeUndefined();
  });

  it("flags dist/viewer as stale when src/viewer has a file newer than the build", () => {
    const { distViewer, srcViewer } = makeCheckout();
    utimesSync(join(distViewer, "index.html"), new Date(1000), new Date(1000));
    utimesSync(join(srcViewer, "app.tsx"), new Date(2000), new Date(2000));

    expect(viewerStalenessWarning(distViewer)).toMatch(
      /dist\/viewer looks stale.*npm run build:viewer/,
    );
  });

  it("is silent when src/viewer doesn't exist next to dist/ (an installed package)", () => {
    const root = mkdtempSync(join(tmpdir(), "tldx-viewer-staleness-test-"));
    dirs.push(root);
    const distViewer = join(root, "dist", "viewer");
    mkdirSync(distViewer, { recursive: true });
    writeFileSync(join(distViewer, "index.html"), "<!-- built -->");

    expect(viewerStalenessWarning(distViewer)).toBeUndefined();
  });

  it("is silent when the bundle dir isn't inside a dist/ directory (custom bundle dir)", () => {
    const root = mkdtempSync(join(tmpdir(), "tldx-viewer-staleness-test-"));
    dirs.push(root);
    const customDir = join(root, "custom", "viewer");
    mkdirSync(customDir, { recursive: true });

    expect(viewerStalenessWarning(customDir)).toBeUndefined();
  });
});
