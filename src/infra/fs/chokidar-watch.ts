/**
 * Real `WatchPort` adapter on top of chokidar. Each handle owns one
 * `FSWatcher` covering the initial path set; `change` events are forwarded
 * to the listener. `add` and `unlink` are folded into change too - the use
 * case re-reads via `FsReadPort` and surfaces any ENOENT as a diagnostic,
 * so the port surface stays narrow (one event).
 *
 * `update()` diffs the requested set against what the watcher currently
 * covers and only unwatches/adds the difference. Chokidar 5 honours
 * `ignoreInitial` for post-ready `add()` too, so a redundant re-add is
 * silent today - the diff is what keeps that from being load-bearing.
 *
 * `awaitWriteFinish` is left off for MVP: editor saves on dev workflows are
 * atomic enough that the extra latency is not worth it. Debounce belongs in
 * the use case layer when `tldx-2lu` lands a clock port.
 */

import { watch as chokidarWatch, type FSWatcher } from "chokidar";

import type {
  WatchHandle,
  WatchListener,
  WatchPort,
} from "../../app/ports/watch.js";

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

      // Single-flight close: cache the underlying close promise so
      // concurrent or repeated callers all observe the same outcome,
      // including a rejection. (A naive `if (closed) return` flag would
      // mark the handle closed *before* awaiting watcher.close(); a failure
      // there would be silently swallowed by every subsequent call.)
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
