import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { SceneJSON, TLRecord } from "../contracts/scene-json.js";
import { error } from "../domain/diagnostics/index.js";
import type { IRDoc, IRDocPositioned } from "../domain/ir/index.js";
import { GEOS } from "../domain/ir/styles.js";
import type { AstDoc } from "../domain/parser/ast.js";
import { astBuilders } from "../domain/parser/ast.fixture.js";
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
  const { doc, box } = astBuilders(path);
  return doc({}, [box({ id: "b", label })]);
}

function recordsByType(scene: SceneJSON, typeName: string): TLRecord[] {
  return Object.values(scene.store).filter((r) => r.typeName === typeName);
}

const SRC = "export default function Diagram() { return null; }";

describe("compileFile", () => {
  describe("happy path", () => {
    it("returns a sceneJson and no diagnostics for a valid doc", async () => {
      const path = "auth.tldx.jsx";
      const { doc, box, edge } = astBuilders(path);
      const execute = new FakeExecute();
      execute.setResult(SRC, {
        ast: doc({ id: "auth" }, [
          box({ id: "login", label: "Login" }),
          box({ id: "dash", label: "Dashboard" }),
          edge({ from: "login", to: "dash" }),
        ]),
        inputs: [path],
      });

      const result = await compileFile(path, deps({ [path]: SRC }, new StubLayout(), execute));

      expect(result.diagnostics).toEqual([]);
      expect(result.sceneJson).not.toBeNull();
      const scene = result.sceneJson!;
      expect(recordsByType(scene, "shape")).toHaveLength(3);
      expect(recordsByType(scene, "binding")).toHaveLength(2);
    });

    it("names the page after the file when the doc has no title", async () => {
      const path = "diagrams/auth.tldx.jsx";
      const { doc, box } = astBuilders(path);
      const execute = new FakeExecute();
      execute.setResult(SRC, { ast: doc({}, [box({ id: "b" })]), inputs: [path] });

      const result = await compileFile(path, deps({ [path]: SRC }, new StubLayout(), execute));

      expect(result.sceneJson!.store["page:main"]?.name).toBe("auth");
    });

    it("lets a doc title win over the file name", async () => {
      const path = "diagrams/auth.tldx.jsx";
      const { doc, box } = astBuilders(path);
      const execute = new FakeExecute();
      execute.setResult(SRC, {
        ast: doc({ title: "Auth flow" }, [box({ id: "b" })]),
        inputs: [path],
      });

      const result = await compileFile(path, deps({ [path]: SRC }, new StubLayout(), execute));

      expect(result.sceneJson!.store["page:main"]?.name).toBe("Auth flow");
    });

    it("invokes the layout port with the lowered IR", async () => {
      const path = "x.tldx.jsx";
      const { doc, box } = astBuilders(path);
      const execute = new FakeExecute();
      execute.setResult(SRC, {
        ast: doc({ id: "d" }, [box({ id: "b" })]),
        inputs: [path],
      });
      const layout: LayoutPort = {
        layout: vi.fn(async (ir: IRDoc): Promise<IRDocPositioned> => new StubLayout().layout(ir)),
      };
      await compileFile(path, deps({ [path]: SRC }, layout, execute));
      expect(layout.layout).toHaveBeenCalledTimes(1);
      const irArg = (layout.layout as ReturnType<typeof vi.fn>).mock.calls[0]![0] as IRDoc;
      expect(irArg.kind).toBe("doc");
      expect(irArg.id).toBe("d");
    });
  });

  describe("filesystem errors", () => {
    it("returns fs/not-found and null sceneJson when the file is missing", async () => {
      const result = await compileFile("missing.tldx.jsx", deps({}));
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
      const result = await compileFile("guarded.tldx.jsx", failing);
      expect(result.sceneJson).toBeNull();
      expect(result.diagnostics).toHaveLength(1);
      expect(result.diagnostics[0]!.code).toBe("fs/read-error");
    });
  });

  describe("compile errors short-circuit before layout", () => {
    it("returns ir diagnostics and skips layout/emit on lowering error", async () => {
      const path = "dup.tldx.jsx";
      const { doc, box } = astBuilders(path);
      const execute = new FakeExecute();
      execute.setResult(SRC, {
        ast: doc({ id: "d" }, [box({ id: "x" }), box({ id: "x" })]),
        inputs: [path],
      });
      const layout: LayoutPort = { layout: vi.fn() };
      const result = await compileFile(path, deps({ [path]: SRC }, layout, execute));
      expect(result.sceneJson).toBeNull();
      expect(result.diagnostics.some((d) => d.code === "ir/duplicate-id")).toBe(true);
      expect(layout.layout).not.toHaveBeenCalled();
    });

    it("returns ir/root-not-doc when the top-level element is not <doc>", async () => {
      const path = "frag.tldx.jsx";
      const { frame } = astBuilders(path);
      const execute = new FakeExecute();
      execute.setResult(SRC, {
        ast: frame({ id: "x" }),
        inputs: [path],
      });
      const result = await compileFile(path, deps({ [path]: SRC }, new StubLayout(), execute));
      expect(result.sceneJson).toBeNull();
      expect(result.diagnostics.some((d) => d.code === "ir/root-not-doc")).toBe(true);
    });
  });

  describe("JSX front end", () => {
    it("compiles a .tldx.jsx path from the executor's AST", async () => {
      const path = "diagram.tldx.jsx";
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
      const path = "broken.tldx.jsx";
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
      const path = "diagram.tldx.jsx";
      const source = "export default function Diagram() { return null; }";
      const execute = new FakeExecute();

      await compileFile(path, deps({ [path]: source }, new StubLayout(), execute));

      expect(execute.calls).toEqual([{ source, path }]);
    });

    it("normalises a bare-basename diagnostic span to be relative to the path's directory", async () => {
      const path = "foo/bar.tldx.jsx";
      const source = "whatever";
      const execute = new FakeExecute();
      execute.setResult(source, {
        diagnostics: [
          error("runtime/compile", "bad jsx", { file: "bar.tldx.jsx", line: 1, column: 1 }),
        ],
      });

      const result = await compileFile(path, deps({ [path]: source }, new StubLayout(), execute));

      expect(result.diagnostics[0]!.span!.file).toBe("foo/bar.tldx.jsx");
    });

    it("normalises an absolute diagnostic span to be relative to the path's directory", async () => {
      const path = "foo/bar.tldx.jsx";
      const source = "whatever";
      const execute = new FakeExecute();
      execute.setResult(source, {
        diagnostics: [
          error("runtime/compile", "bad jsx", {
            file: resolve("foo/bar.tldx.jsx"),
            line: 1,
            column: 1,
          }),
        ],
      });

      const result = await compileFile(path, deps({ [path]: source }, new StubLayout(), execute));

      expect(result.diagnostics[0]!.span!.file).toBe("foo/bar.tldx.jsx");
    });
  });

  describe("inputs", () => {
    it("is null when the file read fails", async () => {
      const result = await compileFile("missing.tldx.jsx", deps({}));
      expect(result.inputs).toBeNull();
    });

    it("is null on a diagnostics-only JSX execute result", async () => {
      const path = "broken.tldx.jsx";
      const source = "throw new Error('boom')";
      const execute = new FakeExecute();
      execute.setResult(source, {
        diagnostics: [error("runtime/threw", "boom", { file: path, line: 1, column: 1 })],
      });

      const result = await compileFile(path, deps({ [path]: source }, new StubLayout(), execute));
      expect(result.inputs).toBeNull();
    });

    it("is executed.inputs, normalised to the path's directory style, on JSX success", async () => {
      const path = "foo/bar.tldx.jsx";
      const source = "export default function Diagram() { return null; }";
      const execute = new FakeExecute();
      execute.setResult(source, {
        ast: docWithLabelledBox(path, "box"),
        inputs: [resolve(path), resolve("foo/parts.tldx.jsx")],
      });

      const result = await compileFile(path, deps({ [path]: source }, new StubLayout(), execute));
      expect(result.inputs).toEqual(["foo/bar.tldx.jsx", "foo/parts.tldx.jsx"]);
    });
  });
});

describe("compileFile: geo", () => {
  it.each(GEOS)("round-trips geo=%s to scene JSON without a diagnostic", async (geo) => {
    const path = "geo.tldx.jsx";
    const { doc, box } = astBuilders(path);
    const execute = new FakeExecute();
    execute.setResult(SRC, {
      ast: doc({ id: "d" }, [box({ id: "b", label: "L", geo })]),
      inputs: [path],
    });

    const result = await compileFile(path, deps({ [path]: SRC }, new StubLayout(), execute));

    expect(result.diagnostics).toEqual([]);
    const scene = result.sceneJson!;
    const [shape] = recordsByType(scene, "shape");
    expect((shape!.props as { geo?: string }).geo).toBe(geo);
  });
});
