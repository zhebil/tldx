import { describe, expect, it } from "vitest";

import type { Diagnostic } from "../contracts/diagnostic.js";
import type { SceneJSON } from "../contracts/scene-json.js";

import {
  applyMessage,
  initialViewerState,
  type ViewerState,
} from "./state.js";

const SCENE_A: SceneJSON = {
  store: {},
  schema: { schemaVersion: 2, sequences: {} },
};
const SCENE_B: SceneJSON = {
  store: {},
  schema: { schemaVersion: 2, sequences: { "com.tldraw.store": 4 } },
};
const DIAG: Diagnostic = {
  severity: "error",
  code: "parser/unexpected-token",
  message: "boom",
};

describe("applyMessage", () => {
  it("scene message adopts the new scene and clears stale diagnostics", () => {
    const start: ViewerState = { scene: SCENE_A, diagnostics: [DIAG] };
    const next = applyMessage(start, {
      v: 1,
      kind: "scene",
      payload: SCENE_B,
    });
    expect(next.scene).toBe(SCENE_B);
    expect(next.diagnostics).toEqual([]);
  });

  it("error message keeps the prior scene (last-good) and surfaces diagnostics", () => {
    const start: ViewerState = { scene: SCENE_A, diagnostics: [] };
    const next = applyMessage(start, {
      v: 1,
      kind: "error",
      payload: { diagnostics: [DIAG] },
    });
    expect(next.scene).toBe(SCENE_A);
    expect(next.diagnostics).toEqual([DIAG]);
  });

  it("error message before any scene leaves scene null", () => {
    const next = applyMessage(initialViewerState, {
      v: 1,
      kind: "error",
      payload: { diagnostics: [DIAG] },
    });
    expect(next.scene).toBeNull();
    expect(next.diagnostics).toEqual([DIAG]);
  });

  it("ping message is a no-op (returns the same state reference)", () => {
    const start: ViewerState = { scene: SCENE_A, diagnostics: [DIAG] };
    const next = applyMessage(start, { v: 1, kind: "ping", payload: {} });
    expect(next).toBe(start);
  });

  it("a scene after an error clears the diagnostics", () => {
    const afterError = applyMessage(initialViewerState, {
      v: 1,
      kind: "error",
      payload: { diagnostics: [DIAG] },
    });
    const afterScene = applyMessage(afterError, {
      v: 1,
      kind: "scene",
      payload: SCENE_A,
    });
    expect(afterScene.scene).toBe(SCENE_A);
    expect(afterScene.diagnostics).toEqual([]);
  });
});
