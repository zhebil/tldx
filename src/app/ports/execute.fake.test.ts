import { describe, it, expect } from "vitest";

import type { AstDoc } from "../../domain/parser/ast.js";
import { FakeExecute } from "./execute.fake.js";
import { runExecuteContract, type ExecuteHarness } from "./execute.contract.js";

const PATH = "/fake/doc.tldx.jsx";

function docWithBox(path: string, boxId: string): AstDoc {
  return {
    kind: "doc",
    attrs: {},
    span: { file: path, line: 1, column: 1 },
    children: [
      {
        kind: "box",
        attrs: {
          id: {
            value: boxId,
            span: { file: path, line: 1, column: 1 },
            nameSpan: { file: path, line: 1, column: 1 },
          },
        },
        span: { file: path, line: 1, column: 1 },
      },
    ],
  };
}

runExecuteContract("FakeExecute", async (): Promise<ExecuteHarness> => {
  const fake = new FakeExecute();
  let n = 0;
  return {
    port: fake,
    path: PATH,
    okSource: (boxId) => {
      const source = `OK:${boxId}:${String(n++)}`;
      fake.setResult(source, { ast: docWithBox(PATH, boxId), inputs: [PATH] });
      return source;
    },
    throwingSource: () => {
      const source = `THROW:${String(n++)}`;
      fake.setResult(source, {
        diagnostics: [
          {
            severity: "error",
            code: "runtime/threw",
            message: "user code threw",
            span: { file: PATH, line: 1, column: 1 },
          },
        ],
      });
      return source;
    },
    infiniteSource: () => {
      const source = `INFINITE:${String(n++)}`;
      fake.setResult(source, {
        diagnostics: [
          {
            severity: "error",
            code: "runtime/timeout",
            message: "execution timed out",
            span: { file: PATH, line: 1, column: 1 },
          },
        ],
      });
      return source;
    },
    compileErrorSource: () => {
      const source = `COMPILE_ERROR:${String(n++)}`;
      fake.setResult(source, {
        diagnostics: [
          {
            severity: "error",
            code: "runtime/compile",
            message: "bundle failed to build",
            span: { file: PATH, line: 1, column: 1 },
          },
        ],
      });
      return source;
    },
    dispose: async () => undefined,
  };
});

describe("FakeExecute (fake-specific affordances)", () => {
  it("returns the default empty-doc result for an unprogrammed source", async () => {
    const fake = new FakeExecute();
    const result = await fake.execute("never programmed", "/a/b.tldx.jsx");
    expect("ast" in result).toBe(true);
    if (!("ast" in result)) throw new Error("expected ast result");
    expect(result.ast).toEqual({
      kind: "doc",
      attrs: {},
      children: [],
      span: { file: "/a/b.tldx.jsx", line: 1, column: 1 },
    });
    expect(result.inputs).toEqual(["/a/b.tldx.jsx"]);
  });

  it("records calls in order with source and path", async () => {
    const fake = new FakeExecute();
    await fake.execute("s1", "/p1");
    await fake.execute("s2", "/p2");
    expect(fake.calls).toEqual([
      { source: "s1", path: "/p1" },
      { source: "s2", path: "/p2" },
    ]);
  });

  it("setResult overrides a previously programmed source", async () => {
    const fake = new FakeExecute();
    const first: AstDoc = {
      kind: "doc",
      attrs: {},
      children: [],
      span: { file: "/p", line: 1, column: 1 },
    };
    const second: AstDoc = {
      kind: "doc",
      attrs: {},
      children: [],
      span: { file: "/p", line: 2, column: 2 },
    };
    fake.setResult("src", { ast: first, inputs: ["/p"] });
    expect(await fake.execute("src", "/p")).toEqual({ ast: first, inputs: ["/p"] });
    fake.setResult("src", { ast: second, inputs: ["/p"] });
    expect(await fake.execute("src", "/p")).toEqual({ ast: second, inputs: ["/p"] });
  });
});
