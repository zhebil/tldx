import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runFsReadContract,
  type FsReadHarness,
} from "../../app/ports/fs.contract.js";

import { createNodeFsRead } from "./node-fs-read.js";

runFsReadContract("createNodeFsRead", async (): Promise<FsReadHarness> => {
  const dir = await mkdtemp(join(tmpdir(), "tldsl-fs-read-"));
  return {
    port: createNodeFsRead(),
    writeFile: async (relPath, content) => {
      const abs = join(dir, relPath);
      await writeFile(abs, content, "utf8");
      return abs;
    },
    pathFor: (relPath) => join(dir, relPath),
    dispose: async () => {
      await rm(dir, { recursive: true, force: true });
    },
  };
});
