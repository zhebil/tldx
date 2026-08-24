/**
 * `FakeWatch` - canonical fake for `WatchPort`. Tests drive change events via
 * `emitChange(path)`.
 */

import type { WatchHandle, WatchListener, WatchPort } from "./watch.js";

interface Subscription {
  paths: Set<string>;
  listener: WatchListener;
  closed: boolean;
}

export class FakeWatch implements WatchPort {
  private readonly subs: Subscription[] = [];

  watch(paths: readonly string[], listener: WatchListener): WatchHandle {
    const sub: Subscription = { paths: new Set(paths), listener, closed: false };
    this.subs.push(sub);
    return {
      update: (next: readonly string[]) => {
        if (sub.closed) return;
        sub.paths = new Set(next);
      },
      close: async () => {
        sub.closed = true;
      },
    };
  }

  /** Drive a change event for everyone watching `path`. */
  emitChange(path: string): void {
    for (const sub of this.subs) {
      if (sub.closed) continue;
      if (!sub.paths.has(path)) continue;
      sub.listener.onChange(path);
    }
  }

  /** Drive a watcher-level error. Subscriptions without `onError` ignore it. */
  emitError(path: string, error: Error): void {
    for (const sub of this.subs) {
      if (sub.closed) continue;
      if (!sub.paths.has(path)) continue;
      sub.listener.onError?.(error);
    }
  }

  /** Active (un-closed) subscriptions watching `path`. */
  activeSubscribers(path: string): number {
    return this.subs.filter((s) => !s.closed && s.paths.has(path)).length;
  }
}
