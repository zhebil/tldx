import { mkdtemp, rm, writeFile } from "node:fs/promises";
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
  return `import { Doc, Box } from "tldsl";
export default function Diagram() {
  return <Doc><Box id="${boxId}" label="${boxId}"/></Doc>;
}
`;
}

// Line 3 is asserted directly by the "thrown error line" test below - keep
// the throw on that exact line if this template changes.
const THROWING_SOURCE = `import { Doc, Box } from "tldsl";
export default function Diagram() {
  throw new Error("boom");
}
`;

const INFINITE_SOURCE = `export default function Diagram() {
  while (true) {}
}
`;

// Mismatched JSX tag - fails to build, never reaches the worker.
const COMPILE_ERROR_SOURCE = `import { Doc, Box } from "tldsl";
export default function Diagram() {
  return <Doc><Box id="a" label="a" </Doc>;
}
`;

runExecuteContract(
  "createJsxExecute",
  async (): Promise<ExecuteHarness> => {
    const dir = await mkdtemp(join(tmpdir(), "tldsl-execute-jsx-"));
    const path = join(dir, "diagram.tldsl.jsx");
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
      const dir = await mkdtemp(join(tmpdir(), "tldsl-execute-jsx-transitive-"));
      try {
        const path = join(dir, "diagram.tldsl.jsx");
        const partsPath = join(dir, "parts.jsx");
        await writeFile(
          partsPath,
          `import { Box } from "tldsl";
export function Part({ id }) {
  return <Box id={id} label={id} />;
}
`,
          "utf8",
        );
        const source = `import { Doc } from "tldsl";
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
      const dir = await mkdtemp(join(tmpdir(), "tldsl-execute-jsx-compile-"));
      try {
        const path = join(dir, "diagram.tldsl.jsx");
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
      const dir = await mkdtemp(join(process.cwd(), "tldsl-execute-jsx-relative-"));
      try {
        const path = join(dir, "diagram.tldsl.jsx");
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
      const dir = await mkdtemp(join(tmpdir(), "tldsl-execute-jsx-throw-line-"));
      try {
        const path = join(dir, "diagram.tldsl.jsx");
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
});
