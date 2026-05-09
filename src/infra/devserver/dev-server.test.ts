/**
 * Contract test for the dev HTTP server. Boots an in-process server on an
 * ephemeral port (port 0) against a temp viewer bundle, then exercises the
 * three things the dev server has to get right:
 *
 * 1. Static bundle: GET `/index.html` and `/` both return the bundle's
 *    index document with the right content-type.
 * 2. SPA fallback: an unknown nested path falls through to index.html
 *    rather than 404, so client-side routing survives a hard reload.
 * 3. SSE wiring: opening a stream against `/events` and pushing a
 *    SceneMessage on the transport delivers the message to the connected
 *    client. We parse the SSE wire format by hand (no EventSource in node).
 *
 * No `node:http` here directly - we drive the server through `fetch`, so
 * test code stays at the same level a real client would see.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeClock } from "../../app/ports/clock.fake.js";
import { createSseTransport } from "../transport/sse-transport.js";
import type { SceneMessage } from "../../contracts/scene-message.js";

import { startDevServer, type DevServerHandle } from "./dev-server.js";

interface Booted {
  server: DevServerHandle;
  transport: ReturnType<typeof createSseTransport>;
  bundleDir: string;
}

/**
 * Wrap fetch with `Connection: close` so the underlying socket is not
 * pooled by undici's keep-alive agent. Without this, `server.close()` waits
 * up to ~3s per pooled socket for the keep-alive to expire before resolving,
 * which dominates this test's wall time. Production (`tldsl serve`) is
 * unaffected: the server side keeps default keep-alive behavior.
 */
async function closeFetch(
  input: string | URL,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Connection", "close");
  return fetch(input, { ...init, headers });
}

async function bootWithBundle(files: Record<string, string>): Promise<Booted> {
  const bundleDir = await mkdtemp(join(tmpdir(), "tldsl-devserver-"));
  for (const [name, body] of Object.entries(files)) {
    await writeFile(join(bundleDir, name), body, "utf8");
  }
  // FakeClock is never advanced in this test, so heartbeats never fire and
  // the SSE assertions stay deterministic.
  const transport = createSseTransport({ clock: new FakeClock() });
  const server = await startDevServer({
    port: 0,
    viewerBundleDir: bundleDir,
    transport,
  });
  return { server, transport, bundleDir };
}

async function teardown(booted: Booted | undefined): Promise<void> {
  if (booted === undefined) return;
  await booted.transport.close();
  await booted.server.close();
  await rm(booted.bundleDir, { recursive: true, force: true });
}

describe("startDevServer", () => {
  let booted: Booted | undefined;

  beforeEach(() => {
    booted = undefined;
  });

  afterEach(async () => {
    await teardown(booted);
  });

  it("serves index.html at the root", async () => {
    booted = await bootWithBundle({
      "index.html": "<!doctype html><title>v</title>",
    });

    const res = await closeFetch(`${booted.server.url}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toMatch(/text\/html/);
    expect(await res.text()).toContain("<title>v</title>");
  });

  it("serves a static asset with the right MIME", async () => {
    booted = await bootWithBundle({
      "index.html": "<!doctype html>",
      "app.js": "console.log('viewer')",
    });

    const res = await closeFetch(`${booted.server.url}app.js`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toMatch(/javascript/);
    expect(await res.text()).toBe("console.log('viewer')");
  });

  it("falls back to index.html for unknown paths (SPA routing)", async () => {
    booted = await bootWithBundle({
      "index.html": "<!doctype html><body data-spa=\"yes\"></body>",
    });

    const res = await closeFetch(`${booted.server.url}some/deep/route`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toMatch(/text\/html/);
    expect(await res.text()).toContain('data-spa="yes"');
  });

  it("rejects path traversal", async () => {
    booted = await bootWithBundle({ "index.html": "<!doctype html>" });

    // `..%2f` decodes to `../`; the resolver must refuse rather than read
    // outside the bundle root.
    const res = await closeFetch(`${booted.server.url}..%2fpackage.json`);

    expect(res.status).toBe(403);
  });

  it("delivers a pushed SceneMessage over /events", async () => {
    booted = await bootWithBundle({ "index.html": "<!doctype html>" });

    const controller = new AbortController();
    try {
      const response = await fetch(`${booted.server.url}events`, {
        signal: controller.signal,
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type") ?? "").toMatch(
        /text\/event-stream/,
      );
      if (response.body === null) {
        throw new Error("SSE response had no body");
      }

      const received: SceneMessage[] = [];
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let opened = false;

      const ready = (async (): Promise<void> => {
        const start = Date.now();
        while (Date.now() - start < 5000) {
          const { value, done } = await reader.read();
          if (done) return;
          buf += decoder.decode(value, { stream: true });
          let idx = buf.indexOf("\n\n");
          while (idx >= 0) {
            const event = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            if (event.startsWith(":")) {
              opened = true;
            } else {
              const dataLines = event
                .split("\n")
                .filter((l) => l.startsWith("data: "));
              if (dataLines.length > 0) {
                const data = dataLines
                  .map((l) => l.slice("data: ".length))
                  .join("\n");
                received.push(JSON.parse(data) as SceneMessage);
                return;
              }
            }
            idx = buf.indexOf("\n\n");
          }
          if (opened && received.length === 0) {
            // Stream is open but no message yet - push one.
            booted!.transport.push({
              v: 1,
              kind: "ping",
              payload: {},
            });
          }
        }
        throw new Error("timed out waiting for SSE message");
      })();

      await ready;

      expect(received).toHaveLength(1);
      expect(received[0]).toEqual({ v: 1, kind: "ping", payload: {} });
    } finally {
      controller.abort();
    }
  });

  it("rejects non-GET methods on static routes", async () => {
    booted = await bootWithBundle({ "index.html": "<!doctype html>" });

    const res = await closeFetch(`${booted.server.url}index.html`, {
      method: "POST",
    });

    expect(res.status).toBe(405);
    expect(res.headers.get("allow") ?? "").toMatch(/GET/);
  });
});
