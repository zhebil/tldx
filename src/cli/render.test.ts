import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { parseArgs } from "./render.js";

describe("parseArgs", () => {
  it("resolves positional file/out and defaults", () => {
    const { file, out, opts } = parseArgs(["diagram.tldsl.jsx", "out.png"]);
    expect(file).toBe(resolve(process.cwd(), "diagram.tldsl.jsx"));
    expect(out).toBe(resolve(process.cwd(), "out.png"));
    expect(opts).toEqual({ dark: false, background: true, format: "png" });
  });

  it("parses --frame", () => {
    const { opts } = parseArgs(["a.tldsl.jsx", "out.png", "--frame", "checkout"]);
    expect(opts.frame).toBe("checkout");
  });

  it("parses --shapes as a comma-separated, trimmed list", () => {
    const { opts } = parseArgs(["a.tldsl.jsx", "out.png", "--shapes", "a, b ,c"]);
    expect(opts.shapes).toEqual(["a", "b", "c"]);
  });

  it("parses --padding and --scale as numbers", () => {
    const { opts } = parseArgs(["a.tldsl.jsx", "out.png", "--padding", "10", "--scale", "2"]);
    expect(opts.padding).toBe(10);
    expect(opts.scale).toBe(2);
  });

  it("parses --dark and --no-background", () => {
    const { opts } = parseArgs(["a.tldsl.jsx", "out.png", "--dark", "--no-background"]);
    expect(opts.dark).toBe(true);
    expect(opts.background).toBe(false);
  });

  it("infers format from the out extension", () => {
    expect(parseArgs(["a.tldsl.jsx", "out.svg"]).opts.format).toBe("svg");
    expect(parseArgs(["a.tldsl.jsx", "out.jpeg"]).opts.format).toBe("jpeg");
    expect(parseArgs(["a.tldsl.jsx", "out.webp"]).opts.format).toBe("webp");
  });

  it("defaults to png for an unrecognized extension", () => {
    expect(parseArgs(["a.tldsl.jsx", "out.bmp"]).opts.format).toBe("png");
  });

  it("--format overrides the inferred extension", () => {
    const { opts } = parseArgs(["a.tldsl.jsx", "out.png", "--format", "svg"]);
    expect(opts.format).toBe("svg");
  });

  it("rejects an unknown --format value", () => {
    expect(() => parseArgs(["a.tldsl.jsx", "out.png", "--format", "gif"])).toThrow(/--format must be one of/);
  });

  it("rejects --frame and --shapes together", () => {
    expect(() =>
      parseArgs(["a.tldsl.jsx", "out.png", "--frame", "f1", "--shapes", "a,b"]),
    ).toThrow(/mutually exclusive/);
  });

  it("throws when the file positional is missing", () => {
    expect(() => parseArgs([])).toThrow(/usage: tldsl render/);
  });

  it("throws when the out positional is missing", () => {
    expect(() => parseArgs(["a.tldsl.jsx"])).toThrow(/usage: tldsl render/);
  });
});
