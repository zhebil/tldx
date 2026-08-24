/**
 * `watchAndServe`: recompile a `.tldx.jsx` file on every change and push the
 * result over a `TransportPort`.
 *
 * A compile error pushes ONLY `kind: "error"`, never a scene, so the viewer
 * keeps its last-good render behind an error banner. A compile that yields
 * neither a scene nor diagnostics pushes nothing at all.
 *
 * `deps.fsWrite` being present is what enables the overlay round-trip. An
 * absent or malformed overlay is never surfaced as an error push.
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
  /** Optional - presence enables the overlay round-trip. */
  fsWrite?: FsWritePort;
};

export interface WatchAndServeHandle {
  /** Resolves once the initial compile and its transport push have completed. */
  ready: Promise<void>;
  /** Resolves when no compile is in flight. */
  idle(): Promise<void>;
  /** Stop watching and abandon any in-flight compile (its push is still attempted). */
  close(): Promise<void>;
  /**
   * Write an overlay derived from the browser's current canvas snapshot, then
   * push the re-applied scene. No-op if the overlay is disabled (no `fsWrite`)
   * or no compile has completed yet.
   */
  putOverlay(snapshot: SceneJSON): Promise<void>;
}

export function watchAndServe(path: string, deps: WatchAndServeDeps): WatchAndServeHandle {
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
    // Chain onto the previous compile so pushes arrive in trigger order even
    // if the watcher fires mid-compile. `compileFile` surfaces pipeline
    // failures as diagnostics, so anything escaping here is a programmer bug.
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
      // Loop until the queue settles: a compile may be scheduled inside
      // another's tail.
      let prev: Promise<void> | undefined;
      while (prev !== inFlight) {
        prev = inFlight;
        await inFlight.catch(() => undefined);
      }
    },
    close: async () => {
      closed = true;
      // `ready` assigns watchHandle in its first microtask; awaiting it is
      // enough to guarantee the assignment happened.
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
          // The fresh diff cannot distinguish an id a source edit invalidated
          // from an id the user undid back to its base value: both are simply
          // absent from it. `snapshotIds` tells them apart - a previous entry
          // survives the merge only when its id is gone from the snapshot
          // entirely.
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
          // The transport replays its last message to new subscribers, so
          // without this push a browser reload would be served the pre-edit
          // scene and the user's canvas edits would vanish.
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
