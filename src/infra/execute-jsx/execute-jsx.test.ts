import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import {
  runExecuteContract,
  type ExecuteHarness,
} from "../../app/ports/execute.contract.js";

import { createJsxExecute } from "./execute-jsx.js";

function okSource(boxId: string): string {
  return `import { Doc, Box } from "tldx";
export default function Diagram() {
  return <Doc><Box id="${boxId}" label="${boxId}"/></Doc>;
}
`;
}

// Line 3 is asserted directly by the "thrown error line" test below - keep
// the throw on that exact line if this template changes.
const THROWING_SOURCE = `import { Doc, Box } from "tldx";
export default function Diagram() {
  throw new Error("boom");
}
`;

const INFINITE_SOURCE = `export default function Diagram() {
  while (true) {}
}
`;

// Mismatched JSX tag - fails to build, never reaches the worker.
const COMPILE_ERROR_SOURCE = `import { Doc, Box } from "tldx";
export default function Diagram() {
  return <Doc><Box id="a" label="a" </Doc>;
}
`;

runExecuteContract(
  "createJsxExecute",
  async (): Promise<ExecuteHarness> => {
    const dir = await mkdtemp(join(tmpdir(), "tldx-execute-jsx-"));
    const path = join(dir, "diagram.tldx.jsx");
    const port = createJsxExecute();
    return {
      port,
      path,
      okSource: (boxId) => {
        const source = okSource(boxId);
        writeFileSync(path, source, "utf8");
        return source;
      },
      throwingSource: () => {
        writeFileSync(path, THROWING_SOURCE, "utf8");
        return THROWING_SOURCE;
      },
      infiniteSource: () => {
        writeFileSync(path, INFINITE_SOURCE, "utf8");
        return INFINITE_SOURCE;
      },
      compileErrorSource: () => {
        writeFileSync(path, COMPILE_ERROR_SOURCE, "utf8");
        return COMPILE_ERROR_SOURCE;
      },
      dispose: async () => {
        await rm(dir, { recursive: true, force: true });
      },
    };
  },
  { timeoutMs: 20000 },
);

describe("createJsxExecute: adapter-specific behavior", () => {
  it(
    "inputs includes transitively-imported files",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "tldx-execute-jsx-transitive-"));
      try {
        const path = join(dir, "diagram.tldx.jsx");
        const partsPath = join(dir, "parts.jsx");
        await writeFile(
          partsPath,
          `import { Box } from "tldx";
export function Part({ id }) {
  return <Box id={id} label={id} />;
}
`,
          "utf8",
        );
        const source = `import { Doc } from "tldx";
import { Part } from "./parts.jsx";
export default function Diagram() {
  return <Doc><Part id="p" /></Doc>;
}
`;

        const port = createJsxExecute();
        const result = await port.execute(source, path);
        expect("ast" in result).toBe(true);
        if (!("ast" in result)) throw new Error("expected ast result");
        expect(result.inputs).toContain(path);
        expect(result.inputs).toContain(partsPath);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    20000,
  );

  it(
    "runtime/compile diagnostic's span points at the entry file",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "tldx-execute-jsx-compile-"));
      try {
        const path = join(dir, "diagram.tldx.jsx");
        const result = await createJsxExecute().execute(COMPILE_ERROR_SOURCE, path);
        if (!("diagnostics" in result)) throw new Error("expected diagnostics result");
        const compileError = result.diagnostics.find((d) => d.code === "runtime/compile");
        expect(compileError?.span?.file).toBe(path);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    20000,
  );

  it(
    "accepts a relative entry path and reports absolute spans",
    async () => {
      const dir = await mkdtemp(join(process.cwd(), "tldx-execute-jsx-relative-"));
      try {
        const path = join(dir, "diagram.tldx.jsx");
        const relPath = relative(process.cwd(), path);
        expect(isAbsolute(relPath)).toBe(false);

        const port = createJsxExecute();
        const ok = await port.execute(okSource("a"), relPath);
        if (!("ast" in ok)) throw new Error("expected ast result");
        expect(ok.inputs).toContain(path);

        const failed = await port.execute(THROWING_SOURCE, relPath);
        if (!("diagnostics" in failed)) throw new Error("expected diagnostics result");
        expect(failed.diagnostics[0]?.span?.file).toBe(path);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    20000,
  );

  it(
    "runtime/threw diagnostic's span.line is the actual throw line",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "tldx-execute-jsx-throw-line-"));
      try {
        const path = join(dir, "diagram.tldx.jsx");
        const port = createJsxExecute();
        const result = await port.execute(THROWING_SOURCE, path);
        expect("diagnostics" in result).toBe(true);
        if (!("diagnostics" in result)) throw new Error("expected diagnostics result");
        const threw = result.diagnostics.find((d) => d.code === "runtime/threw");
        expect(threw).toBeDefined();
        expect(threw?.span?.line).toBe(3);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    20000,
  );

  it(
    "runtime/threw diagnostic from an imported file names that file, and inputs covers the module graph",
    async () => {
      // esbuild resolves relative imports through their real (symlink-free)
      // path when building the sourcemap's `sources`; on macOS `tmpdir()`
      // sits under a `/var` -> `/private/var` symlink, so the temp dir is
      // realpath'd up front to keep every path comparison below exact.
      const dir = await realpath(await mkdtemp(join(tmpdir(), "tldx-execute-jsx-imported-throw-")));
      try {
        const libDir = join(dir, "lib");
        await mkdir(libDir);
        const brokenPath = join(libDir, "broken.jsx");
        // Line 8 is asserted directly below - keep the throw on that exact
        // line if this template changes.
        await writeFile(
          brokenPath,
          `import { Box } from "tldx";

export function Safe({ id, label }) {
  return <Box id={id} label={label} />;
}

export function Broken() {
  throw new Error("boom from imported module");
}
`,
          "utf8",
        );
        const path = join(dir, "diagram.tldx.jsx");
        const port = createJsxExecute();

        const okDiagramSource = `import { Doc } from "tldx";
import { Safe } from "./lib/broken.jsx";
export default function Diagram() {
  return <Doc><Safe id="w" label="w" /></Doc>;
}
`;
        const ok = await port.execute(okDiagramSource, path);
        if (!("ast" in ok)) throw new Error("expected ast result");
        expect(ok.inputs).toContain(path);
        expect(ok.inputs).toContain(brokenPath);

        const throwingDiagramSource = `import { Doc } from "tldx";
import { Broken } from "./lib/broken.jsx";
export default function Diagram() {
  return <Doc><Broken /></Doc>;
}
`;
        const failed = await port.execute(throwingDiagramSource, path);
        if (!("diagnostics" in failed)) throw new Error("expected diagnostics result");
        const threw = failed.diagnostics.find((d) => d.code === "runtime/threw");
        expect(threw).toBeDefined();
        expect(threw?.span?.file).toBe(brokenPath);
        expect(threw?.span?.line).toBe(8);
      } finally {
        await rm(dir, { recursive: true, force: true });
      }
    },
    20000,
  );
});
