/**
 * E2E for `tldsl absorb` (docs/plan.md T22, docs/round-trip.md D3/D5).
 *
 * The acceptance criterion, verbatim from docs/plan.md: the canvas-first
 * case works end to end - a stub `<Doc/>` plus an overlay of hand-added
 * shapes absorbs into JSX that compiles, on its own and with an empty
 * overlay, to the same scene the canvas showed. Verified by T21's harness
 * (`checkFidelity`), not by inspection.
 *
 * Modeled on `tests/e2e/check-fixture.test.ts` (real adapters, `runXxxCli`
 * called directly) and `tests/e2e/overlay-serve.test.ts` (temp-dir setup).
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runAbsorbCli, type AbsorbIo } from "../../src/cli/absorb.js";
import { compileFile, type CompileFileDeps } from "../../src/app/compile-file.js";
import type { AbsorbDeps } from "../../src/app/absorb.js";
import { arrowShape, boxShape } from "../../src/contracts/builders.js";
import { OVERLAY_VERSION, type Overlay, type OverlayEntry } from "../../src/contracts/overlay.js";
import type { SceneJSON, TLRecord } from "../../src/contracts/scene-json.js";
import { applyOverlay, overlayPathFor, sceneHash } from "../../src/domain/overlay/index.js";
import { createJsxExecute } from "../../src/infra/execute-jsx/execute-jsx.js";
import { createNodeFsRead } from "../../src/infra/fs/node-fs-read.js";
import { createNodeFsWrite } from "../../src/infra/fs/node-fs-write.js";
import { ElkLayoutAdapter } from "../../src/infra/layout-elk/elk-layout.js";

import { checkFidelity } from "./fidelity/harness.js";

const STUB_SOURCE = [
  'import { Doc } from "tldsl";',
  "",
  "export default function Diagram() {",
  "  return <Doc/>;",
  "}",
  "",
].join("\n");

const workDirs: string[] = [];

afterEach(async () => {
  await Promise.all(workDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function makeWorkDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "tldsl-absorb-"));
  workDirs.push(dir);
  return dir;
}

function makeDeps(): AbsorbDeps {
  return {
    fs: createNodeFsRead(),
    fsWrite: createNodeFsWrite(),
    layout: new ElkLayoutAdapter(),
    execute: createJsxExecute(),
    gitStatus: async () => "no-repo",
  };
}

function compileFileDeps(deps: AbsorbDeps): CompileFileDeps {
  return { fs: deps.fs, layout: deps.layout, execute: deps.execute };
}

function makeCaptureIo(): AbsorbIo & { stdout: string; stderr: string } {
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

function pageIdOf(scene: SceneJSON): string {
  const page = Object.values(scene.store).find((r) => r.typeName === "page");
  if (page === undefined) throw new Error("compiled scene has no page record");
  return page.id;
}

async function writeOverlay(deps: AbsorbDeps, path: string, overlay: Overlay): Promise<void> {
  await deps.fsWrite.write(overlayPathFor(path), `${JSON.stringify(overlay, null, 2)}\n`);
}

describe("e2e: tldsl absorb - canvas-first case (T22 acceptance criterion)", () => {
  it("a stub <Doc/> plus an overlay of added shapes absorbs into JSX that compiles to the same scene, on its own and with an empty overlay", async () => {
    const dir = await makeWorkDir();
    const path = join(dir, "diagram.tldsl.jsx");
    const deps = makeDeps();
    await deps.fsWrite.write(path, STUB_SOURCE);

    const base = (await compileFile(path, compileFileDeps(deps))).sceneJson;
    if (base === null) throw new Error("stub failed to compile");
    const pageId = pageIdOf(base);

    const records: TLRecord[] = [
      boxShape({ id: "shape:abs-move", x: 0, y: 0, w: 100, h: 50, color: "red", fill: "solid", parentId: pageId, text: "One" }),
      boxShape({ id: "shape:abs-restyle", x: 200, y: 0, w: 80, h: 40, color: "blue", parentId: pageId, text: "Two" }),
      boxShape({ id: "shape:abs-label", x: 400, y: 0, w: 80, h: 40, color: "green", parentId: pageId, text: "Three" }),
      boxShape({ id: "shape:abs-delete", x: 600, y: 0, w: 80, h: 40, color: "orange", parentId: pageId, text: "Four" }),
    ];
    const entries: Record<string, OverlayEntry> = {};
    for (const record of records) entries[record.id] = { added: record };
    const overlay: Overlay = { v: OVERLAY_VERSION, basedOn: sceneHash(base), entries };
    await writeOverlay(deps, path, overlay);

    const target = applyOverlay(overlay, base).scene;

    const io = makeCaptureIo();
    const exitCode = await runAbsorbCli({ path, force: false, deps, io });
    expect(exitCode).toBe(0);
    expect(io.stderr).toContain(".bak");

    const overlayRaw = await readFile(overlayPathFor(path), "utf8");
    const overlayOnDisk = JSON.parse(overlayRaw) as Overlay;
    expect(overlayOnDisk.entries).toEqual({});

    const rewrittenScene = (await compileFile(path, compileFileDeps(deps))).sceneJson;
    if (rewrittenScene === null) throw new Error("rewritten source failed to compile");
    assert.deepStrictEqual(rewrittenScene, target);

    const failures = await checkFidelity(path);
    expect(failures).toEqual([]);
  }, 30_000);

  it("absorbs what it can express and leaves the rest in the overlay (residual moved/added-arrow entries)", async () => {
    const dir = await makeWorkDir();
    const path = join(dir, "diagram.tldsl.jsx");
    const deps = makeDeps();
    await deps.fsWrite.write(path, STUB_SOURCE);

    const base = (await compileFile(path, compileFileDeps(deps))).sceneJson;
    if (base === null) throw new Error("stub failed to compile");
    const pageId = pageIdOf(base);

    const absorbable = boxShape({ id: "shape:abs-only", x: 0, y: 0, w: 60, h: 30, parentId: pageId, text: "Absorb me" });
    const residualArrow = arrowShape({ id: "shape:leave-me", x: 0, y: 0, parentId: pageId });

    const entries: Record<string, OverlayEntry> = {
      [absorbable.id]: { added: absorbable },
      [residualArrow.id]: { added: residualArrow },
      "shape:ghost": { moved: { x: 1, y: 1 } },
    };
    const overlay: Overlay = { v: OVERLAY_VERSION, basedOn: sceneHash(base), entries };
    await writeOverlay(deps, path, overlay);

    const target = applyOverlay(overlay, base).scene;

    const io = makeCaptureIo();
    const exitCode = await runAbsorbCli({ path, force: false, deps, io });
    expect(exitCode).toBe(0);

    const overlayOnDisk = JSON.parse(await readFile(overlayPathFor(path), "utf8")) as Overlay;
    expect(Object.keys(overlayOnDisk.entries).sort()).toEqual(["shape:ghost", "shape:leave-me"].sort());
    expect(overlayOnDisk.entries["shape:leave-me"]).toEqual({ added: residualArrow });

    const rewrittenScene = (await compileFile(path, compileFileDeps(deps))).sceneJson;
    if (rewrittenScene === null) throw new Error("rewritten source failed to compile");
    const result = applyOverlay(overlayOnDisk, rewrittenScene).scene;
    assert.deepStrictEqual(result, target);
  });

  it("refuses (exit 1) and leaves source + overlay byte-identical when the rewrite can't verifiably reproduce the render", async () => {
    const dir = await makeWorkDir();
    const path = join(dir, "diagram.tldsl.jsx");
    const deps = makeDeps();
    await deps.fsWrite.write(path, STUB_SOURCE);

    const base = (await compileFile(path, compileFileDeps(deps))).sceneJson;
    if (base === null) throw new Error("stub failed to compile");
    const pageId = pageIdOf(base);

    // rotation has no JSX prop (docs/dsl.md's <Box> prop list has none) -
    // absorb can generate a Box for this record, but the rewrite can never
    // reproduce a non-zero rotation, so verification must fail.
    const unexpressible: TLRecord = {
      ...boxShape({ id: "shape:spun", x: 0, y: 0, w: 40, h: 40, parentId: pageId, text: "Spun" }),
      rotation: 0.3,
    };
    const entries: Record<string, OverlayEntry> = { [unexpressible.id]: { added: unexpressible } };
    const overlay: Overlay = { v: OVERLAY_VERSION, basedOn: sceneHash(base), entries };
    await writeOverlay(deps, path, overlay);

    const sourceBefore = await readFile(path, "utf8");
    const overlayBefore = await readFile(overlayPathFor(path), "utf8");

    const io = makeCaptureIo();
    const exitCode = await runAbsorbCli({ path, force: false, deps, io });
    expect(exitCode).toBe(1);
    expect(io.stderr).not.toBe("");

    const sourceAfter = await readFile(path, "utf8");
    const overlayAfter = await readFile(overlayPathFor(path), "utf8");
    expect(sourceAfter).toBe(sourceBefore);
    expect(overlayAfter).toBe(overlayBefore);
  });
});
