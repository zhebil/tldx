/**
 * Log port: a level, a stable `code`, and free-form fields. Tests assert on
 * `code`, never on `msg` text. No formatting decisions live here - the
 * adapter picks stream, encoding and colour.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEvent {
  level: LogLevel;
  code: string;
  msg: string;
  fields?: Record<string, unknown>;
}

export interface LogPort {
  log(event: LogEvent): void;
}
