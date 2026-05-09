import { describe, expect, it } from "vitest";

import { isSceneMessage } from "./sse-client.js";

describe("isSceneMessage", () => {
  it("accepts a scene message", () => {
    expect(
      isSceneMessage({
        v: 1,
        kind: "scene",
        payload: { store: {}, schema: { schemaVersion: 2, sequences: {} } },
      }),
    ).toBe(true);
  });

  it("accepts an error message", () => {
    expect(
      isSceneMessage({
        v: 1,
        kind: "error",
        payload: { diagnostics: [] },
      }),
    ).toBe(true);
  });

  it("accepts a ping message", () => {
    expect(isSceneMessage({ v: 1, kind: "ping", payload: {} })).toBe(true);
  });

  it("rejects an unknown kind", () => {
    expect(isSceneMessage({ v: 1, kind: "unknown", payload: {} })).toBe(false);
  });

  it("rejects a wrong version", () => {
    expect(isSceneMessage({ v: 2, kind: "ping", payload: {} })).toBe(false);
  });

  it("rejects null", () => {
    expect(isSceneMessage(null)).toBe(false);
  });

  it("rejects a non-object", () => {
    expect(isSceneMessage("oops")).toBe(false);
    expect(isSceneMessage(42)).toBe(false);
  });

  it("rejects a missing payload", () => {
    expect(isSceneMessage({ v: 1, kind: "ping" })).toBe(false);
  });

  it("rejects a non-object payload", () => {
    expect(isSceneMessage({ v: 1, kind: "ping", payload: "nope" })).toBe(false);
  });
});
