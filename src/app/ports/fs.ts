/**
 * Filesystem read and write ports.
 *
 * Read errors surface as a thrown Error whose `code` field carries a stable
 * identifier. `ENOENT` is standardised for "file not found" so node-fs errors
 * and the fake's synthetic errors are interchangeable.
 */

export interface FsReadPort {
  /**
   * Read a UTF-8 file. Throws an Error with `code === "ENOENT"` if the file
   * does not exist. Other I/O failures surface with the underlying error code
   * (e.g. `"EACCES"`); the use case maps these to diagnostics.
   */
  read(path: string): Promise<string>;
}

/** Stable error class for "no such file". Both fake and real adapter throw this. */
export class FileNotFoundError extends Error {
  readonly code = "ENOENT" as const;
  constructor(path: string) {
    super(`ENOENT: no such file: ${path}`);
    this.name = "FileNotFoundError";
  }
}

/** Checks `err.code` rather than `instanceof`, so it works across realms. */
export function isFileNotFoundError(err: unknown): err is { code: "ENOENT" } {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "ENOENT";
}

/**
 * Kept separate from `FsReadPort` so use cases that only read don't have to
 * accept a capability they never call.
 */
export interface FsWritePort {
  write(path: string, content: string): Promise<void>;
}
