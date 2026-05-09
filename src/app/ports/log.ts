/**
 * Log port. Use cases (`watchAndServe` in particular) emit structured events
 * here so the CLI can print them to stderr and tests can inspect them. The
 * surface is intentionally narrow: a level + stable code + free-form fields.
 *
 * `code` is the test-stable identifier (e.g. `watch/recompile-ok`,
 * `watch/recompile-error`). Tests assert on `code`, not on `msg` text -
 * mirroring the diagnostics convention in `contracts/diagnostic.ts`.
 *
 * No formatting decisions live here: the real adapter in `infra/log/` is the
 * one that decides stdout vs stderr, JSON vs human, colour vs plain. The
 * colocated `CaptureLog` records every event in order for assertions.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEvent {
  level: LogLevel;
  /** Stable identifier - asserted in tests. */
  code: string;
  /** Human-readable message; may change without breaking tests. */
  msg: string;
  /** Optional structured fields for richer log lines. */
  fields?: Record<string, unknown>;
}

export interface LogPort {
  log(event: LogEvent): void;
}
