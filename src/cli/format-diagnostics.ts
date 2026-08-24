/**
 * Plain-text diagnostic renderer for `tldx check` output and the PostToolUse
 * hook. Output format (one diagnostic per line):
 *
 *   <file>:<line>:<col>: <severity>[<code>]: <message>
 *
 * The location prefix is omitted when a diagnostic has no span. Trailing
 * newline is the caller's job - this returns a bare string so it composes
 * with whatever the entry point writes (stderr, hook output, test buffer).
 *
 * Pure: no process.exit, no console writes. Composition with exit codes
 * happens in the cli entry point that runs the use case.
 */

import type { Diagnostic } from "../domain/diagnostics/index.js";

export function formatDiagnostics(diagnostics: readonly Diagnostic[]): string {
  return diagnostics.map(formatOne).join("\n");
}

function formatOne(d: Diagnostic): string {
  const tail = `${d.severity}[${d.code}]: ${d.message}`;
  if (d.span === undefined) return tail;
  return `${d.span.file}:${d.span.line}:${d.span.column}: ${tail}`;
}
