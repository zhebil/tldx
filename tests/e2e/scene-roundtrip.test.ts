/**
 * Drift detector between our hand-rolled SceneJSON shape and the tldraw
 * version we pin. Runs the full builder-produced auth-flow scene through
 * `schema.migrateStoreSnapshot`, which is the same migration + structural
 * validation pipeline `loadSnapshot` invokes inside the editor. If our
 * builders or the DEFAULT_SCHEMA in `src/contracts/builders.ts` drift from
 * what `tldraw@^3.15` accepts, this test fails before the viewer would.
 * Uses `@tldraw/tlschema` directly, so no DOM and no editor mount.
 */
import { createTLSchema } from "@tldraw/tlschema";
import { describe, expect, it } from "vitest";

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

function authFlowScene(): SceneJSON {
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
  ];
  return sceneJson(records);
}

describe("scene-json round-trip through tldraw schema", () => {
  const schema = createTLSchema();
  const scene = authFlowScene();

  it("migrates the auth-flow snapshot without error", () => {
    const result = schema.migrateStoreSnapshot({
      store: scene.store as never,
      schema: scene.schema as never,
    });
    if (result.type === "error") {
      throw new Error(`migration failed: ${result.reason}`);
    }
    expect(result.type).toBe("success");
  });

  it("preserves every record id through migration", () => {
    const result = schema.migrateStoreSnapshot({
      store: scene.store as never,
      schema: scene.schema as never,
    });
    if (result.type !== "success") throw new Error("expected success");

    const before = Object.keys(scene.store).sort();
    const after = Object.keys(result.value).sort();
    expect(after).toEqual(before);
  });

  it("validates each migrated record against its schema type", () => {
    const result = schema.migrateStoreSnapshot({
      store: scene.store as never,
      schema: scene.schema as never,
    });
    if (result.type !== "success") throw new Error("expected success");

    for (const record of Object.values(result.value)) {
      const recordType = (
        schema.types as Record<string, { validate: (r: unknown) => unknown } | undefined>
      )[record.typeName];
      if (!recordType) {
        throw new Error(`schema has no type for "${record.typeName}"`);
      }
      expect(() => recordType.validate(record)).not.toThrow();
    }
  });

  it("matches the schema sequences pinned in DEFAULT_SCHEMA", () => {
    const live = schema.serialize();
    expect(live.schemaVersion).toBe(scene.schema.schemaVersion);
    for (const [seq, ours] of Object.entries(scene.schema.sequences)) {
      expect(live.sequences[seq], `sequence ${seq}`).toBe(ours);
    }
  });
});
