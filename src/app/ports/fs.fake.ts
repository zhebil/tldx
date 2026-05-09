/**
 * `InMemoryFs` - canonical fake for `FsReadPort`. Used by app integration
 * tests that exercise use cases without touching disk. Real-adapter parity
 * is enforced by `fs.contract.ts`, which both this fake and the chokidar
 * adapter run against.
 */

import { FileNotFoundError, type FsReadPort } from "./fs.js";

export class InMemoryFs implements FsReadPort {
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

  /** Test helper - seed or overwrite a file. */
  setFile(path: string, content: string): void {
    this.files.set(path, content);
  }

  /** Test helper - remove a file (subsequent reads will throw ENOENT). */
  deleteFile(path: string): void {
    this.files.delete(path);
  }

  /** Test helper - inspect what has been seeded. */
  has(path: string): boolean {
    return this.files.has(path);
  }
}
