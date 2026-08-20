/**
 * Corpus-driven compile check for the Phase B layout bench (see
 * docs/ralph-plan.md A7). Every `*.tldsl.jsx` fixture in this directory
 * must compile clean through the real pipeline (esbuild/worker execute +
 * real ELK layout) - these diagrams are the fixed test bench a long-running
 * layout-tuning loop judges against, so this test only pins "still
 * compiles", not any particular layout output.
 */

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { compileFile } from "../../src/app/compile-file.js";
import { createJsxExecute } from "../../src/infra/execute-jsx/execute-jsx.js";
import { createNodeFsRead } from "../../src/infra/fs/node-fs-read.js";
import { ElkLayoutAdapter } from "../../src/infra/layout-elk/elk-layout.js";

const HERE = dirname(fileURLToPath(import.meta.url));

function discoverCorpusFixtures(): string[] {
  return readdirSync(HERE)
    .filter((name) => name.endsWith(".tldsl.jsx"))
    .sort();
}

describe("corpus: layout bench fixtures compile clean", () => {
  const fixtures = discoverCorpusFixtures();

  it("discovered at least six fixtures", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(6);
  });

  for (const name of fixtures) {
    it(
      `${name} compiles with zero diagnostics`,
      async () => {
        const path = join(HERE, name);
        const result = await compileFile(path, {
          fs: createNodeFsRead(),
          layout: new ElkLayoutAdapter(),
          execute: createJsxExecute(),
        });

        expect(result.diagnostics).toEqual([]);
        expect(result.sceneJson).not.toBeNull();
      },
      30_000,
    );
  }
});
