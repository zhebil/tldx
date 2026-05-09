/**
 * `FakeWatch` - canonical fake for `WatchPort`. Tests drive change events
 * via `emitChange(path)`. The real chokidar adapter is held to the same
 * scenarios in `watch.contract.ts`.
 */

import type { WatchHandle, WatchListener, WatchPort } from "./watch.js";

interface Subscription {
  path: string;
  listener: WatchListener;
  closed: boolean;
}

export class FakeWatch implements WatchPort {
  private readonly subs: Subscription[] = [];

  watch(path: string, listener: WatchListener): WatchHandle {
    const sub: Subscription = { path, listener, closed: false };
    this.subs.push(sub);
    return {
      close: async () => {
        sub.closed = true;
      },
    };
  }

  /** Drive a change event for everyone watching `path`. */
  emitChange(path: string): void {
    for (const sub of this.subs) {
      if (sub.closed) continue;
      if (sub.path !== path) continue;
      sub.listener.onChange(path);
    }
  }

  /** Drive a watcher-level error. Subscriptions without `onError` ignore it. */
  emitError(path: string, error: Error): void {
    for (const sub of this.subs) {
      if (sub.closed) continue;
      if (sub.path !== path) continue;
      sub.listener.onError?.(error);
    }
  }

  /** Test helper - count active (un-closed) subscriptions for `path`. */
  activeSubscribers(path: string): number {
    return this.subs.filter((s) => !s.closed && s.path === path).length;
  }
}
