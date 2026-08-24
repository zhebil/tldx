/**
 * Fidelity harness (docs/plan.md T21): compile a fixture through a real
 * `tldx serve`, PUT a mutated snapshot over `/overlay` the way a browser
 * would, reload (a fresh SSE connection), and check that both the served
 * scene and a direct `applyOverlay` call reproduce the mutation exactly.
 *
 * `checkFidelity` never throws for a fidelity divergence - it returns
 * `FidelityFailure[]`, empty on a clean round-trip - because the whole point
 * is that a caller can hand it a deliberately lossy `apply` and observe red
 * (see `tests/e2e/fidelity-harness.test.ts`). Only genuine infrastructure
 * errors (server won't boot, fixture missing) propagate as thrown errors.
 */

import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";

import { runServe, type ServeHandle, type ServeIo } from "../../../src/cli/serve.js";
import { isOverlay, type Overlay } from "../../../src/contracts/overlay.js";
import type { SceneJSON } from "../../../src/contracts/scene-json.js";
import type { SceneMessage } from "../../../src/contracts/scene-message.js";
import type { Diagnostic } from "../../../src/domain/diagnostics/index.js";
import { applyOverlay, overlayPathFor } from "../../../src/domain/overlay/index.js";
import { createSystemClock } from "../../../src/infra/clock/system-clock.js";
import { createJsxExecute } from "../../../src/infra/execute-jsx/execute-jsx.js";
import { createChokidarWatch } from "../../../src/infra/fs/chokidar-watch.js";
import { createNodeFsRead } from "../../../src/infra/fs/node-fs-read.js";
import { createNodeFsWrite } from "../../../src/infra/fs/node-fs-write.js";
import { ElkLayoutAdapter } from "../../../src/infra/layout-elk/elk-layout.js";

import { buildMutatedScene } from "./mutate.js";

export type ApplyFn = (
  overlay: Overlay,
  scene: SceneJSON,
) => { scene: SceneJSON; diagnostics: Diagnostic[] };

export interface FidelityFailure {
  fixture: string;
  stage: "base" | "put" | "overlay-file" | "op-kinds" | "reload" | "apply";
  message: string;
}

const OP_KINDS = ["moved", "restyled", "relabelled", "deleted", "added"] as const;

function noopIo(): ServeIo {
  return { writeStdout: () => {}, writeStderr: () => {} };
}

/** Reads SSE events from a `fetch` body stream and returns the first
 *  `data:` payload, parsed as a `SceneMessage`. Shared by the harness and
 *  `overlay-serve.test.ts`, which drives the same server by hand. */
