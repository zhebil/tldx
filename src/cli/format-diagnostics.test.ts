import { describe, expect, it } from "vitest";

import { error, warning } from "../domain/diagnostics/index.js";

import { formatDiagnostics } from "./format-diagnostics.js";

describe("formatDiagnostics", () => {
  it("returns an empty string for no diagnostics", () => {
    expect(formatDiagnostics([])).toBe("");
  });

  it("formats an error with span as <file>:<line>:<col>: error[<code>]: <message>", () => {
    const out = formatDiagnostics([
      error("parser/unexpected-token", "expected '>'", {
        file: "auth.tldsl",
        line: 3,
        column: 7,
      }),
    ]);
    expect(out).toBe(
      "auth.tldsl:3:7: error[parser/unexpected-token]: expected '>'",
    );
  });

  it("formats a warning with span using the warning prefix", () => {
    const out = formatDiagnostics([
      warning("layout/overlap", "two boxes overlap", {
        file: "auth.tldsl",
        line: 5,
        column: 1,
      }),
    ]);
    expect(out).toBe("auth.tldsl:5:1: warning[layout/overlap]: two boxes overlap");
  });

  it("omits the location prefix when no span is given", () => {
    const out = formatDiagnostics([error("ir/missing-id", "<box> requires id")]);
    expect(out).toBe("error[ir/missing-id]: <box> requires id");
  });

  it("joins multiple diagnostics with newlines and no trailing newline", () => {
    const out = formatDiagnostics([
      error("parser/unexpected-token", "expected '>'", {
        file: "a.tldsl",
        line: 1,
        column: 1,
      }),
      warning("layout/overlap", "two boxes overlap", {
        file: "a.tldsl",
        line: 2,
        column: 1,
      }),
    ]);
    expect(out).toBe(
      "a.tldsl:1:1: error[parser/unexpected-token]: expected '>'\n" +
        "a.tldsl:2:1: warning[layout/overlap]: two boxes overlap",
    );
    expect(out.endsWith("\n")).toBe(false);
  });
});
