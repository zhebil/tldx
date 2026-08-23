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
 *
 * Overlay round-trip (docs/round-trip.md D1, D2, D4). `deps.fsWrite` being
 * present is what turns the overlay on; every existing test constructs
 * `WatchAndServeDeps` without it, so this stays a no-op addition for them.
 * When enabled:
 * - every compile reads `overlayPathFor(path)` and, if present and valid,
 *   pushes `applyOverlay(overlay, scene).scene` instead of the raw compiled
 *   scene; an absent, unparsable, or malformed overlay pushes the compiled
 *   scene unchanged (never surfaced as a `kind: "error"` push - ADR-13
 *   reserves that for compile failures, not overlay problems);
 * - the last clean *compiled* (pre-overlay) scene is kept in a closure
 *   variable, because `putOverlay` diffs against the compile, not against
 *   whatever was last rendered;
 * - `putOverlay` is chained onto the same `inFlight` promise queue as
 *   compiles, so a recompile landing mid-write can't interleave with it.
 * - `putOverlay` merges the fresh browser diff onto the on-disk overlay
 *   (`mergeOverlayEntries`) rather than overwriting it - a source edit that
 *   invalidates an entry's id must not delete it just because the fresh
 *   diff has nothing to say about it (tldsl-j3q). But an id the browser's
 *   snapshot *does* still have, whose canvas value is simply back to
 *   matching base, is not that case - `mergeOverlayEntries` is given the
 *   snapshot's id set precisely so it can tell the two apart and let a
 *   canvas edit that undoes an entry back to its source value actually
 *   remove it (tldsl-z2j half 2), instead of leaving a stale entry the
 *   server keeps re-applying.
 */

import { sceneMessage } from "../contracts/builders.js";
import { isOverlay, OVERLAY_VERSION } from "../contracts/overlay.js";
import type { SceneJSON } from "../contracts/scene-json.js";
import {
  applyOverlay,
  diffScenes,
  mergeOverlayEntries,
  overlayPathFor,
  sceneHash,
} from "../domain/overlay/index.js";

import { readOverlay } from "./absorb.js";
import { compileFile, type CompileFileResult } from "./compile-file.js";
import type { ExecutePort } from "./ports/execute.js";
import { isFileNotFoundError, type FsReadPort, type FsWritePort } from "./ports/fs.js";
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
  /** Optional - presence enables the overlay round-trip (D4). */
  fsWrite?: FsWritePort;
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
  /**
   * Write an overlay derived from the browser's current canvas snapshot,
   * then push the re-applied scene so the transport's last-message replay
   * (`app/ports/transport.ts`) serves the edited render to a reloading
   * browser, not the pre-edit compile. No-op if the overlay is disabled
   * (no `fsWrite`) or no compile has completed yet.
   */
  putOverlay(snapshot: SceneJSON): Promise<void>;
}

export function watchAndServe(
  path: string,
  deps: WatchAndServeDeps,
): WatchAndServeHandle {
  let inFlight: Promise<void> = Promise.resolve();
  let closed = false;
  let lastCompiled: SceneJSON | null = null;
  const overlayPath = overlayPathFor(path);

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
    if (result.sceneJson !== null) lastCompiled = result.sceneJson;
    await pushResult(deps, trigger, result, overlayPath);
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
    putOverlay: async (snapshot: SceneJSON): Promise<void> => {
      const fsWrite = deps.fsWrite;
      if (fsWrite === undefined) return;
      const task = inFlight
        .catch(() => undefined)
        .then(async () => {
          if (lastCompiled === null) return;
          const fresh = diffScenes(lastCompiled, snapshot);
          // The fresh diff only knows the two scenes it was given - an id a
          // source edit invalidated (its record no longer exists in
          // `lastCompiled`) is silently absent from it, not marked
          // `deleted`, exactly like an id the user undid back to its base
          // value. `snapshotIds` is what tells those two apart: merging
          // onto the on-disk overlay keeps a previous entry only when its
          // id is absent from the snapshot entirely (tldsl-j3q); an id
          // still present in the snapshot but unchanged from base has its
          // entry dropped (tldsl-z2j half 2), so undoing a canvas edit back
          // to the source position actually clears the overlay for it.
          const previous = await readOverlay(deps.fs, overlayPath);
          const snapshotIds = new Set(Object.keys(snapshot.store));
          const { entries, preserved } = mergeOverlayEntries(
            previous?.entries ?? {},
            fresh,
            snapshotIds,
          );
          if (preserved.length > 0) {
            deps.log.log({
              level: "warn",
              code: "overlay/preserved",
              msg: `kept ${preserved.length} overlay ${preserved.length === 1 ? "entry" : "entries"} not reflected in the current canvas (a source edit likely changed their ids): ${preserved.join(", ")}`,
              fields: { ids: preserved },
            });
          }
          const overlay = { v: OVERLAY_VERSION, basedOn: sceneHash(lastCompiled), entries };
          await fsWrite.write(overlayPath, `${JSON.stringify(overlay, null, 2)}\n`);
          // The SSE transport replays its last message to new subscribers
          // (`app/ports/transport.ts` "Last-message replay"). Without this
          // push, a browser reload would be served the pre-edit scene and
          // the user's canvas edits would vanish - the exact thing this
          // task exists to prevent. `serve` still does not *watch* the
          // overlay file (round-trip.md D4); this push tells the transport
          // what the current render is, it is not a watcher.
          deps.transport.push(sceneMessage.scene(applyOverlay(overlay, lastCompiled).scene));
        });
      inFlight = task.catch((err: unknown) => {
        deps.log.log({
          level: "error",
          code: "watch/internal-error",
          msg: err instanceof Error ? err.message : String(err),
        });
      });
      await task;
    },
  };
}

async function pushResult(
  deps: WatchAndServeDeps,
  trigger: "initial" | "change",
  result: CompileFileResult,
  overlayPath: string,
): Promise<void> {
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

  const scene = await resolveOverlaidScene(deps, result.sceneJson, overlayPath);
  deps.transport.push(sceneMessage.scene(scene));
  deps.log.log({
    level: "info",
    code: "watch/recompile-ok",
    msg: `compiled ok (${trigger})`,
    fields: { trigger },
  });
}

async function resolveOverlaidScene(
  deps: WatchAndServeDeps,
  scene: SceneJSON,
  overlayPath: string,
): Promise<SceneJSON> {
  if (deps.fsWrite === undefined) return scene;

  let raw: string;
  try {
    raw = await deps.fs.read(overlayPath);
  } catch (err) {
    if (isFileNotFoundError(err)) return scene;
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    deps.log.log({
      level: "warn",
      code: "overlay/invalid",
      msg: `overlay at ${overlayPath} is not valid JSON`,
    });
    return scene;
  }
  if (!isOverlay(parsed)) {
    deps.log.log({
      level: "warn",
      code: "overlay/invalid",
      msg: `overlay at ${overlayPath} does not match the Overlay shape`,
    });
    return scene;
  }

  const { scene: applied, diagnostics } = applyOverlay(parsed, scene);
  for (const diagnostic of diagnostics) {
    deps.log.log({
      level: "warn",
      code: "overlay/diagnostic",
      msg: diagnostic.message,
      fields: { overlayCode: diagnostic.code },
    });
  }
  return applied;
}
