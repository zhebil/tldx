/**
 * Wire-shape diagnostic. Lives in contracts/ because both the producer
 * (domain/diagnostics, surfaced through app/) and the consumer (viewer/)
 * need the same shape on the wire. domain/ may extend this internally,
 * but what crosses the transport is exactly this.
 *
 * NB: contracts/ imports nothing - this file declares types only.
 */

export type SourceSpan = {
  /** Path of the source file. Relative to the watch root, not absolute. */
  file: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column number (in code points, not bytes). */
  column: number;
  /** Optional length in code points; absent means "to end of line". */
  length?: number;
};

export type DiagnosticSeverity = "error" | "warning";

/**
 * A single diagnostic. `code` is the stable surface (e.g. "parser/unexpected-token",
 * "ir/missing-id"); `message` is human-readable and may change without notice.
 * Tests assert on `code`, not `message`.
 */
export type Diagnostic = {
  severity: DiagnosticSeverity;
  code: string;
  message: string;
  span?: SourceSpan;
};
