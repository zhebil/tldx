/**
 * Real `FsReadPort` adapter on top of node:fs/promises. Translates node's
 * ENOENT into our typed `FileNotFoundError` so the use case sees the same
 * `code === "ENOENT"` shape it sees from the fake. Other I/O errors pass
 * through unchanged - their `.code` field is the OS-level identifier.
 */

import { readFile } from "node:fs/promises";

import { FileNotFoundError, type FsReadPort } from "../../app/ports/fs.js";

export function createNodeFsRead(): FsReadPort {
  return {
    async read(path: string): Promise<string> {
      try {
        return await readFile(path, "utf8");
      } catch (err) {
        if (isErrnoException(err) && err.code === "ENOENT") {
          throw new FileNotFoundError(path);
        }
        throw err;
      }
    },
  };
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { code?: unknown }).code === "string"
  );
}