export async function readFirstSceneMessage(
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

function scenesEqual(expected: SceneJSON, actual: SceneJSON): boolean {
  try {
    assert.deepStrictEqual(actual, expected);
    return true;
  } catch {
    return false;
  }
}

/** Ids that are missing, unexpected, or whose JSON differs between two
 *  scenes, for the failure message - not the equality gate itself. */
function describeDivergence(expected: SceneJSON, actual: SceneJSON): string {
  const ids = new Set([...Object.keys(expected.store), ...Object.keys(actual.store)]);
  const diverging: string[] = [];
  for (const id of ids) {
    const e = expected.store[id];
    const a = actual.store[id];
    if (e === undefined) diverging.push(`${id} (unexpected)`);
    else if (a === undefined) diverging.push(`${id} (missing)`);
    else if (JSON.stringify(e) !== JSON.stringify(a)) diverging.push(`${id} (differs)`);
  }
  const shown = diverging.slice(0, 5);
  const suffix = diverging.length > 5 ? ` (+${diverging.length - 5} more)` : "";
  const noun = diverging.length === 1 ? "record" : "records";
  return `${diverging.length} ${noun}: ${shown.join(", ")}${suffix}`;
}

export async function checkFidelity(
  fixturePath: string,
  apply: ApplyFn = applyOverlay,
): Promise<FidelityFailure[]> {
  const name = basename(fixturePath);
  const failures: FidelityFailure[] = [];
  const fail = (stage: FidelityFailure["stage"], message: string): void => {
    failures.push({ fixture: name, stage, message: `${name}: ${message}` });
  };

  let handle: ServeHandle | undefined;
  let workDir: string | undefined;
  let bundleDir: string | undefined;

  try {
    workDir = await mkdtemp(join(tmpdir(), "tldx-fidelity-"));
    bundleDir = await mkdtemp(join(tmpdir(), "tldx-fidelity-bundle-"));
    // Recursive, not a single-file copy: some corpus fixtures (e.g.
    // c4-context.tldx.jsx) import a sibling module (./lib/c4.jsx), which
    // esbuild resolves against the entry's real directory.
    await cp(dirname(fixturePath), workDir, { recursive: true });
    const filePath = join(workDir, name);

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

    let base: SceneJSON;
    const firstConn = new AbortController();
    try {
      const res = await fetch(`${handle.url}events`, { signal: firstConn.signal });
      if (res.body === null) throw new Error("SSE response had no body");
      const message = await readFirstSceneMessage(res.body);
      if (message.kind !== "scene") {
        fail("base", `expected a scene message on connect, got "${message.kind}"`);
        return failures;
      }
      base = message.payload;
    } finally {
      firstConn.abort();
    }

    let mutated: SceneJSON;
    try {
      mutated = buildMutatedScene(name, base);
    } catch (err) {
      fail("base", `failed to build a mutated scene: ${(err as Error).message}`);
      return failures;
    }

    const putRes = await fetch(`${handle.url}overlay`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(mutated),
    });
    if (putRes.status !== 204) {
      fail("put", `PUT /overlay returned ${putRes.status}, expected 204`);
      return failures;
    }

    const overlayPath = overlayPathFor(filePath);
    let overlay: Overlay;
    try {
      const raw = await readFile(overlayPath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (!isOverlay(parsed)) {
        fail("overlay-file", `overlay file at ${overlayPath} did not parse as an Overlay`);
        return failures;
      }
      overlay = parsed;
    } catch (err) {
      fail(
        "overlay-file",
        `could not read/parse overlay file at ${overlayPath}: ${(err as Error).message}`,
      );
      return failures;
    }

    const opKinds = new Set<string>();
    for (const entry of Object.values(overlay.entries)) {
      if (entry.moved !== undefined) opKinds.add("moved");
      if (entry.restyled !== undefined) opKinds.add("restyled");
      if (entry.relabelled !== undefined) opKinds.add("relabelled");
      if (entry.deleted === true) opKinds.add("deleted");
      if (entry.added !== undefined) opKinds.add("added");
    }
    const missingKinds = OP_KINDS.filter((k) => !opKinds.has(k));
    if (missingKinds.length > 0) {
      fail("op-kinds", `overlay never exercises op kind(s): ${missingKinds.join(", ")}`);
      return failures;
    }

    const reloadConn = new AbortController();
    try {
      const res = await fetch(`${handle.url}events`, { signal: reloadConn.signal });
      if (res.body === null) throw new Error("SSE response had no body");
      const message = await readFirstSceneMessage(res.body);
      if (message.kind !== "scene") {
        fail("reload", `expected a scene message on reload, got "${message.kind}"`);
      } else if (!scenesEqual(mutated, message.payload)) {
        fail(
          "reload",
          `reloaded scene diverges from the canvas in ${describeDivergence(mutated, message.payload)}`,
        );
      }
    } finally {
      reloadConn.abort();
    }

    const { scene: applied, diagnostics } = apply(overlay, base);
    if (diagnostics.length > 0) {
      fail(
        "apply",
        `apply produced ${diagnostics.length} diagnostic(s): ${diagnostics
          .map((d) => d.message)
          .join("; ")}`,
      );
    }
    if (!scenesEqual(mutated, applied)) {
      fail(
        "apply",
        `applied scene diverges from the canvas in ${describeDivergence(mutated, applied)}`,
      );
    }
  } finally {
    if (handle !== undefined) await handle.close();
    if (workDir !== undefined) await rm(workDir, { recursive: true, force: true });
    if (bundleDir !== undefined) await rm(bundleDir, { recursive: true, force: true });
  }

  return failures;
}
