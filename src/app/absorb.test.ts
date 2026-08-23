/**
 * `runAbsorb` never grows the overlay's entry set (tldsl-mid) - every id
 * left in the overlay after a run was already a key in the overlay it
 * started from. Uses fakes throughout: an entry that resolves as
 * "already satisfied" (tldsl-d3o's move ladder, no source edit needed) is
 * the cheapest way to reach `runAbsorb`'s "absorbed" branch without
 * exercising the codegen/recompile text-splicing machinery, which needs a
 * real JSX executor to round-trip generated source through `ExecutePort`.
 */

import { describe, expect, it } from "vitest";

import { OVERLAY_VERSION, type Overlay } from "../contracts/overlay.js";
import { overlayPathFor } from "../domain/overlay/index.js";
import { astBuilders } from "../domain/parser/ast.fixture.js";
import { StubLayout } from "../domain/ports/layout.fake.js";

import { runAbsorb, type AbsorbDeps } from "./absorb.js";
import { compileFile } from "./compile-file.js";
import { FakeExecute } from "./ports/execute.fake.js";
import { InMemoryFs } from "./ports/fs.fake.js";

const PATH = "diagram.tldsl.jsx";
const SRC = "export default function Diagram() { return null; }";

describe("runAbsorb - entries never grow", () => {
  it("the overlay written to disk contains only ids that were already in the overlay it read", async () => {
    const { doc, box } = astBuilders(PATH);
    const execute = new FakeExecute();
    execute.setResult(SRC, {
      ast: doc({ id: "d" }, [box({ id: "moved" }), box({ id: "styled" }), box({ id: "noop" })]),
      inputs: [PATH],
    });
    const fs = new InMemoryFs({ [PATH]: SRC });
    const deps: AbsorbDeps = {
      fs,
      fsWrite: fs,
      layout: new StubLayout(),
      execute,
      gitStatus: async () => "no-repo",
    };

    const base = (await compileFile(PATH, { fs, layout: deps.layout, execute })).sceneJson;
    if (base === null) throw new Error("fixture failed to compile");
    const movedBase = base.store["shape:moved"];
    const noopBase = base.store["shape:noop"];
    if (movedBase === undefined || noopBase === undefined) throw new Error("fixture missing expected shapes");

    const overlay: Overlay = {
      v: OVERLAY_VERSION,
      basedOn: "whatever",
      entries: {
        // Rotation has no JSX equivalent - `planMoveCandidates` refuses it
        // outright, so this entry can never be absorbed and must stay.
        "shape:moved": { moved: { x: (movedBase.x as number) + 999, rotation: 0.3 } },
        // Not a `moved`/bare-`added` entry at all - always residual.
        "shape:styled": { restyled: { color: "red" } },
        // Already matches the base render (no actual position change) -
        // the move ladder's "already satisfied" branch drops it for free,
        // with no source edit and no recompile-of-novel-text needed.
        "shape:noop": { moved: { x: noopBase.x as number, y: noopBase.y as number } },
      },
    };
    fs.setFile(overlayPathFor(PATH), JSON.stringify(overlay));

    const result = await runAbsorb({ path: PATH, force: false }, deps);
    if (result.status !== "absorbed") throw new Error(`expected absorbed, got ${JSON.stringify(result)}`);

    const overlayOnDisk = JSON.parse(await fs.read(overlayPathFor(PATH))) as Overlay;
    const inputIds = new Set(Object.keys(overlay.entries));
    for (const id of Object.keys(overlayOnDisk.entries)) {
      expect(inputIds.has(id)).toBe(true);
    }
    // Not vacuous: "noop" really was dropped, so this isn't just "equal to input".
    expect(Object.keys(overlayOnDisk.entries).sort()).toEqual(["shape:moved", "shape:styled"]);
  });
});
