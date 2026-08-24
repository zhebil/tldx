import { describe, expect, it } from "vitest";

import { createStderrLog } from "./stderr-log.js";

describe("createStderrLog", () => {
  function capture(): { write: (chunk: string) => void; lines: string[] } {
    const lines: string[] = [];
    return { write: (chunk) => lines.push(chunk), lines };
  }

  it("formats level + code + msg on a single line", () => {
    const cap = capture();
    const log = createStderrLog({ write: cap.write });
    log.log({
      level: "info",
      code: "watch/recompile-ok",
      msg: "compiled ok (initial)",
    });
    expect(cap.lines).toEqual(["[info] watch/recompile-ok: compiled ok (initial)\n"]);
  });

  it("appends JSON-encoded structured fields when present", () => {
    const cap = capture();
    const log = createStderrLog({ write: cap.write });
    log.log({
      level: "warn",
      code: "watch/recompile-error",
      msg: "compile failed",
      fields: { trigger: "change", count: 2 },
    });
    expect(cap.lines[0]).toBe(
      '[warn] watch/recompile-error: compile failed trigger="change" count=2\n',
    );
  });

  it("omits the field suffix when fields is empty", () => {
    const cap = capture();
    const log = createStderrLog({ write: cap.write });
    log.log({ level: "debug", code: "x/y", msg: "m", fields: {} });
    expect(cap.lines[0]).toBe("[debug] x/y: m\n");
  });

  it("emits one line per event in call order", () => {
    const cap = capture();
    const log = createStderrLog({ write: cap.write });
    log.log({ level: "info", code: "a", msg: "first" });
    log.log({ level: "error", code: "b", msg: "second" });
    expect(cap.lines).toEqual(["[info] a: first\n", "[error] b: second\n"]);
  });
});
