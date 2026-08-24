/**
 * Real `LogPort` adapter: one `[level] code: msg [k=v ...]` line per event on
 * stderr. Stdout is reserved for primary output (the URL), so status lines
 * stay out of anything a caller pipes.
 */

import type { LogEvent, LogPort } from "../../app/ports/log.js";

export interface StderrLogOptions {
  /** Override the underlying writer. Defaults to `process.stderr.write`. */
  write?: (chunk: string) => void;
}

function formatFields(fields: Record<string, unknown> | undefined): string {
  if (fields === undefined) return "";
  const entries = Object.entries(fields);
  if (entries.length === 0) return "";
  const parts = entries.map(([k, v]) => `${k}=${JSON.stringify(v)}`);
  return ` ${parts.join(" ")}`;
}

export function createStderrLog(options: StderrLogOptions = {}): LogPort {
  const write =
    options.write ??
    ((chunk: string): void => {
      process.stderr.write(chunk);
    });
  return {
    log(event: LogEvent): void {
      write(`[${event.level}] ${event.code}: ${event.msg}${formatFields(event.fields)}\n`);
    },
  };
}
