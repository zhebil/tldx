/**
 * E2E for the `/tldx:sync` workflow: drive the three CLI entry points the
 * slash command calls, in order, against a stub `<Doc/>` plus an overlay of
 * hand-added shapes. `overlay show` reports the pending shapes, `absorb`
 * folds them into the source and empties the overlay, `verify` confirms the
 * source alone reproduces the canvas.
 */

import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { AbsorbDeps } from "../../src/app/absorb.js";
import { compileFile, type CompileFileDeps } from "../../src/app/compile-file.js";
import type { VerifyDeps } from "../../src/app/verify.js";
import { runAbsorbCli, type AbsorbIo } from "../../src/cli/absorb.js";
import { runOverlayCli, type OverlayIo } from "../../src/cli/overlay.js";
import { runVerifyCli, type VerifyIo } from "../../src/cli/verify.js";
import { boxShape } from "../../src/contracts/builders.js";
import { OVERLAY_VERSION, type Overlay, type OverlayEntry } from "../../src/contracts/overlay.js";
import type { SceneJSON, TLRecord } from "../../src/contracts/scene-json.js";
import { overlayPathFor, sceneHash } from "../../src/domain/overlay/index.js";
import { createJsxExecute } from "../../src/infra/execute-jsx/execute-jsx.js";
import { createNodeFsRead } from "../../src/infra/fs/node-fs-read.js";
import { createNodeFsWrite } from "../../src/infra/fs/node-fs-write.js";
import { ElkLayoutAdapter } from "../../src/infra/layout-elk/elk-layout.js";

const STUB_SOURCE = [
  'import { Doc } from "tldx";',
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
  const dir = await mkdtemp(join(tmpdir(), "tldx-sync-"));
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

function verifyDeps(deps: AbsorbDeps): VerifyDeps {
  return { fs: deps.fs, layout: deps.layout, execute: deps.execute };
}

function makeCaptureIo(): AbsorbIo & OverlayIo & VerifyIo & { stdout: string; stderr: string } {
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

describe("e2e: tldx:sync workflow - overlay show -> absorb -> verify", () => {
  it("shows the pending shapes, absorbs them, then verifies the source alone reproduces the canvas", async () => {
    const dir = await makeWorkDir();
    const path = join(dir, "diagram.tldx.jsx");
    const deps = makeDeps();
    await deps.fsWrite.write(path, STUB_SOURCE);

    const base = (await compileFile(path, compileFileDeps(deps))).sceneJson;
    if (base === null) throw new Error("stub failed to compile");
    const pageId = pageIdOf(base);

    const records: TLRecord[] = [
      boxShape({ id: "shape:abs-move", x: 0, y: 0, w: 100, h: 50, color: "red", fill: "solid", parentId: pageId, text: "One", index: "a1" }),
      boxShape({ id: "shape:abs-restyle", x: 200, y: 0, w: 80, h: 40, color: "blue", parentId: pageId, text: "Two", index: "a3" }),
      boxShape({ id: "shape:abs-label", x: 400, y: 0, w: 80, h: 40, color: "green", parentId: pageId, text: "Three", index: "a5" }),
      boxShape({ id: "shape:abs-delete", x: 600, y: 0, w: 80, h: 40, color: "orange", parentId: pageId, text: "Four", index: "a7" }),
    ];
    const entries: Record<string, OverlayEntry> = {};
    for (const record of records) entries[record.id] = { added: record };
    const overlay: Overlay = { v: OVERLAY_VERSION, basedOn: sceneHash(base), entries };
    await writeOverlay(deps, path, overlay);

    // 1. overlay show - reports every pending shape.
    const showIo = makeCaptureIo();
    const showExit = await runOverlayCli({ argv: ["show", path], deps: verifyDeps(deps), io: showIo });
    expect(showExit).toBe(0);
    for (const record of records) {
      expect(showIo.stdout).toContain(record.id);
    }

    // 2. absorb - folds the absorbable shapes into the source.
    const absorbIo = makeCaptureIo();
    const absorbExit = await runAbsorbCli({ path, force: false, deps, io: absorbIo });
    expect(absorbExit).toBe(0);

    const overlayOnDisk = JSON.parse(await readFile(overlayPathFor(path), "utf8")) as Overlay;
    expect(overlayOnDisk.entries).toEqual({});

    // 3. verify - the source alone now reproduces the canvas.
    const verifyIo = makeCaptureIo();
    const verifyExit = await runVerifyCli({ path, deps: verifyDeps(deps), io: verifyIo });
    expect(verifyExit).toBe(0);
    expect(verifyIo.stdout).toContain("the source is the whole diagram");
  }, 30_000);
});
