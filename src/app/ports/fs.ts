/**
 * Filesystem read port. The use cases (`compileFile`, `watchAndServe`) take
 * this in their dependency struct and the CLI wires the real chokidar/node
 * adapter from `infra/fs/`. Tests use the colocated `InMemoryFs` fake.
 *
 * Read errors are surfaced by throwing an Error whose `code` field carries
 * a stable identifier the use case can match on. We standardize on `ENOENT`
 * for "file not found" so the real adapter's node-fs errors and the fake's
 * synthetic errors are interchangeable.
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

/** Type guard - the use case checks `err.code` rather than instanceof for portability. */
export function isFileNotFoundError(err: unknown): err is { code: "ENOENT" } {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Filesystem write port. Only the overlay-writing path (`watchAndServe`'s
 * `putOverlay`) needs to write; kept separate from `FsReadPort` so use cases
 * that only read (e.g. `compileFile`) don't have to accept a capability they
 * never call.
 */
export interface FsWritePort {
  write(path: string, content: string): Promise<void>;
}
