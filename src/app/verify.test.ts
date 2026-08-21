import { describe, expect, it } from "vitest";

import { OVERLAY_VERSION, type Overlay } from "../contracts/overlay.js";
import type { TLRecord } from "../contracts/scene-json.js";
import { overlayPathFor, sceneHash } from "../domain/overlay/index.js";
import { astBuilders } from "../domain/parser/ast.fixture.js";
import { StubLayout } from "../domain/ports/layout.fake.js";

import { compileFile } from "./compile-file.js";
import { FakeExecute } from "./ports/execute.fake.js";
import { InMemoryFs } from "./ports/fs.fake.js";
import { runVerify, type VerifyDeps } from "./verify.js";

const SRC = "export default function Diagram() { return null; }";

function makeDeps(fs: InMemoryFs, execute: FakeExecute): VerifyDeps {
  return { fs, layout: new StubLayout(), execute };
}

describe("runVerify", () => {
  it("returns compile-error when the file fails to compile", async () => {
    const path = "broken.tldsl.jsx";
    const { doc, box } = astBuilders(path);
    const execute = new FakeExecute();
    execute.setResult(SRC, {
      ast: doc({ id: "d" }, [box({ id: "x" }), box({ id: "x" })]),
      inputs: [path],
    });
    const overlay: Overlay = { v: OVERLAY_VERSION, basedOn: "whatever", entries: {} };
    const fs = new InMemoryFs({ [path]: SRC, [overlayPathFor(path)]: JSON.stringify(overlay) });

    const result = await runVerify({ path }, makeDeps(fs, execute));

    expect(result.status).toBe("compile-error");
    if (result.status !== "compile-error") throw new Error("expected compile-error");
    expect(result.diagnostics.some((d) => d.code === "ir/duplicate-id")).toBe(true);
  });

  it("returns no-overlay when there's no overlay file", async () => {
    const path = "diagram.tldsl.jsx";
    const fs = new InMemoryFs({ [path]: SRC });
    const execute = new FakeExecute();

    const result = await runVerify({ path }, makeDeps(fs, execute));

    expect(result).toEqual({ status: "no-overlay", overlayPath: overlayPathFor(path) });
  });

  it("returns verified with no entries and stale=false for an up-to-date empty overlay", async () => {
    const path = "diagram.tldsl.jsx";
    const { doc, box } = astBuilders(path);
    const execute = new FakeExecute();
    execute.setResult(SRC, { ast: doc({ id: "d" }, [box({ id: "b" })]), inputs: [path] });
    const fs = new InMemoryFs({ [path]: SRC });
    const deps = makeDeps(fs, execute);

    const base = (await compileFile(path, deps)).sceneJson;
    if (base === null) throw new Error("stub failed to compile");
    const overlay: Overlay = { v: OVERLAY_VERSION, basedOn: sceneHash(base), entries: {} };
    fs.setFile(overlayPathFor(path), JSON.stringify(overlay));

    const result = await runVerify({ path }, deps);

    expect(result).toEqual({
      status: "verified",
      overlayPath: overlayPathFor(path),
      stale: false,
      entries: [],
    });
  });

  it("reports stale=true when the overlay's basedOn doesn't match the current compile", async () => {
    const path = "diagram.tldsl.jsx";
    const { doc, box } = astBuilders(path);
    const execute = new FakeExecute();
    execute.setResult(SRC, { ast: doc({ id: "d" }, [box({ id: "b" })]), inputs: [path] });
    const fs = new InMemoryFs({ [path]: SRC });
    const deps = makeDeps(fs, execute);

    const overlay: Overlay = { v: OVERLAY_VERSION, basedOn: "stale-hash", entries: {} };
    fs.setFile(overlayPathFor(path), JSON.stringify(overlay));

    const result = await runVerify({ path }, deps);

    expect(result.status).toBe("verified");
    if (result.status !== "verified") throw new Error("expected verified");
    expect(result.stale).toBe(true);
  });

  it("marks an entry that already matches the compiled scene as changesScene=false, and a diverging one as true, sorted by id", async () => {
    const path = "diagram.tldsl.jsx";
    const { doc, box } = astBuilders(path);
    const execute = new FakeExecute();
    execute.setResult(SRC, {
      ast: doc({ id: "d" }, [box({ id: "c" }), box({ id: "b" })]),
      inputs: [path],
    });
    const fs = new InMemoryFs({ [path]: SRC });
    const deps = makeDeps(fs, execute);

    const base = (await compileFile(path, deps)).sceneJson;
    if (base === null) throw new Error("stub failed to compile");
    const bRecord = base.store["shape:b"] as TLRecord;
    const bX = bRecord.x as number;
    const bY = bRecord.y as number;

    const overlay: Overlay = {
      v: OVERLAY_VERSION,
      basedOn: sceneHash(base),
      entries: {
        "shape:b": { moved: { x: bX, y: bY } },
        "shape:c": { moved: { x: 9999, y: 9999 } },
      },
    };
    fs.setFile(overlayPathFor(path), JSON.stringify(overlay));

    const result = await runVerify({ path }, deps);

    expect(result.status).toBe("verified");
    if (result.status !== "verified") throw new Error("expected verified");
    expect(result.entries.map((e) => e.id)).toEqual(["shape:b", "shape:c"]);

    const bEntry = result.entries.find((e) => e.id === "shape:b")!;
    expect(bEntry.ops).toEqual(["moved"]);
    expect(bEntry.changesScene).toBe(false);

    const cEntry = result.entries.find((e) => e.id === "shape:c")!;
    expect(cEntry.changesScene).toBe(true);
  });
});
