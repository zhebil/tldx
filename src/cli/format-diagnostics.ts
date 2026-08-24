/**
 * Plain-text diagnostic renderer. One diagnostic per line:
 *
 *   <file>:<line>:<col>: <severity>[<code>]: <message>
 *
 * The location prefix is dropped when a diagnostic has no span. No trailing
 * newline - that is the caller's job.
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
