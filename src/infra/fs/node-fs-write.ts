/** Real `FsWritePort` adapter on node:fs/promises. */

import { writeFile } from "node:fs/promises";

import type { FsWritePort } from "../../app/ports/fs.js";

export function createNodeFsWrite(): FsWritePort {
  return {
    async write(path: string, content: string): Promise<void> {
      await writeFile(path, content, "utf8");
    },
  };
}
