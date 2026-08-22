/**
 * Unit test for `runServe`. The composition is thin (transport +
 * dev-server + watchAndServe) and the e2e suite already exercises the
 * happy path end-to-end; this file pins the behaviours that are easy
 * to break and not directly observable in the e2e:
 *
 * 1. `close()` is idempotent - calling it twice must not throw or
 *    double-close the underlying watcher / transport / server.
 * 2. A failed dev-server boot propagates the error from `runServe`. The
 *    cleanup of the already-created transport on this path is established
 *    by code review (the `try/catch` in `serve.ts` calls `transport.close`
 *    before rethrowing); a behavioural assertion would require exposing
 *    the internal transport, which would leak abstraction. Catching the
 *    propagated error here at least guarantees the error path is wired.
 * 3. `ServeHandle.compile` carries the initial compile's source hash
 *    (tldsl-usr/tldsl-46n).
 * 4. Omitting `fsWrite` disables the overlay round-trip entirely (tldsl-jwh:
 *    `render`'s read-only ephemeral server must never write a sidecar).
 * 5. A registered server's serve-registry record picks up the new hash
 *    after a recompile (tldsl-46n's staleness detection depends on this).
 *
 * Real adapters are used for the dev server + SSE transport (port 0 keeps
 * the bind ephemeral); domain ports are stubbed via the colocated fakes.
 */

import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeClock } from "../app/ports/clock.fake.js";
import { FakeExecute } from "../app/ports/execute.fake.js";
import { InMemoryFs } from "../app/ports/fs.fake.js";
import { CaptureLog } from "../app/ports/log.fake.js";
import { FakeWatch } from "../app/ports/watch.fake.js";
import { overlayPathFor } from "../domain/overlay/index.js";
import { StubLayout } from "../domain/ports/layout.fake.js";
import { findServe, hashSource, recordServe } from "../infra/serve-registry/serve-registry.js";

import { runServe, type ServeDeps, type ServeHandle, type ServeIo } from "./serve.js";

// FakeExecute has no result programmed for this source, so it falls back to
// its default empty-doc AST - real content doesn't matter for these tests.
const SRC = "export default function Diagram() { return null; }";

function makeIo(): ServeIo {
  return {
    writeStdout: () => {},
    writeStderr: () => {},
  };
}

function makeDeps(): ServeDeps {
  const fs = new InMemoryFs({ "doc.tldsl.jsx": SRC });
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
  });

  it("close() is idempotent", async () => {
    started = await runServe({ path: "doc.tldsl.jsx", deps: makeDeps(), io: makeIo() });
    await started.close();
    // Second close must not throw and must not reject (single-flight).
    await expect(started.close()).resolves.toBeUndefined();
  });

  it("close() resolves while an SSE client is connected", async () => {
    started = await runServe({ path: "doc.tldsl.jsx", deps: makeDeps(), io: makeIo() });
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
    started = await runServe({ path: "doc.tldsl.jsx", deps: makeDeps(), io: makeIo() });
    expect(started.compile.hash).toBe(hashSource(SRC));
  });

  it("omitting fsWrite disables the overlay round-trip - PUT /overlay is accepted but writes nothing", async () => {
    const deps = makeDeps();
    delete deps.fsWrite;
    started = await runServe({ path: "doc.tldsl.jsx", deps, io: makeIo() });

    const res = await fetch(`${started.url}overlay`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ store: {}, schema: {} }),
    });
    expect(res.status).toBe(204);

    const fs = deps.fs as InMemoryFs;
    expect(fs.has(overlayPathFor("doc.tldsl.jsx"))).toBe(false);
  });

  it("touches the serve registry's compile hash after a recompile, for a registered file", async () => {
    const deps = makeDeps();
    const watch = deps.watch as FakeWatch;
    const path = "doc.tldsl.jsx";
    started = await runServe({ path, deps, io: makeIo() });
    const forget = recordServe(path, started.url, started.compile);

    try {
      const fs = deps.fs as InMemoryFs;
      const nextSrc = `${SRC}\n// v2`;
      fs.setFile(path, nextSrc);
      watch.emitChange(path);

      const wantHash = hashSource(nextSrc);
      let record = findServe(path);
      for (let i = 0; i < 50 && record?.hash !== wantHash; i++) {
        await new Promise((r) => setTimeout(r, 10));
        record = findServe(path);
      }
      expect(record?.hash).toBe(wantHash);
    } finally {
      forget();
    }
  });

  it("propagates dev-server boot failure (port collision)", async () => {
    // Bind a real listener on 127.0.0.1 to grab a port; runServe targeting
    // the same port hits EADDRINUSE inside startDevServer, which rejects.
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
      await expect(
        runServe({ path: "doc.tldsl.jsx", deps, io: makeIo() }),
      ).rejects.toBeDefined();
    } finally {
      await new Promise<void>((resolve) => {
        blocker.close(() => {
          resolve();
        });
      });
    }
  });
});
