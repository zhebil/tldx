/**
 * Real `LogPort` adapter that writes events to stderr in a flat,
 * human-readable form. Use cases (`watchAndServe`) emit structured events
 * here; this adapter is the production sink so users see watcher status
 * lines while `tldsl serve` runs.
 *
 * Format is `[level] code: msg [k=v ...]` - one line per event. The CLI
 * layer treats stdout for primary output (the URL) and stderr for these
 * status lines, mirroring the convention used by `tldsl check` for
 * diagnostics.
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
