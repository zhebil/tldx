import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  runWatchContract,
  type WatchHarness,
} from "../../app/ports/watch.contract.js";

import { createChokidarWatch } from "./chokidar-watch.js";

runWatchContract(
  "createChokidarWatch",
  async (): Promise<WatchHarness> => {
    const dir = await mkdtemp(join(tmpdir(), "tldsl-watch-"));
    const port = createChokidarWatch();
    return {
      port,
      writeFile: async (relPath, content) => {
        const abs = join(dir, relPath);
        await writeFile(abs, content, "utf8");
        return abs;
      },
      triggerChange: async (absPath, content) => {
        // macOS FSEvents (the kernel source for chokidar/fs.watch on darwin)
        // coalesces writes that land in the same ~10ms tick; spacing them out
        // matches real editor-save cadence and keeps the contract test honest
        // without flipping the adapter to polling mode.
        await new Promise((r) => setTimeout(r, 50));
        await writeFile(absPath, content, "utf8");
      },
      deleteFile: async (absPath) => {
        await new Promise((r) => setTimeout(r, 50));
        await rm(absPath, { force: true });
      },
      dispose: async () => {
        await rm(dir, { recursive: true, force: true });
      },
    };
  },
  { eventTimeoutMs: 5000 },
);
