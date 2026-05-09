/**
 * Real `WatchPort` adapter on top of chokidar. We watch a single path and
 * forward `change` events to the listener. `add` and `unlink` are folded
 * into change too - the use case re-reads via `FsReadPort` and surfaces
 * any ENOENT as a diagnostic, so the port surface stays narrow (one event).
 *
 * `awaitWriteFinish` is left off for MVP: editor saves on dev workflows are
 * atomic enough that the extra latency is not worth it. Debounce belongs in
 * the use case layer when `tldsl-2lu` lands a clock port.
 */

import { watch as chokidarWatch, type FSWatcher } from "chokidar";

import type {
  WatchHandle,
  WatchListener,
  WatchPort,
} from "../../app/ports/watch.js";

export function createChokidarWatch(): WatchPort {
  return {
    watch(path: string, listener: WatchListener): WatchHandle {
      const watcher: FSWatcher = chokidarWatch(path, {
        ignoreInitial: true,
        persistent: true,
      });

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
        close: () => (closing ??= watcher.close()),
      };
    },
  };
}
