/**
 * Smoke test for the canonical 5-node auth-flow fixture.
 *
 * The .tldsl is the agent-authored DSL source. The target SceneJSON is
 * specified by `expectedScene()` below using `src/contracts/builders.ts`
 * factories - builders are the spec, no checked-in JSON. domain/emit/ is
 * not landed yet; when it is, this test should grow a round-trip
 * assertion that `compile(auth.tldsl)` deep-equals `expectedScene()`.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { compileFile } from "../../src/app/compile-file.js";
import {
  arrowBinding,
  arrowShape,
  boxShape,
  documentRecord,
  frameShape,
  noteShape,
  pageRecord,
  sceneJson,
} from "../../src/contracts/builders.js";
import type { SceneJSON, TLRecord } from "../../src/contracts/scene-json.js";
import { parse } from "../../src/domain/parser/index.js";
import { createJsxExecute } from "../../src/infra/execute-jsx/execute-jsx.js";
import { createNodeFsRead } from "../../src/infra/fs/node-fs-read.js";
import { ElkLayoutAdapter } from "../../src/infra/layout-elk/elk-layout.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");

function readFixture(name: string): string {
  return readFileSync(join(FIXTURES, name), "utf8");
}

function expectedScene(): SceneJSON {
  const FRAME = "shape:auth-flow";

  const records: TLRecord[] = [
    documentRecord(),
    pageRecord({ id: "page:main" }),

    frameShape({
      id: FRAME,
      x: 40,
      y: 40,
      w: 1000,
      h: 300,
      name: "Auth flow",
      index: "a1",
    }),

    boxShape({
      id: "shape:user",
      parentId: FRAME,
      x: 20,
      y: 110,
      w: 160,
      h: 80,
      text: "User",
      index: "a1",
    }),
    boxShape({
      id: "shape:login",
      parentId: FRAME,
      x: 220,
      y: 110,
      w: 160,
      h: 80,
      text: "Login form",
      index: "a2",
    }),
    boxShape({
      id: "shape:auth",
      parentId: FRAME,
      x: 420,
      y: 110,
      w: 160,
      h: 80,
      text: "Auth service",
      index: "a3",
    }),
    boxShape({
      id: "shape:tokens",
      parentId: FRAME,
      x: 620,
      y: 110,
      w: 160,
      h: 80,
      text: "Token store",
      index: "a4",
    }),
    boxShape({
      id: "shape:app",
      parentId: FRAME,
      x: 820,
      y: 110,
      w: 160,
      h: 80,
      text: "App",
      index: "a5",
    }),

    noteShape({
      id: "shape:n-design",
      parentId: FRAME,
      x: 20,
      y: 210,
      text: "Token store is the only writer of session tokens.",
      index: "a6",
    }),

    arrowShape({ id: "shape:e-user-login", x: 0, y: 0, index: "a7" }),
    arrowBinding({
      id: "binding:e-user-login-start",
      arrowId: "shape:e-user-login",
      shapeId: "shape:user",
      terminal: "start",
    }),
    arrowBinding({
      id: "binding:e-user-login-end",
      arrowId: "shape:e-user-login",
      shapeId: "shape:login",
      terminal: "end",
    }),

    arrowShape({ id: "shape:e-login-auth", x: 0, y: 0, index: "a8" }),
    arrowBinding({
      id: "binding:e-login-auth-start",
      arrowId: "shape:e-login-auth",
      shapeId: "shape:login",
      terminal: "start",
    }),
    arrowBinding({
      id: "binding:e-login-auth-end",
      arrowId: "shape:e-login-auth",
      shapeId: "shape:auth",
      terminal: "end",
    }),

    arrowShape({ id: "shape:e-auth-tokens", x: 0, y: 0, index: "a9" }),
    arrowBinding({
      id: "binding:e-auth-tokens-start",
      arrowId: "shape:e-auth-tokens",
      shapeId: "shape:auth",
      terminal: "start",
    }),
    arrowBinding({
      id: "binding:e-auth-tokens-end",
      arrowId: "shape:e-auth-tokens",
      shapeId: "shape:tokens",
      terminal: "end",
    }),

    arrowShape({ id: "shape:e-tokens-app", x: 0, y: 0, index: "aA" }),
    arrowBinding({
      id: "binding:e-tokens-app-start",
      arrowId: "shape:e-tokens-app",
      shapeId: "shape:tokens",
      terminal: "start",
    }),
    arrowBinding({
      id: "binding:e-tokens-app-end",
      arrowId: "shape:e-tokens-app",
      shapeId: "shape:app",
      terminal: "end",
    }),
  ];

  return sceneJson(records);
}

describe("e2e fixture: auth.tldsl", () => {
  it("parses cleanly under the MVP grammar", () => {
    const source = readFixture("auth.tldsl");
    const result = parse(source, "auth.tldsl");

    expect(result.diagnostics).toEqual([]);
    expect(result.ast?.kind).toBe("doc");
    if (result.ast?.kind !== "doc") throw new Error("expected doc");

    const frame = result.ast.children[0];
    if (frame?.kind !== "frame") throw new Error("expected frame at root");

    const elementKinds = frame.children.map((c) => c.kind);
    expect(elementKinds.filter((k) => k === "box")).toHaveLength(5);
    expect(elementKinds.filter((k) => k === "edge")).toHaveLength(4);
    expect(elementKinds.filter((k) => k === "note")).toHaveLength(1);
  });
});

describe("e2e fixture: auth scene spec", () => {
  const scene = expectedScene();

  it("is structurally a valid SceneJSON", () => {
    expect(scene.store).toBeTypeOf("object");
    expect(scene.schema).toBeTypeOf("object");
    expect(scene.schema.schemaVersion).toBeTypeOf("number");
    expect(scene.schema.sequences).toBeTypeOf("object");

    for (const [key, record] of Object.entries(scene.store)) {
      expect(record.id).toBe(key);
      expect(typeof record.typeName).toBe("string");
    }
  });

  it("has exactly one document and one page", () => {
    const docs = Object.values(scene.store).filter(
      (r) => r.typeName === "document",
    );
    const pages = Object.values(scene.store).filter(
      (r) => r.typeName === "page",
    );
    expect(docs).toHaveLength(1);
    expect(pages).toHaveLength(1);
  });
});

// Parity gate for the JSX pivot (docs/jsx-pivot.md, A7): kept alive until
// A8 deletes the text parser, proving both front ends emit the same scene.
describe("e2e fixture: auth.tldsl vs auth.tldsl.jsx parity", () => {
  it(
    "compiles to byte-identical SceneJSON through both front ends",
    async () => {
      const deps = {
        fs: createNodeFsRead(),
        layout: new ElkLayoutAdapter(),
        execute: createJsxExecute(),
      };

      const textResult = await compileFile(join(FIXTURES, "auth.tldsl"), deps);
      const jsxResult = await compileFile(join(FIXTURES, "auth.tldsl.jsx"), deps);

      expect(textResult.diagnostics).toEqual([]);
      expect(jsxResult.diagnostics).toEqual([]);
      expect(textResult.sceneJson).not.toBeNull();
      expect(jsxResult.sceneJson).not.toBeNull();

      expect(JSON.stringify(jsxResult.sceneJson)).toBe(JSON.stringify(textResult.sceneJson));
    },
    30_000,
  );
});
