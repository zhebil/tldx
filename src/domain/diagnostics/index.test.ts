import { describe, expect, it } from "vitest";

import { error, hasErrors, isError, warning } from "./index.js";

describe("error()", () => {
  it("builds an error-severity diagnostic with code and message", () => {
    const d = error("parser/unexpected-token", "expected '>'");
    expect(d).toEqual({
      severity: "error",
      code: "parser/unexpected-token",
      message: "expected '>'",
    });
  });

  it("includes a source span when given", () => {
    const span = { file: "a.tldx", line: 3, column: 7, length: 1 };
    const d = error("parser/unexpected-token", "expected '>'", span);
    expect(d.span).toEqual(span);
  });

  it("omits the span field entirely when no span is given", () => {
    const d = error("ir/missing-id", "missing id");
    expect("span" in d).toBe(false);
  });
});

describe("warning()", () => {
  it("builds a warning-severity diagnostic", () => {
    const d = warning("layout/overlap", "two boxes overlap");
    expect(d.severity).toBe("warning");
    expect(d.code).toBe("layout/overlap");
  });
});

describe("isError() / hasErrors()", () => {
  it("isError() is true only for error severity", () => {
    expect(isError(error("x/y", "m"))).toBe(true);
    expect(isError(warning("x/y", "m"))).toBe(false);
  });

  it("hasErrors() is true if any diagnostic is an error", () => {
    expect(hasErrors([])).toBe(false);
    expect(hasErrors([warning("x/y", "m")])).toBe(false);
    expect(hasErrors([warning("a/b", "m"), error("c/d", "m")])).toBe(true);
  });
});
