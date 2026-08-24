/**
 * Filesystem watch port. `update(paths)` re-subscribes to a changed input set,
 * since re-running a JSX entry can add or drop imports.
 *
 * There is one event signal: add and unlink are folded into `onChange`,
 * because the consumer's response to all three is the same - recompile, and
 * let `FsReadPort` surface a now-missing file as a diagnostic.
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
  /** The argument is the absolute path that changed. */
  onChange(path: string): void;
  /** Watcher-level errors (permissions, EMFILE, etc.). */
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
