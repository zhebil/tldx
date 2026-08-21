import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createNodeFsWrite } from "./node-fs-write.js";

describe("createNodeFsWrite", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "tldsl-fs-write-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes UTF-8 content to the given path", async () => {
    const fsWrite = createNodeFsWrite();
    const path = join(dir, "out.txt");

    await fsWrite.write(path, "hello");

    expect(await readFile(path, "utf8")).toBe("hello");
  });

  it("overwrites an existing file", async () => {
    const fsWrite = createNodeFsWrite();
    const path = join(dir, "out.txt");

    await fsWrite.write(path, "first");
    await fsWrite.write(path, "second");

    expect(await readFile(path, "utf8")).toBe("second");
  });
});
