/**
 * Every diagram the repo ships a rendered SVG for must still compile: the ones
 * embedded in `docs/architecture.md` and `README.md`, and the ones in
 * `examples/`. Their SVGs are rendered by hand (`npm run diagrams`), so nothing
 * else would ever notice if a refactor broke the source they came from.
 *
 * Same shape as `tests/corpus/corpus.test.ts`, pointed at two directories:
 * discovery is by glob, so a new diagram is covered the moment it lands.
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const DIRS = {
  "docs/diagrams": join(ROOT, "docs", "diagrams"),
  examples: join(ROOT, "examples"),
};

for (const [label, dir] of Object.entries(DIRS)) {
  describe(`shipped: the diagrams in ${label} compile`, () => {
    const files = readdirSync(dir)
      .filter((name) => name.endsWith(".tldx.jsx"))
      .sort();

    it("found some", () => {
      expect(files.length).toBeGreaterThan(0);
    });

    for (const name of files) {
      it(`${name} compiles with no errors`, async () => {
        const result = await compileFile(join(dir, name), {
          fs: createNodeFsRead(),
          layout: new ElkLayoutAdapter(),
          execute: createJsxExecute(),
        });

        expect(hasErrors(result.diagnostics)).toBe(false);
        expect(result.sceneJson).not.toBeNull();
      }, 30_000);
    }
  });
}
