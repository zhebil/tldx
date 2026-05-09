/**
 * Unit test for `runServe`. The composition is thin (transport +
 * dev-server + watchAndServe) and the e2e suite already exercises the
 * happy path end-to-end; this file pins the two behaviours that are easy
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
 *
 * Real adapters are used for the dev server + SSE transport (port 0 keeps
 * the bind ephemeral); domain ports are stubbed via the colocated fakes.
 */

import { createServer as createHttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeClock } from "../app/ports/clock.fake.js";
import { InMemoryFs } from "../app/ports/fs.fake.js";
import { CaptureLog } from "../app/ports/log.fake.js";
import { FakeWatch } from "../app/ports/watch.fake.js";
import { StubLayout } from "../domain/ports/layout.fake.js";

import { runServe, type ServeDeps, type ServeHandle, type ServeIo } from "./serve.js";

const VALID_DOC = `<doc id="d"><box id="a" label="hi" /></doc>`;

function makeIo(): ServeIo {
  return {
    writeStdout: () => {},
    writeStderr: () => {},
  };
}

function makeDeps(): ServeDeps {
  return {
    fs: new InMemoryFs({ "doc.tldsl": VALID_DOC }),
    watch: new FakeWatch(),
    layout: new StubLayout(),
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
    started = await runServe({ path: "doc.tldsl", deps: makeDeps(), io: makeIo() });
    await started.close();
    // Second close must not throw and must not reject (single-flight).
    await expect(started.close()).resolves.toBeUndefined();
  });

  it("close() resolves while an SSE client is connected", async () => {
    started = await runServe({ path: "doc.tldsl", deps: makeDeps(), io: makeIo() });
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
        runServe({ path: "doc.tldsl", deps, io: makeIo() }),
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
