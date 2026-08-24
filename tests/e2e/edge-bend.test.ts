/**
 * `<Edge bend>` end to end (#30): the four bends a human set on the canvas of
 * this project's own docs diagrams, written in JSX and compiled through the
 * real pipeline. Each must arrive on the emitted tldraw arrow exactly as
 * authored - the router's own passes (fan, obstacle clearing, the chord-ratio
 * cap, minimize) must not touch a bend the author wrote.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { compileFile } from "../../src/app/compile-file.js";
import { hasErrors } from "../../src/domain/diagnostics/index.js";
import { createJsxExecute } from "../../src/infra/execute-jsx/execute-jsx.js";
import { createNodeFsRead } from "../../src/infra/fs/node-fs-read.js";
import { ElkLayoutAdapter } from "../../src/infra/layout-elk/elk-layout.js";

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), "fixtures", "edge-bend.tldx.jsx");

/** The evidence table in the issue, keyed by the fixture's edge ids. */
const EXPECTED: Record<string, number> = {
  "shape:e-app-domain": -43,
  "shape:e-domain-infra": -105,
  "shape:e-infra-domain": 47,
  "shape:e-committed-source": -289,
};

describe("an authored <Edge bend> survives to the emitted arrow", () => {
  it("compiles clean and emits every authored bend verbatim", async () => {
    const result = await compileFile(FIXTURE, {
      fs: createNodeFsRead(),
      layout: new ElkLayoutAdapter(),
      execute: createJsxExecute(),
    });

    expect(hasErrors(result.diagnostics)).toBe(false);
    const scene = result.sceneJson;
    expect(scene).not.toBeNull();

    const bends: Record<string, unknown> = {};
    for (const record of Object.values(scene!.store)) {
      if (record.type !== "arrow") continue;
      bends[record.id] = (record.props as { bend?: unknown }).bend;
    }
    expect(bends).toEqual(EXPECTED);
  }, 30_000);
});
