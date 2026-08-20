import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { SceneJSON, TLRecord } from "../contracts/scene-json.js";
import { error } from "../domain/diagnostics/index.js";
import type { IRDoc, IRDocPositioned } from "../domain/ir/index.js";
import type { AstDoc } from "../domain/parser/ast.js";
import { StubLayout } from "../domain/ports/layout.fake.js";
import type { LayoutPort } from "../domain/ports/layout.js";

import { compileFile, type CompileFileDeps } from "./compile-file.js";
import { FakeExecute } from "./ports/execute.fake.js";
import type { ExecutePort } from "./ports/execute.js";
import { InMemoryFs } from "./ports/fs.fake.js";

function deps(
  files: Record<string, string>,
  layout: LayoutPort = new StubLayout(),
  execute: ExecutePort = new FakeExecute(),
): CompileFileDeps {
  return { fs: new InMemoryFs(files), layout, execute };
}

function docWithLabelledBox(path: string, label: string): AstDoc {
  const span = { file: path, line: 1, column: 1 };
  return {
    kind: "doc",
    attrs: {},
    span,
    children: [
      {
        kind: "box",
        attrs: {
          id: { value: "b", span, nameSpan: span },
          label: { value: label, span, nameSpan: span },
        },
        span,
      },
    ],
  };
}

function recordsByType(scene: SceneJSON, typeName: string): TLRecord[] {
  return Object.values(scene.store).filter((r) => r.typeName === typeName);
}

