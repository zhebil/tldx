/**
 * The diagrams embedded in `docs/architecture.md` must still compile. Their
 * SVGs are rendered by hand (`npm run diagrams`), so nothing else would ever
 * notice if a refactor broke the source they came from.
 *
 * Same shape as `tests/corpus/corpus.test.ts`, pointed at a different
 * directory: discovery is by glob, so a new diagram is covered the moment it
 * lands.
 */

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { compileFile } from "../../src/app/compile-file.js";
import { hasErrors } from "../../src/domain/diagnostics/index.js";
import { createJsxExecute } from "../../src/infra/execute-jsx/execute-jsx.js";
import { createNodeFsRead } from "../../src/infra/fs/node-fs-read.js";
import { ElkLayoutAdapter } from "../../src/infra/layout-elk/elk-layout.js";

const DIAGRAMS = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "docs", "diagrams");

describe("docs: the diagrams in docs/architecture.md compile", () => {
  const files = readdirSync(DIAGRAMS)
    .filter((name) => name.endsWith(".tldx.jsx"))
    .sort();

  it("found the docs diagrams", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const name of files) {
    it(`${name} compiles with no errors`, async () => {
      const result = await compileFile(join(DIAGRAMS, name), {
        fs: createNodeFsRead(),
        layout: new ElkLayoutAdapter(),
        execute: createJsxExecute(),
      });

      expect(hasErrors(result.diagnostics)).toBe(false);
      expect(result.sceneJson).not.toBeNull();
    }, 30_000);
  }
});
