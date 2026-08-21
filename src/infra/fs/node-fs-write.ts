/**
 * Real `FsWritePort` adapter on top of node:fs/promises. Only the overlay
 * write path uses this - a one-line passthrough, so no contract suite (see
 * `node-fs-write.test.ts`).
 */

import { writeFile } from "node:fs/promises";

import type { FsWritePort } from "../../app/ports/fs.js";

export function createNodeFsWrite(): FsWritePort {
  return {
    async write(path: string, content: string): Promise<void> {
      await writeFile(path, content, "utf8");
    },
  };
}
