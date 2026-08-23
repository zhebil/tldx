import { describe, expect, it, vi } from "vitest";
import type { Editor } from "tldraw";

import type { SceneJSON } from "../contracts/scene-json.js";

import { pushScene } from "./app.js";

const scene: SceneJSON = {
  store: { "shape:1": { id: "shape:1", typeName: "shape", x: 1 } },
  schema: { schemaVersion: 2, sequences: {} },
};

describe("pushScene", () => {
  it("applies the scene inside store.mergeRemoteChanges, not as a bare loadSnapshot", () => {
    const loadSnapshot = vi.fn();
    const mergeRemoteChanges = vi.fn((fn: () => void) => fn());
    const editor = { loadSnapshot, store: { mergeRemoteChanges } } as unknown as Editor;

    pushScene(editor, scene);

    expect(mergeRemoteChanges).toHaveBeenCalledTimes(1);
    expect(loadSnapshot).toHaveBeenCalledTimes(1);
    expect(loadSnapshot).toHaveBeenCalledWith(scene);
  });

  it("never calls loadSnapshot outside of the mergeRemoteChanges callback", () => {
    const loadSnapshot = vi.fn();
    const mergeRemoteChanges = vi.fn();
    const editor = { loadSnapshot, store: { mergeRemoteChanges } } as unknown as Editor;

    pushScene(editor, scene);

    expect(loadSnapshot).not.toHaveBeenCalled();
  });
});