describe("compileFile", () => {
  describe("happy path", () => {
    it("returns a sceneJson and no diagnostics for a valid doc", async () => {
      const result = await compileFile(
        "auth.tldsl",
        deps({
          "auth.tldsl": `<doc id="auth">
            <box id="login" label="Login" />
            <box id="dash" label="Dashboard" />
            <edge from="login" to="dash" />
          </doc>`,
        }),
      );

      expect(result.diagnostics).toEqual([]);
      expect(result.sceneJson).not.toBeNull();
      const scene = result.sceneJson!;
      expect(recordsByType(scene, "shape")).toHaveLength(3);
      expect(recordsByType(scene, "binding")).toHaveLength(2);
    });

    it("invokes the layout port with the lowered IR", async () => {
      const layout: LayoutPort = {
        layout: vi.fn(async (ir: IRDoc): Promise<IRDocPositioned> =>
          new StubLayout().layout(ir),
        ),
      };
      await compileFile(
        "x.tldsl",
        deps(
          {
            "x.tldsl": `<doc id="d"><box id="b" /></doc>`,
          },
          layout,
        ),
      );
      expect(layout.layout).toHaveBeenCalledTimes(1);
      const irArg = (layout.layout as ReturnType<typeof vi.fn>).mock.calls[0]![0] as IRDoc;
      expect(irArg.kind).toBe("doc");
      expect(irArg.id).toBe("d");
    });
  });

  describe("filesystem errors", () => {
    it("returns fs/not-found and null sceneJson when the file is missing", async () => {
      const result = await compileFile("missing.tldsl", deps({}));
      expect(result.sceneJson).toBeNull();
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]!.code).toBe("fs/not-found");
      expect(result.diagnostics[0]!.severity).toBe("error");
    });

    it("returns fs/read-error for non-ENOENT read failures", async () => {
      const failing: CompileFileDeps = {
        fs: {
          read: async () => {
            throw new Error("permission denied");
          },
        },
        layout: new StubLayout(),
        execute: new FakeExecute(),
      };
      const result = await compileFile("guarded.tldsl", failing);
      expect(result.sceneJson).toBeNull();
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]!.code).toBe("fs/read-error");
    });
  });

  describe("compile errors short-circuit before layout", () => {
    it("returns parser diagnostics and skips layout/emit on parse error", async () => {
      const layout: LayoutPort = { layout: vi.fn() };
      const result = await compileFile(
        "bad.tldsl",
        deps(
          { "bad.tldsl": `<doc id="d"><box id="b"` },
          layout,
        ),
      );
      expect(result.sceneJson).toBeNull();
      expect(result.diagnostics.some((d) => d.code.startsWith("parser/"))).toBe(true);
      expect(layout.layout).not.toHaveBeenCalled();
    });

    it("returns ir diagnostics and skips layout/emit on lowering error", async () => {
      const layout: LayoutPort = { layout: vi.fn() };
      const result = await compileFile(
        "dup.tldsl",
        deps(
          {
            "dup.tldsl": `<doc id="d"><box id="x" /><box id="x" /></doc>`,
          },
          layout,
        ),
      );
      expect(result.sceneJson).toBeNull();
      expect(result.diagnostics.some((d) => d.code === "ir/duplicate-id")).toBe(true);
      expect(layout.layout).not.toHaveBeenCalled();
    });

    it("returns ir/root-not-doc when the top-level element is not <doc>", async () => {
      const result = await compileFile(
        "frag.tldsl",
        deps({ "frag.tldsl": `<box id="x" />` }),
      );
      expect(result.sceneJson).toBeNull();
      expect(result.diagnostics.some((d) => d.code === "ir/root-not-doc")).toBe(true);
    });
  });

  describe("empty source", () => {
    it("returns null sceneJson and no diagnostics for an empty file", async () => {
      const result = await compileFile(
        "empty.tldsl",
        deps({ "empty.tldsl": "" }),
      );
      expect(result.sceneJson).toBeNull();
      expect(result.diagnostics).toEqual([]);
    });
  });

  describe("JSX front end", () => {
    it("compiles a .tldsl.jsx path from the executor's AST, never the text parser", async () => {
      const path = "diagram.tldsl.jsx";
      const source = "export default function Diagram() { return null; }";
      const execute = new FakeExecute();
      execute.setResult(source, {
        ast: docWithLabelledBox(path, "JSX-Only-Box"),
        inputs: [path],
      });

      const result = await compileFile(path, deps({ [path]: source }, new StubLayout(), execute));

      expect(source).not.toContain("JSX-Only-Box");
      expect(result.diagnostics).toEqual([]);
      expect(result.sceneJson).not.toBeNull();
      expect(JSON.stringify(result.sceneJson)).toContain("JSX-Only-Box");
    });

    it("short-circuits on a diagnostics-only execute result: null sceneJson, surfaced diagnostics, layout never called", async () => {
      const path = "broken.tldsl.jsx";
      const source = "throw new Error('boom')";
      const execute = new FakeExecute();
      execute.setResult(source, {
        diagnostics: [error("runtime/threw", "boom", { file: path, line: 3, column: 1 })],
      });
      const layout: LayoutPort = { layout: vi.fn() };

      const result = await compileFile(path, deps({ [path]: source }, layout, execute));

      expect(result.sceneJson).toBeNull();
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]!.code).toBe("runtime/threw");
      expect(layout.layout).not.toHaveBeenCalled();
    });

    it("calls execute with the file's contents and its path", async () => {
      const path = "diagram.tldsl.jsx";
      const source = "export default function Diagram() { return null; }";
      const execute = new FakeExecute();

      await compileFile(path, deps({ [path]: source }, new StubLayout(), execute));

      expect(execute.calls).toEqual([{ source, path }]);
    });

    it("never calls execute for a .tldsl path", async () => {
      const execute = new FakeExecute();

      await compileFile(
        "auth.tldsl",
        deps({ "auth.tldsl": `<doc id="d"><box id="b" /></doc>` }, new StubLayout(), execute),
      );

      expect(execute.calls).toEqual([]);
    });

    it("normalises a bare-basename diagnostic span to be relative to the path's directory", async () => {
      const path = "foo/bar.tldsl.jsx";
      const source = "whatever";
      const execute = new FakeExecute();
      execute.setResult(source, {
        diagnostics: [
          error("runtime/compile", "bad jsx", { file: "bar.tldsl.jsx", line: 1, column: 1 }),
        ],
      });

      const result = await compileFile(path, deps({ [path]: source }, new StubLayout(), execute));

      expect(result.diagnostics[0]!.span!.file).toBe("foo/bar.tldsl.jsx");
    });

    it("normalises an absolute diagnostic span to be relative to the path's directory", async () => {
      const path = "foo/bar.tldsl.jsx";
      const source = "whatever";
      const execute = new FakeExecute();
      execute.setResult(source, {
        diagnostics: [
          error("runtime/compile", "bad jsx", {
            file: resolve("foo/bar.tldsl.jsx"),
            line: 1,
            column: 1,
          }),
        ],
      });

      const result = await compileFile(path, deps({ [path]: source }, new StubLayout(), execute));

      expect(result.diagnostics[0]!.span!.file).toBe("foo/bar.tldsl.jsx");
    });
  });
});
