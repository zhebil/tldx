/**
 * Domain-side surface for diagnostics. The wire-shape `Diagnostic` lives in
 * `contracts/` so the viewer and the transport envelope can import it without
 * pulling in domain. Domain stages build diagnostics through `error()` /
 * `warning()` here; rendering them is the CLI's job.
 */

import type { Diagnostic, SourceSpan } from "../../contracts/diagnostic.js";

export type { Diagnostic, SourceSpan };

export function error(code: string, message: string, span?: SourceSpan): Diagnostic {
  return span === undefined
    ? { severity: "error", code, message }
    : { severity: "error", code, message, span };
}

export function warning(code: string, message: string, span?: SourceSpan): Diagnostic {
  return span === undefined
    ? { severity: "warning", code, message }
    : { severity: "warning", code, message, span };
}

export function isError(d: Diagnostic): boolean {
  return d.severity === "error";
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some(isError);
}
