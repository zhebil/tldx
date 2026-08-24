/**
 * Boots an in-process dev server on an ephemeral port against a temp viewer
 * bundle. Everything is driven through `fetch`, at the level a real client
 * sees; the SSE wire format is parsed by hand, since node has no EventSource.
 */

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FakeClock } from "../../app/ports/clock.fake.js";
import { createSseTransport } from "../transport/sse-transport.js";
import type { SceneJSON } from "../../contracts/scene-json.js";
import type { SceneMessage } from "../../contracts/scene-message.js";

import { startDevServer, type AddDiagramResult, type DevServerHandle } from "./dev-server.js";

interface Booted {
  server: DevServerHandle;
  transport: ReturnType<typeof createSseTransport>;
  bundleDir: string;
}

/**
 * Wrap fetch with `Connection: close` so the underlying socket is not
 * pooled by undici's keep-alive agent. Without this, `server.close()` waits
 * up to ~3s per pooled socket for the keep-alive to expire before resolving,
 * which dominates this test's wall time. Production (`tldx serve`) is
 * unaffected: the server side keeps default keep-alive behavior.
 */
async function closeFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Connection", "close");
  return fetch(input, { ...init, headers });
}

const TOKEN = "test-token";

async function bootWithBundle(
  files: Record<string, string>,
  onOverlayPut?: (pageKey: string, snapshot: SceneJSON) => Promise<void>,
  onActivity?: () => void,
  onAddDiagram?: (file: string) => Promise<AddDiagramResult>,
): Promise<Booted> {
  const bundleDir = await mkdtemp(join(tmpdir(), "tldx-devserver-"));
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
    token: TOKEN,
    ...(onOverlayPut !== undefined ? { onOverlayPut } : {}),
    ...(onActivity !== undefined ? { onActivity } : {}),
    ...(onAddDiagram !== undefined ? { onAddDiagram } : {}),
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
      "index.html": '<!doctype html><body data-spa="yes"></body>',
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
      expect(response.headers.get("content-type") ?? "").toMatch(/text\/event-stream/);
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
              const dataLines = event.split("\n").filter((l) => l.startsWith("data: "));
              if (dataLines.length > 0) {
                const data = dataLines.map((l) => l.slice("data: ".length)).join("\n");
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

  it("still 405s POST on other static routes when onOverlayPut is configured", async () => {
    booted = await bootWithBundle({ "index.html": "<!doctype html>" }, async () => {});

    const res = await closeFetch(`${booted.server.url}index.html`, {
      method: "POST",
    });

    expect(res.status).toBe(405);
  });

  it("fires onActivity for a static asset, an /events connect, and a /heartbeat ping", async () => {
    let activity = 0;
    booted = await bootWithBundle({ "index.html": "<!doctype html>" }, undefined, () => activity++);

    await closeFetch(`${booted.server.url}index.html`);
    expect(activity).toBe(1);

    const heartbeatRes = await closeFetch(`${booted.server.url}heartbeat`);
    expect(heartbeatRes.status).toBe(204);
    expect(activity).toBe(2);

    const controller = new AbortController();
    try {
      await fetch(`${booted.server.url}events`, { signal: controller.signal });
      expect(activity).toBe(3);
    } finally {
      controller.abort();
    }
  });

  describe("PUT /overlay", () => {
    const snapshot: SceneJSON = {
      store: { "shape:a": { id: "shape:a", typeName: "shape" } },
      schema: { schemaVersion: 2, sequences: {} },
    };

    /** A well-formed authenticated overlay PUT; `overrides` bend one thing at a time. */
    function putOverlay(overrides: { headers?: Record<string, string>; body?: string } = {}) {
      return closeFetch(`${booted!.server.url}overlay`, {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          "x-tldx-token": TOKEN,
          ...overrides.headers,
        },
        body: overrides.body ?? JSON.stringify({ pageKey: "abc123", snapshot }),
      });
    }

    it("404s when no handler is configured", async () => {
      booted = await bootWithBundle({ "index.html": "<!doctype html>" });

      expect((await putOverlay()).status).toBe(404);
    });

    it("204s and forwards the page key and parsed snapshot to the handler", async () => {
      let received: { pageKey: string; snapshot: SceneJSON } | undefined;
      booted = await bootWithBundle({ "index.html": "<!doctype html>" }, async (pageKey, s) => {
        received = { pageKey, snapshot: s };
      });

      const res = await putOverlay();

      expect(res.status).toBe(204);
      expect(received).toEqual({ pageKey: "abc123", snapshot });
    });

    it("400s when the page key is missing", async () => {
      booted = await bootWithBundle({ "index.html": "<!doctype html>" }, async () => {});

      expect((await putOverlay({ body: JSON.stringify({ snapshot }) })).status).toBe(400);
    });

    it("403s without the token, and does not reach the handler", async () => {
      let called = false;
      booted = await bootWithBundle({ "index.html": "<!doctype html>" }, async () => {
        called = true;
      });

      expect((await putOverlay({ headers: { "x-tldx-token": "wrong" } })).status).toBe(403);
      expect(called).toBe(false);
    });

    it("400s on a malformed body", async () => {
      booted = await bootWithBundle({ "index.html": "<!doctype html>" }, async () => {});

      expect(
        (
          await putOverlay({
            body: JSON.stringify({ pageKey: "abc123", snapshot: { notAScene: true } }),
          })
        ).status,
      ).toBe(400);
    });

    it("400s on a non-JSON body", async () => {
      booted = await bootWithBundle({ "index.html": "<!doctype html>" }, async () => {});

      expect((await putOverlay({ body: "not json" })).status).toBe(400);
    });

    it("500s when the handler throws", async () => {
      booted = await bootWithBundle({ "index.html": "<!doctype html>" }, async () => {
        throw new Error("boom");
      });

      expect((await putOverlay()).status).toBe(500);
    });
  });

  describe("POST /diagrams", () => {
    /** A well-formed authenticated handoff; `overrides` bend one thing at a time. */
    function postDiagram(overrides: { headers?: Record<string, string>; body?: string } = {}) {
      return closeFetch(`${booted!.server.url}diagrams`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tldx-token": TOKEN,
          ...overrides.headers,
        },
        body: overrides.body ?? JSON.stringify({ file: "/tmp/a.tldx.jsx" }),
      });
    }

    it("404s when no handler is configured", async () => {
      booted = await bootWithBundle({ "index.html": "<!doctype html>" });

      expect((await postDiagram()).status).toBe(404);
    });

    it("adds the diagram and returns its page key", async () => {
      let received: string | undefined;
      booted = await bootWithBundle(
        { "index.html": "<!doctype html>" },
        undefined,
        undefined,
        async (file) => {
          received = file;
          return { pageKey: "abc123", alreadyServed: false, hasViewer: false };
        },
      );

      const res = await postDiagram();

      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        pageKey: "abc123",
        alreadyServed: false,
        hasViewer: false,
      });
      expect(received).toBe("/tmp/a.tldx.jsx");
    });

    it("403s on a wrong token, without compiling anything", async () => {
      let called = false;
      booted = await bootWithBundle(
        { "index.html": "<!doctype html>" },
        undefined,
        undefined,
        async () => {
          called = true;
          return { pageKey: "abc123", alreadyServed: false, hasViewer: false };
        },
      );

      expect((await postDiagram({ headers: { "x-tldx-token": "wrong" } })).status).toBe(403);
      expect(called).toBe(false);
    });

    it("403s a cross-site request even with the token, without compiling anything", async () => {
      let called = false;
      booted = await bootWithBundle(
        { "index.html": "<!doctype html>" },
        undefined,
        undefined,
        async () => {
          called = true;
          return { pageKey: "abc123", alreadyServed: false, hasViewer: false };
        },
      );

      expect((await postDiagram({ headers: { origin: "https://evil.example" } })).status).toBe(403);
      expect(called).toBe(false);
    });

    it("415s a non-JSON content type, without compiling anything", async () => {
      let called = false;
      booted = await bootWithBundle(
        { "index.html": "<!doctype html>" },
        undefined,
        undefined,
        async () => {
          called = true;
          return { pageKey: "abc123", alreadyServed: false, hasViewer: false };
        },
      );

      expect((await postDiagram({ headers: { "content-type": "text/plain" } })).status).toBe(415);
      expect(called).toBe(false);
    });

    it("400s when the file is missing from the body", async () => {
      booted = await bootWithBundle(
        { "index.html": "<!doctype html>" },
        undefined,
        undefined,
        async () => ({
          pageKey: "abc123",
          alreadyServed: false,
          hasViewer: false,
        }),
      );

      expect((await postDiagram({ body: JSON.stringify({}) })).status).toBe(400);
    });

    it("500s with the reason when the handler throws", async () => {
      booted = await bootWithBundle(
        { "index.html": "<!doctype html>" },
        undefined,
        undefined,
        async () => {
          throw new Error("no such file");
        },
      );

      const res = await postDiagram();

      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: "no such file" });
    });
  });
});
