/**
 * Real `WatchPort` adapter on chokidar. Each handle owns one `FSWatcher`.
 * `add` and `unlink` are folded into `change` so the port stays one event
 * wide - the use case re-reads and surfaces any ENOENT as a diagnostic.
 * `update()` diffs against the currently-watched set and only touches the
 * difference. Debouncing is the use case's job, not this adapter's.
 */

import { watch as chokidarWatch, type FSWatcher } from "chokidar";

import type { WatchHandle, WatchListener, WatchPort } from "../../app/ports/watch.js";

export function createChokidarWatch(): WatchPort {
  return {
    watch(paths: readonly string[], listener: WatchListener): WatchHandle {
      const watcher: FSWatcher = chokidarWatch([...paths], {
        ignoreInitial: true,
        persistent: true,
      });
      const watched = new Set(paths);

      watcher.on("change", (changedPath: string) => {
        listener.onChange(changedPath);
      });
      watcher.on("add", (addedPath: string) => {
        listener.onChange(addedPath);
      });
      watcher.on("unlink", (removedPath: string) => {
        listener.onChange(removedPath);
      });
      if (listener.onError !== undefined) {
        const onError = listener.onError.bind(listener);
        watcher.on("error", (err: unknown) => {
          onError(err instanceof Error ? err : new Error(String(err)));
        });
      }

      // Single-flight close: cache the promise so repeated callers observe
      // the same outcome, including a rejection. A `closed` flag would mark
      // the handle closed before the await and swallow a failure there.
      let closing: Promise<void> | undefined;
      return {
        update: (next: readonly string[]) => {
          if (closing !== undefined) return;
          const added = next.filter((p) => !watched.has(p));
          const removed = [...watched].filter((p) => !next.includes(p));
          if (added.length === 0 && removed.length === 0) return;
          if (removed.length > 0) {
            watcher.unwatch(removed);
            for (const p of removed) watched.delete(p);
          }
          if (added.length > 0) {
            watcher.add(added);
            for (const p of added) watched.add(p);
          }
        },
        close: () => (closing ??= watcher.close()),
      };
    },
  };
}
