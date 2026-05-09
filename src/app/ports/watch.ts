/**
 * Filesystem watch port. The watcher in `watchAndServe` calls `watch(path, …)`
 * and recompiles on every change event. The real adapter wraps chokidar; the
 * colocated `FakeWatch` lets tests drive events synthetically.
 *
 * Scope for MVP: a single change event signal. Add/unlink are folded into
 * "change" - the use case re-reads via FsReadPort and surfaces any ENOENT
 * as a diagnostic. We do not distinguish event kinds at the port surface
 * because the use case's response is the same: recompile.
 */

export interface WatchHandle {
  /** Stop watching. Idempotent - calling twice resolves the second time too. */
  close(): Promise<void>;
}

export interface WatchListener {
  /** Fires when the watched path changes. The argument is the absolute path that changed. */
  onChange(path: string): void;
  /** Optional: fires on watcher-level errors (permissions, EMFILE, etc.). */
  onError?(error: Error): void;
}

export interface WatchPort {
  /**
   * Begin watching `path` (a single file). The returned handle stops the
   * watcher when closed. Implementations must defer the first event until
   * after they are "ready" - tests rely on `watch()` not delivering a
   * spurious event for the file's pre-existing state.
   */
  watch(path: string, listener: WatchListener): WatchHandle;
}
