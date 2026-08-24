/**
 * Domain-side surface for diagnostics. The wire-shape `Diagnostic` lives in
 * `contracts/` (so the viewer and the transport envelope can import it without
 * pulling in domain). Domain stages (parser/ir/layout/emit) build diagnostics
 * by calling `error()` / `warning()` here so severity stays consistent and
 * codes are the single asserted surface in tests.
 *
 * Formatting is intentionally absent: `cli/format-diagnostics.ts` (tldx-1il)
 * owns the plain-text rendering. Per CONTEXT.md, domain produces the data;
 * cli renders it.
 */

import type {
  Diagnostic,
  DiagnosticSeverity,
  SourceSpan,
} from "../../contracts/diagnostic.js";

export type { Diagnostic, DiagnosticSeverity, SourceSpan };

export function error(
  code: string,
  message: string,
  span?: SourceSpan,
): Diagnostic {
  return span === undefined
    ? { severity: "error", code, message }
    : { severity: "error", code, message, span };
}

export function warning(
  code: string,
  message: string,
  span?: SourceSpan,
): Diagnostic {
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
