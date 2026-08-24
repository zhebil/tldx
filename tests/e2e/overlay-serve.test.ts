/**
 * E2E for the overlay round-trip end to end through `tldx serve`
 * (docs/round-trip.md D4): a browser PUTs a canvas edit, the server writes
 * the overlay file and re-pushes the applied scene, and - because the SSE
 * transport replays its last message to new subscribers - a fresh
 * connection (standing in for a page reload) sees the edited scene rather
 * than the pre-edit compile. This is the acceptance criterion for T20: a
 * reload must not lose canvas edits.
 *
 * Modeled on `tests/e2e/serve-fixture.test.ts`: in-process `runServe`, real
 * adapters, stubbed `openBrowser`, hand-rolled SSE parsing.
 */

import { mkdtemp, copyFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runServe, type ServeHandle, type ServeIo } from "../../src/cli/serve.js";
import { boxShape } from "../../src/contracts/builders.js";
import { isOverlay } from "../../src/contracts/overlay.js";
import type { SceneJSON, TLRecord } from "../../src/contracts/scene-json.js";
import { overlayPathFor } from "../../src/domain/overlay/index.js";
import { createSystemClock } from "../../src/infra/clock/system-clock.js";
import { createJsxExecute } from "../../src/infra/execute-jsx/execute-jsx.js";
import { createChokidarWatch } from "../../src/infra/fs/chokidar-watch.js";
import { createNodeFsRead } from "../../src/infra/fs/node-fs-read.js";
import { createNodeFsWrite } from "../../src/infra/fs/node-fs-write.js";
import { ElkLayoutAdapter } from "../../src/infra/layout-elk/elk-layout.js";

import { readFirstSceneMessage } from "./fidelity/harness.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");

function noopIo(): ServeIo {
  return { writeStdout: () => {}, writeStderr: () => {} };
}

function propsOf(record: TLRecord): Record<string, unknown> {
  return (record.props as Record<string, unknown> | undefined) ?? {};
}

/** Simulates what the browser's overlay-writer would PUT: a full document
 *  snapshot with a shape moved, a shape restyled, and a new shape added. */
function buildMutatedSnapshot(base: SceneJSON): SceneJSON {
  const shapes = Object.values(base.store).filter((r) => r.typeName === "shape");
  const withSize = shapes.find((r) => typeof propsOf(r).w === "number");
  const withColor = shapes.find((r) => r.id !== withSize?.id && typeof propsOf(r).color === "string");
  const page = Object.values(base.store).find((r) => r.typeName === "page");
  if (withSize === undefined || withColor === undefined || page === undefined) {
    throw new Error("fixture does not have enough shapes to build a mutated snapshot");
  }

  const store: Record<string, TLRecord> = structuredClone(base.store);

  const moveRec = store[withSize.id];
  if (moveRec === undefined) throw new Error("move target vanished from the clone");
  moveRec.x = (moveRec.x as number) + 40;
  moveRec.y = (moveRec.y as number) + 30;

  const restyleRec = store[withColor.id];
  if (restyleRec === undefined) throw new Error("restyle target vanished from the clone");
  const currentColor = propsOf(restyleRec).color as string;
  restyleRec.props = { ...propsOf(restyleRec), color: currentColor === "red" ? "blue" : "red" };

  const addedId = "shape:overlay-serve-added";
  store[addedId] = boxShape({
    id: addedId,
    x: 900,
    y: 900,
    w: 50,
    h: 25,
    parentId: page.id,
    text: "added from the browser",
  });

  return { store, schema: base.schema };
}

describe("e2e: overlay round-trip through tldx serve", () => {
  let handle: ServeHandle | undefined;
  let workDir: string | undefined;
  let bundleDir: string | undefined;

  beforeEach(() => {
    handle = undefined;
    workDir = undefined;
    bundleDir = undefined;
  });

  afterEach(async () => {
    if (handle !== undefined) await handle.close();
    if (workDir !== undefined) await rm(workDir, { recursive: true, force: true });
    if (bundleDir !== undefined) await rm(bundleDir, { recursive: true, force: true });
  });

  it(
    "reloading the served page reproduces the pre-reload scene",
    async () => {
      workDir = await mkdtemp(join(tmpdir(), "tldx-overlay-serve-"));
      bundleDir = await mkdtemp(join(tmpdir(), "tldx-overlay-serve-bundle-"));
      const filePath = join(workDir, "auth.tldx.jsx");
      await copyFile(join(FIXTURES, "auth.tldx.jsx"), filePath);

      handle = await runServe({
        path: filePath,
        deps: {
          fs: createNodeFsRead(),
          fsWrite: createNodeFsWrite(),
          watch: createChokidarWatch(),
          layout: new ElkLayoutAdapter(),
          execute: createJsxExecute(),
          log: { log: () => {} },
          clock: createSystemClock(),
          viewerBundleDir: bundleDir,
          openBrowser: () => {},
        },
        io: noopIo(),
      });

      const firstConn = new AbortController();
      let base: SceneJSON;
      try {
        const res = await fetch(`${handle.url}events`, { signal: firstConn.signal });
        if (res.body === null) throw new Error("SSE response had no body");
        const message = await readFirstSceneMessage(res.body);
        expect(message.kind).toBe("scene");
        if (message.kind !== "scene") throw new Error("expected a scene message");
        base = message.payload;
      } finally {
        firstConn.abort();
      }

      const mutated = buildMutatedSnapshot(base);

      const putRes = await fetch(`${handle.url}overlay`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(mutated),
      });
      expect(putRes.status).toBe(204);

      const overlayPath = overlayPathFor(filePath);
      const overlayRaw = await readFile(overlayPath, "utf8");
      const overlayParsed: unknown = JSON.parse(overlayRaw);
      expect(isOverlay(overlayParsed)).toBe(true);

      const reloadConn = new AbortController();
      try {
        const res = await fetch(`${handle.url}events`, { signal: reloadConn.signal });
        if (res.body === null) throw new Error("SSE response had no body");
        const message = await readFirstSceneMessage(res.body);
        expect(message.kind).toBe("scene");
        if (message.kind !== "scene") throw new Error("expected a scene message");
        expect(message.payload).toEqual(mutated);
      } finally {
        reloadConn.abort();
      }
    },
    30_000,
  );
});
