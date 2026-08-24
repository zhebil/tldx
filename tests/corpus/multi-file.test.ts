/**
 * `c4-context.tldx.jsx` imports `./lib/c4.jsx`. Pins that a multi-file
 * fixture compiles clean through the real pipeline and that the watch set
 * (`result.inputs`) includes the imported module, so editing it triggers a
 * reload.
 */

import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { compileFile } from "../../src/app/compile-file.js";
import { createJsxExecute } from "../../src/infra/execute-jsx/execute-jsx.js";
import { createNodeFsRead } from "../../src/infra/fs/node-fs-read.js";
import { ElkLayoutAdapter } from "../../src/infra/layout-elk/elk-layout.js";

const HERE = dirname(fileURLToPath(import.meta.url));

describe("corpus: multi-file diagram pulls its imported module into the watch set", () => {
  it(
    "c4-context.tldx.jsx compiles clean and result.inputs includes lib/c4.jsx",
    async () => {
      const path = join(HERE, "c4-context.tldx.jsx");
      const result = await compileFile(path, {
        fs: createNodeFsRead(),
        layout: new ElkLayoutAdapter(),
        execute: createJsxExecute(),
      });

      expect(result.diagnostics).toEqual([]);
      expect(result.sceneJson).not.toBeNull();
      expect(result.inputs?.some((f) => f.endsWith(join("lib", "c4.jsx")))).toBe(true);
    },
    30_000,
  );
});
