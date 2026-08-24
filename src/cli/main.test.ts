import { describe, expect, it } from "vitest";

import { shouldOpenBrowser } from "./main.js";

describe("shouldOpenBrowser (a restart must not pile up tabs)", () => {
  it("opens when nothing is live and --no-open wasn't passed", () => {
    expect(shouldOpenBrowser(false, undefined)).toBe(true);
  });

  it("does not open when --no-open was passed", () => {
    expect(shouldOpenBrowser(true, undefined)).toBe(false);
  });

  it("does not open when a live server is already recorded for the file, even without --no-open", () => {
    expect(shouldOpenBrowser(false, { pid: 123 })).toBe(false);
  });

  it("does not open when both --no-open and a live record are present", () => {
    expect(shouldOpenBrowser(true, { pid: 123 })).toBe(false);
  });
});
