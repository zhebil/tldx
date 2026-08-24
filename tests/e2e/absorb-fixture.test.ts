/**
 * E2E for `tldx absorb`: a stub `<Doc/>` plus an overlay of hand-added
 * shapes absorbs into JSX that compiles back to the same scene the canvas
 * showed. Uses real adapters and verifies with `checkFidelity`.
 */

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { runAbsorbCli, type AbsorbIo } from "../../src/cli/absorb.js";
import { compileFile, type CompileFileDeps } from "../../src/app/compile-file.js";
import { runAbsorb, type AbsorbDeps } from "../../src/app/absorb.js";
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
  const dir = await mkdtemp(join(tmpdir(), "tldx-absorb-"));
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

describe("e2e: tldx absorb - canvas-first case", () => {
  it("a stub <Doc/> plus an overlay of added shapes absorbs into JSX that compiles to the same scene, on its own and with an empty overlay", async () => {
    const dir = await makeWorkDir();
    const path = join(dir, "diagram.tldx.jsx");
    const deps = makeDeps();
    await deps.fsWrite.write(path, STUB_SOURCE);

    const base = (await compileFile(path, compileFileDeps(deps))).sceneJson;
    if (base === null) throw new Error("stub failed to compile");
    const pageId = pageIdOf(base);

    const records: TLRecord[] = [
      boxShape({
        id: "shape:abs-move",
        x: 0,
        y: 0,
        w: 100,
        h: 50,
        color: "red",
        fill: "solid",
        parentId: pageId,
        text: "One",
        index: "a1",
      }),
      boxShape({
        id: "shape:abs-restyle",
        x: 200,
        y: 0,
        w: 80,
        h: 40,
        color: "blue",
        parentId: pageId,
        text: "Two",
        index: "a3",
      }),
      boxShape({
        id: "shape:abs-label",
        x: 400,
        y: 0,
        w: 80,
        h: 40,
        color: "green",
        parentId: pageId,
        text: "Three",
        index: "a5",
      }),
      boxShape({
        id: "shape:abs-delete",
        x: 600,
        y: 0,
        w: 80,
        h: 40,
        color: "orange",
        parentId: pageId,
        text: "Four",
        index: "a7",
      }),
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
    const path = join(dir, "diagram.tldx.jsx");
    const deps = makeDeps();
    await deps.fsWrite.write(path, STUB_SOURCE);

    const base = (await compileFile(path, compileFileDeps(deps))).sceneJson;
    if (base === null) throw new Error("stub failed to compile");
    const pageId = pageIdOf(base);

    const absorbable = boxShape({
      id: "shape:abs-only",
      x: 0,
      y: 0,
      w: 60,
      h: 30,
      parentId: pageId,
      text: "Absorb me",
    });
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
    expect(Object.keys(overlayOnDisk.entries).sort()).toEqual(
      ["shape:ghost", "shape:leave-me"].sort(),
    );
    expect(overlayOnDisk.entries["shape:leave-me"]).toEqual({ added: residualArrow });

    const rewrittenScene = (await compileFile(path, compileFileDeps(deps))).sceneJson;
    if (rewrittenScene === null) throw new Error("rewritten source failed to compile");
    const result = applyOverlay(overlayOnDisk, rewrittenScene).scene;
    assert.deepStrictEqual(result, target);
  });

  it("refuses (exit 1) and leaves source + overlay byte-identical when the rewrite can't verifiably reproduce the render", async () => {
    const dir = await makeWorkDir();
    const path = join(dir, "diagram.tldx.jsx");
    const deps = makeDeps();
    await deps.fsWrite.write(path, STUB_SOURCE);

    const base = (await compileFile(path, compileFileDeps(deps))).sceneJson;
    if (base === null) throw new Error("stub failed to compile");
    const pageId = pageIdOf(base);

    // rotation has no JSX prop, so the rewrite can never reproduce a
    // non-zero rotation and verification must fail.
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

/**
 * Each test builds its ground truth by compiling a second, already-edited
 * source (reordered children / a wider gap) and reading the dragged shape's
 * real coordinates off that compile, so the overlay entry under test is
 * what a real drag would produce rather than a hand-guessed number.
 */
describe("e2e: tldx absorb - move ladder", () => {
  const ROW_SOURCE = [
    'import { Doc, Box } from "tldx";',
    "",
    "export default function Diagram() {",
    "  return (",
    '    <Doc layout="row">',
    '      <Box id="a" w="100" h="50" />',
    '      <Box id="b" w="100" h="50" />',
    '      <Box id="c" w="100" h="50" />',
    "    </Doc>",
    "  );",
    "}",
    "",
  ].join("\n");

  const REORDERED_SOURCE = [
    'import { Doc, Box } from "tldx";',
    "",
    "export default function Diagram() {",
    "  return (",
    '    <Doc layout="row">',
    '      <Box id="c" w="100" h="50" />',
    '      <Box id="a" w="100" h="50" />',
    '      <Box id="b" w="100" h="50" />',
    "    </Doc>",
    "  );",
    "}",
    "",
  ].join("\n");

  /** Same relaxation `app/absorb.ts`'s `diffIds` applies: `index` is an
   *  emit-order artifact a reorder necessarily reassigns, not user data. */
  function stripIndex(scene: SceneJSON): SceneJSON {
    const store = Object.fromEntries(
      Object.entries(scene.store).map(([id, record]) => [
        id,
        Object.fromEntries(Object.entries(record).filter(([key]) => key !== "index")),
      ]),
    ) as SceneJSON["store"];
    return { store, schema: scene.schema };
  }

  it("absorbs a 3-way rearrangement as a reordered <Box> list, not raw coordinates", async () => {
    // A real drag only moves the shape you touch, never its siblings. So a
    // clean "move C in front of A" landing needs A and B dragged into their
    // new slots too: three `moved` entries, one per shape, all pointing at
    // where a `(c, a, b)` reorder would put them.
    const dir = await makeWorkDir();
    const path = join(dir, "diagram.tldx.jsx");
    const deps = makeDeps();
    await deps.fsWrite.write(path, ROW_SOURCE);

    const base = (await compileFile(path, compileFileDeps(deps))).sceneJson;
    if (base === null) throw new Error("row fixture failed to compile");

    const reorderedPath = join(dir, "reordered.tldx.jsx");
    await deps.fsWrite.write(reorderedPath, REORDERED_SOURCE);
    const reordered = (await compileFile(reorderedPath, compileFileDeps(deps))).sceneJson;
    if (reordered === null) throw new Error("reordered ground-truth fixture failed to compile");

    const overlay: Overlay = {
      v: OVERLAY_VERSION,
      basedOn: sceneHash(base),
      entries: {
        "shape:a": {
          moved: {
            x: reordered.store["shape:a"]!.x as number,
            y: reordered.store["shape:a"]!.y as number,
          },
        },
        "shape:b": {
          moved: {
            x: reordered.store["shape:b"]!.x as number,
            y: reordered.store["shape:b"]!.y as number,
          },
        },
        "shape:c": {
          moved: {
            x: reordered.store["shape:c"]!.x as number,
            y: reordered.store["shape:c"]!.y as number,
          },
        },
      },
    };
    await writeOverlay(deps, path, overlay);
    const target = applyOverlay(overlay, base).scene;

    const result = await runAbsorb({ path, force: false }, deps);
    if (result.status !== "absorbed")
      throw new Error(`expected absorbed, got ${JSON.stringify(result)}`);
    expect(result.absorbedIds.sort()).toEqual(["shape:a", "shape:b", "shape:c"]);
    expect(result.residualCount).toBe(0);

    const rewritten = await readFile(path, "utf8");
    const order = [...rewritten.matchAll(/<Box id="(\w)"/g)].map((m) => m[1]);
    expect(order).toEqual(["c", "a", "b"]);

    const rewrittenScene = (await compileFile(path, compileFileDeps(deps))).sceneJson;
    if (rewrittenScene === null) throw new Error("rewritten source failed to compile");
    assert.deepStrictEqual(stripIndex(rewrittenScene), stripIndex(target));

    const overlayOnDisk = JSON.parse(await readFile(overlayPathFor(path), "utf8")) as Overlay;
    expect(overlayOnDisk.entries).toEqual({});
  });

  it("absorbs dragging the last child further away as a wider gap", async () => {
    const dir = await makeWorkDir();
    const path = join(dir, "diagram.tldx.jsx");
    const deps = makeDeps();
    const source = [
      'import { Doc, Box } from "tldx";',
      "",
      "export default function Diagram() {",
      "  return (",
      '    <Doc layout="row" gap="40">',
      '      <Box id="a" w="100" h="50" />',
      '      <Box id="b" w="100" h="50" />',
      "    </Doc>",
      "  );",
      "}",
      "",
    ].join("\n");
    await deps.fsWrite.write(path, source);

    const base = (await compileFile(path, compileFileDeps(deps))).sceneJson;
    if (base === null) throw new Error("fixture failed to compile");
    const bBase = base.store["shape:b"]!;
    const draggedX = (bBase.x as number) + 60;

    const overlay: Overlay = {
      v: OVERLAY_VERSION,
      basedOn: sceneHash(base),
      entries: { "shape:b": { moved: { x: draggedX, y: bBase.y as number } } },
    };
    await writeOverlay(deps, path, overlay);
    const target = applyOverlay(overlay, base).scene;

    const result = await runAbsorb({ path, force: false }, deps);
    if (result.status !== "absorbed")
      throw new Error(`expected absorbed, got ${JSON.stringify(result)}`);
    expect(result.absorbedIds).toContain("shape:b");

    const rewritten = await readFile(path, "utf8");
    expect(rewritten).toContain('gap="100"');

    const rewrittenScene = (await compileFile(path, compileFileDeps(deps))).sceneJson;
    if (rewrittenScene === null) throw new Error("rewritten source failed to compile");
    assert.deepStrictEqual(rewrittenScene, target);
  });

  it("leaves an unreproducible drag in the overlay and says which shape and why", async () => {
    const dir = await makeWorkDir();
    const path = join(dir, "diagram.tldx.jsx");
    const deps = makeDeps();
    await deps.fsWrite.write(path, ROW_SOURCE);

    const base = (await compileFile(path, compileFileDeps(deps))).sceneJson;
    if (base === null) throw new Error("row fixture failed to compile");
    const bBase = base.store["shape:b"]!;
    // b is a middle child - not the last, so no gap candidate exists - and
    // a 5px nudge doesn't land on any of the discrete reorder slots.
    const overlay: Overlay = {
      v: OVERLAY_VERSION,
      basedOn: sceneHash(base),
      entries: { "shape:b": { moved: { x: (bBase.x as number) + 5, y: bBase.y as number } } },
    };
    await writeOverlay(deps, path, overlay);

    const result = await runAbsorb({ path, force: false }, deps);
    if (result.status !== "absorbed")
      throw new Error(
        `expected absorbed (with nothing actually absorbed), got ${JSON.stringify(result)}`,
      );
    expect(result.absorbedIds).toEqual([]);
    expect(result.residualCount).toBe(1);
    expect(result.moveNotes).toBeDefined();
    expect(result.moveNotes?.some((n) => n.startsWith("shape:b:"))).toBe(true);

    const overlayOnDisk = JSON.parse(await readFile(overlayPathFor(path), "utf8")) as Overlay;
    expect(overlayOnDisk.entries["shape:b"]).toEqual({
      moved: { x: (bBase.x as number) + 5, y: bBase.y as number },
    });
    const sourceAfter = await readFile(path, "utf8");
    expect(sourceAfter).toBe(ROW_SOURCE);
  });
});
