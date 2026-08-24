/** `CaptureLog` - canonical fake for `LogPort`. Records every event in order. */

import type { LogEvent, LogPort } from "./log.js";

export class CaptureLog implements LogPort {
  /** Every event ever logged, in order. */
  readonly events: LogEvent[] = [];

  log(event: LogEvent): void {
    this.events.push(event);
  }

  byCode(code: string): LogEvent[] {
    return this.events.filter((e) => e.code === code);
  }

  byLevel(level: LogEvent["level"]): LogEvent[] {
    return this.events.filter((e) => e.level === level);
  }
}
