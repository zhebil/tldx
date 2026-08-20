/**
 * Filesystem watch port. The watcher in `watchAndServe` calls
 * `watch(paths, …)` with the current module-graph input set and recompiles
 * on every change event. After each compile it calls `handle.update(paths)`
 * to re-subscribe to the (possibly changed) input set - re-running a JSX
 * entry can add or drop imports. The real adapter wraps chokidar; the
 * colocated `FakeWatch` lets tests drive events synthetically.
 *
 * Scope for MVP: a single change event signal. Add/unlink are folded into
 * "change" - the use case re-reads via FsReadPort and surfaces any ENOENT
 * as a diagnostic. We do not distinguish event kinds at the port surface
 * because the use case's response is the same: recompile.
 */

export interface WatchHandle {
  /**
   * Replace the watched set with `paths`. Implementations must diff against
   * the currently-watched set and only add/remove what changed - calling
   * `update` with an unchanged set must not itself produce an event. No-op
   * after `close()`.
   */
  update(paths: readonly string[]): void;
  /** Stop watching. Idempotent - calling twice resolves the second time too. */
  close(): Promise<void>;
}

export interface WatchListener {
  /** Fires when a watched path changes. The argument is the absolute path that changed. */
  onChange(path: string): void;
  /** Optional: fires on watcher-level errors (permissions, EMFILE, etc.). */
  onError?(error: Error): void;
}

export interface WatchPort {
  /**
   * Begin watching every path in `paths`. The returned handle stops the
   * watcher when closed and supports re-subscription via `update()`.
   * Implementations must defer the first event until after they are
   * "ready" - tests rely on `watch()` not delivering a spurious event for
   * a file's pre-existing state.
   */
  watch(paths: readonly string[], listener: WatchListener): WatchHandle;
}
