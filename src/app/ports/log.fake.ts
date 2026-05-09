/**
 * `CaptureLog` - canonical fake for `LogPort`. Records every event in order
 * so integration tests can assert on the `code` of the emitted log lines.
 */

import type { LogEvent, LogPort } from "./log.js";

export class CaptureLog implements LogPort {
  /** Every event ever logged, in order. Tests read this directly. */
  readonly events: LogEvent[] = [];

  log(event: LogEvent): void {
    this.events.push(event);
  }

  /** Test helper - filter recorded events by `code`. */
  byCode(code: string): LogEvent[] {
    return this.events.filter((e) => e.code === code);
  }

  /** Test helper - filter by level. */
  byLevel(level: LogEvent["level"]): LogEvent[] {
    return this.events.filter((e) => e.level === level);
  }
}
