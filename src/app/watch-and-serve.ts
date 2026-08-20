/**
 * `watchAndServe`: subscribe to a `.tldsl.jsx` file, recompile on every change,
 * and push the result over a `TransportPort` so the viewer renders it.
 *
 * Per ADR-13 (and CONTEXT.md "Scene message contract" → "On compile error"):
 * - On a clean compile, push `{ v: 1, kind: "scene", payload }`.
 * - On a compile error with diagnostics, push ONLY
 *   `{ v: 1, kind: "error", payload }` - no scene. The viewer keeps its
 *   last-good `scene` rendered with an error banner. The next clean compile
 *   clears it by pushing a fresh `scene`.
 * - If the pipeline returns no scene and no diagnostics (for example, a
 *   watcher observed a truncate-before-rewrite), suppress the push and wait
 *   for a later change event.
 *
 * The use case is a thin orchestration layer: it delegates the pure pipeline
 * to `compileFile` (execute → ir → layout → emit) and is responsible only for
 * wiring the watcher event to a transport push and emitting structured logs
 * for observability.
 *
 * After every compile, the watch subscription is re-synced to
 * `result.inputs` (the module graph the compile actually touched) via
 * `watchHandle.update()`, so imports added or dropped by a JSX entry are
 * picked up. A failed compile with unknown inputs (`null`) leaves the
 * existing watch set untouched rather than dropping it.
 */

import { sceneMessage } from "../contracts/builders.js";

import { compileFile, type CompileFileResult } from "./compile-file.js";
import type { ExecutePort } from "./ports/execute.js";
import type { FsReadPort } from "./ports/fs.js";
import type { LogPort } from "./ports/log.js";
import type { TransportPort } from "./ports/transport.js";
import type { WatchHandle, WatchPort } from "./ports/watch.js";
import type { LayoutPort } from "../domain/ports/layout.js";

export type WatchAndServeDeps = {
  watch: WatchPort;
  fs: FsReadPort;
  layout: LayoutPort;
  execute: ExecutePort;
  transport: TransportPort;
  log: LogPort;
};

export interface WatchAndServeHandle {
  /**
   * Resolves once the initial compile + transport push has completed. Tests
   * await this before driving subsequent change events; the CLI awaits it
   * before signalling "viewer ready" to the user.
   */
  ready: Promise<void>;
  /**
   * Resolves when no compile is in flight. Tests use this to deterministically
   * sync with the use case after driving `FakeWatch.emitChange`.
   */
  idle(): Promise<void>;
  /** Stop watching and abandon any in-flight compile (its push is still attempted). */
  close(): Promise<void>;
}

export function watchAndServe(
  path: string,
  deps: WatchAndServeDeps,
): WatchAndServeHandle {
  let inFlight: Promise<void> = Promise.resolve();
  let closed = false;

  const compileAndPush = async (trigger: "initial" | "change"): Promise<void> => {
    const result = await compileFile(path, {
      fs: deps.fs,
      layout: deps.layout,
      execute: deps.execute,
    });
    if (closed) return;
    if (result.inputs !== null) {
      watchHandle?.update(result.inputs);
    }
    pushResult(deps, trigger, result);
  };

  const schedule = (trigger: "initial" | "change"): void => {
    // Chain onto the previous compile so emits arrive in trigger order even
    // if the watcher fires while a compile is still running. Errors inside
    // the pipeline are surfaced as diagnostics by `compileFile`; anything
    // that escapes here is a programmer bug, so log + swallow.
    inFlight = inFlight
      .catch(() => undefined)
      .then(() => compileAndPush(trigger))
      .catch((err: unknown) => {
        deps.log.log({
          level: "error",
          code: "watch/internal-error",
          msg: err instanceof Error ? err.message : String(err),
        });
      });
  };

  let watchHandle: WatchHandle | undefined;
  const ready = (async (): Promise<void> => {
    watchHandle = deps.watch.watch([path], {
      onChange: () => {
        if (closed) return;
        schedule("change");
      },
      onError: (err) => {
        deps.log.log({
          level: "error",
          code: "watch/watcher-error",
          msg: err.message,
        });
      },
    });
    schedule("initial");
    await inFlight;
  })();

  return {
    ready,
    idle: async () => {
      // Wait until the queue settles. A compile scheduled inside another's
      // tail is rare here (no recursive scheduling), but loop defensively.
      let prev: Promise<void> | undefined;
      while (prev !== inFlight) {
        prev = inFlight;
        await inFlight.catch(() => undefined);
      }
    },
    close: async () => {
      closed = true;
      // `ready` always assigns watchHandle synchronously inside its first
      // microtask; awaiting it is enough to ensure assignment.
      await ready.catch(() => undefined);
      await watchHandle?.close();
    },
  };
}

function pushResult(
  deps: WatchAndServeDeps,
  trigger: "initial" | "change",
  result: CompileFileResult,
): void {
  if (result.sceneJson === null) {
    if (result.diagnostics.length > 0) {
      deps.transport.push(sceneMessage.error(result.diagnostics));
      deps.log.log({
        level: "warn",
        code: "watch/recompile-error",
        msg: `compile failed (${trigger}): ${result.diagnostics.length} diagnostic(s)`,
        fields: { trigger, diagnosticCount: result.diagnostics.length },
      });
    }
    return;
  }
  deps.transport.push(sceneMessage.scene(result.sceneJson));
  deps.log.log({
    level: "info",
    code: "watch/recompile-ok",
    msg: `compiled ok (${trigger})`,
    fields: { trigger },
  });
}
