import { describe, it, expect } from "vitest";
import { documentRecord, pageRecord, sceneJson, sceneMessage } from "./builders.js";
import type { SceneMessage } from "./scene-message.js";
import { SCENE_MESSAGE_VERSION } from "./scene-message.js";

/**
 * Type-system smoke tests: pins the discriminated-union shape so a refactor
 * that drops `v` or widens `kind` fails to compile.
 */

describe("SceneMessage envelope", () => {
  it("scene messages stamp v=1", () => {
    const msg = sceneMessage.scene(
      "pageA",
      sceneJson([documentRecord(), pageRecord({ id: "page:main" })]),
    );
    expect(msg.v).toBe(SCENE_MESSAGE_VERSION);
    expect(msg.kind).toBe("scene");
  });

  it("error messages preserve diagnostic codes", () => {
    const msg = sceneMessage.error("pageA", [
      {
        severity: "error",
        code: "parser/unexpected-token",
        message: "expected closing '>'",
        span: { file: "auth.tldx", line: 3, column: 12, length: 1 },
      },
    ]);
    expect(msg.kind).toBe("error");
    if (msg.kind === "error") {
      expect(msg.payload.diagnostics[0]?.code).toBe("parser/unexpected-token");
    }
  });

  it("rejects any kind that isn't scene/error/ping (compile-time)", () => {
    // @ts-expect-error - "bogus" is not a valid kind
    const bogus: SceneMessage = { v: 1, kind: "bogus", payload: {} };
    expect(bogus).toBeDefined();
  });

  it("rejects v != 1 (compile-time)", () => {
    // @ts-expect-error - v=2 is not part of v:1 envelope
    const wrongVersion: SceneMessage = { v: 2, kind: "ping", payload: {} };
    expect(wrongVersion).toBeDefined();
  });
});
