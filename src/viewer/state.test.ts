import { describe, expect, it } from "vitest";

import type { Diagnostic } from "../contracts/diagnostic.js";
import type { SceneJSON } from "../contracts/scene-json.js";
import type { SceneMessage } from "../contracts/scene-message.js";

import { applyMessage, initialViewerState, pageKeyFromHash, sceneTitle } from "./state.js";

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

const scene = (pageKey: string, payload: SceneJSON): SceneMessage => ({
  v: 1,
  kind: "scene",
  pageKey,
  payload,
});
const failure = (pageKey: string): SceneMessage => ({
  v: 1,
  kind: "error",
  pageKey,
  payload: { diagnostics: [DIAG] },
});

describe("applyMessage", () => {
  it("a scene lands on its own page and clears that page's diagnostics", () => {
    const broken = applyMessage(initialViewerState, failure("a"));
    const state = applyMessage(broken, scene("a", SCENE_A));

    expect(state.pages.a).toEqual({ scene: SCENE_A, diagnostics: [] });
  });

  it("an error keeps that page's last good scene", () => {
    const good = applyMessage(initialViewerState, scene("a", SCENE_A));
    const state = applyMessage(good, failure("a"));

    expect(state.pages.a).toEqual({ scene: SCENE_A, diagnostics: [DIAG] });
  });

  it("a page that has only ever failed has diagnostics and no scene", () => {
    expect(applyMessage(initialViewerState, failure("a")).pages.a).toEqual({
      scene: null,
      diagnostics: [DIAG],
    });
  });

  it("one diagram's success does not clear another's diagnostics", () => {
    const broken = applyMessage(initialViewerState, failure("b"));
    const state = applyMessage(broken, scene("a", SCENE_A));

    expect(state.pages.b?.diagnostics).toEqual([DIAG]);
    expect(state.pages.a?.diagnostics).toEqual([]);
  });

  it("one diagram's failure does not disturb another's scene", () => {
    const both = applyMessage(
      applyMessage(initialViewerState, scene("a", SCENE_A)),
      scene("b", SCENE_B),
    );
    const state = applyMessage(both, failure("a"));

    expect(state.pages.b).toEqual({ scene: SCENE_B, diagnostics: [] });
  });

  it("a ping changes nothing", () => {
    const before = applyMessage(initialViewerState, scene("a", SCENE_A));

    expect(applyMessage(before, { v: 1, kind: "ping", payload: {} })).toBe(before);
  });
});

describe("sceneTitle", () => {
  it("reads the page record's name", () => {
    const withPage: SceneJSON = {
      store: { "page:abc": { id: "page:abc", typeName: "page", name: "auth flow" } },
      schema: { schemaVersion: 2, sequences: {} },
    };

    expect(sceneTitle(withPage)).toBe("auth flow");
    expect(sceneTitle(null)).toBeNull();
    expect(sceneTitle(SCENE_A)).toBeNull();
  });
});

describe("pageKeyFromHash", () => {
  it("reads the key `tldx serve` and `tldx render` put in the URL", () => {
    expect(pageKeyFromHash("#page=3f2a9c11")).toBe("3f2a9c11");
    expect(pageKeyFromHash("page=3f2a9c11")).toBe("3f2a9c11");
  });

  it("is null for anything else, rather than an error", () => {
    expect(pageKeyFromHash("")).toBeNull();
    expect(pageKeyFromHash("#")).toBeNull();
    expect(pageKeyFromHash("#other=1")).toBeNull();
    expect(pageKeyFromHash("#page=")).toBeNull();
    expect(pageKeyFromHash("#page=a/../b")).toBeNull();
  });
});
