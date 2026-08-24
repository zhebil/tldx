/** `InMemoryFs` - canonical fake for `FsReadPort` and `FsWritePort`. */

import { FileNotFoundError, type FsReadPort, type FsWritePort } from "./fs.js";

export class InMemoryFs implements FsReadPort, FsWritePort {
  private readonly files = new Map<string, string>();

  constructor(initial?: Record<string, string>) {
    if (initial !== undefined) {
      for (const [path, content] of Object.entries(initial)) {
        this.files.set(path, content);
      }
    }
  }

  async read(path: string): Promise<string> {
    const content = this.files.get(path);
    if (content === undefined) throw new FileNotFoundError(path);
    return content;
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  setFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  /** Subsequent reads of `path` throw ENOENT. */
  deleteFile(path: string): void {
    this.files.delete(path);
  }

  has(path: string): boolean {
    return this.files.has(path);
  }
}
