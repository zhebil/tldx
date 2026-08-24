import { describe, expect, it } from "vitest";

import { shouldOpenBrowser } from "./main.js";

describe("shouldOpenBrowser (a tab opens only when nobody is looking yet)", () => {
  it("opens when nothing is live and --no-open wasn't passed", () => {
    expect(shouldOpenBrowser(false, false)).toBe(true);
  });

  it("does not open when --no-open was passed", () => {
    expect(shouldOpenBrowser(true, false)).toBe(false);
  });

  it("does not open when a viewer is already connected, even without --no-open", () => {
    expect(shouldOpenBrowser(false, true)).toBe(false);
  });

  it("does not open when both --no-open and a connected viewer are present", () => {
    expect(shouldOpenBrowser(true, true)).toBe(false);
  });
});
