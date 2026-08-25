/**
 * `absorb`: fold a diagram's overlay back into its JSX source.
 *
 * Guardrails run before any write: a dirty git file refuses without `--force`,
 * and a file outside a repo gets a `.bak` of the original first. The overlay
 * file is rewritten last, only once the rewritten source recompiles into the
 * scene the canvas showed; on any mismatch the source is restored and the
 * overlay left untouched.
 *
 * Never prints, never exits - `cli/absorb.ts` owns stdio and the exit code.
 */

import {
  OVERLAY_VERSION,
  emptyOverlay,
  isOverlay,
  type Overlay,
  type OverlayEntry,
  type OverlayPlacement,
} from "../contracts/overlay.js";
import type { SceneJSON, TLRecord } from "../contracts/scene-json.js";
import {
  absorbAdded,
  patchGapAttr,
  planMoveCandidates,
  spliceReorder,
} from "../domain/absorb/index.js";
import { hasErrors, type Diagnostic } from "../domain/diagnostics/index.js";
import { emit } from "../domain/emit/index.js";
import { lower, type IRDoc, type IRDocPositioned } from "../domain/ir/index.js";
import { applyOverlay, deepEqual, overlayPathFor, sceneHash } from "../domain/overlay/index.js";
import type { LayoutPort } from "../domain/ports/layout.js";

import { compileFile, type CompileFileDeps } from "./compile-file.js";
import { isFileNotFoundError, type FsReadPort, type FsWritePort } from "./ports/fs.js";
import type { ExecutePort } from "./ports/execute.js";

export type GitStatus = "clean" | "dirty" | "no-repo";

export type AbsorbDeps = {
  fs: FsReadPort;
  fsWrite: FsWritePort;
  layout: LayoutPort;
  execute: ExecutePort;
  /** Optional - absent is treated the same as `"no-repo"`. */
  gitStatus?: (path: string) => Promise<GitStatus>;
};

export type AbsorbArgs = {
  path: string;
  force?: boolean;
};

export type AbsorbResult =
  | { status: "nothing"; message: string; backupPath?: string }
  | { status: "compile-error"; diagnostics: Diagnostic[]; backupPath?: string }
  | { status: "refused-dirty"; message: string; backupPath?: string }
  | { status: "codegen-error"; message: string; backupPath?: string }
  | {
      status: "verify-failed";
      diverging: string[];
      diagnostics?: Diagnostic[];
      backupPath?: string;
    }
  | {
      status: "absorbed";
      absorbedIds: string[];
      residualCount: number;
      backupPath?: string;
      /** One line per `moved` entry the ladder looked at but couldn't
       *  absorb, naming the element and the reason. Empty when there was
       *  nothing to explain. Printed by `cli/absorb.ts`. */
      moveNotes?: string[];
    };

const BACKUP_SUFFIX = ".bak";

/** `exactOptionalPropertyTypes` rejects `backupPath: undefined` - spread it
 *  in only when a backup was actually written. */
function withBackup<T extends Record<string, unknown>>(
  result: T,
  backupPath: string | undefined,
): T {
  return backupPath === undefined ? result : { ...result, backupPath };
}

export async function runAbsorb(args: AbsorbArgs, deps: AbsorbDeps): Promise<AbsorbResult> {
  const { path, force = false } = args;
  const compileDeps: CompileFileDeps = { fs: deps.fs, layout: deps.layout, execute: deps.execute };
  const overlayPath = overlayPathFor(path);

  const overlay = await readOverlay(deps.fs, overlayPath);
  if (overlay === null) {
    return { status: "nothing", message: `nothing to absorb: no overlay at ${overlayPath}` };
  }
  if (Object.keys(overlay.entries).length === 0) {
    return { status: "nothing", message: `nothing to absorb: overlay at ${overlayPath} is empty` };
  }

  const compiled = await compileFile(path, compileDeps);
  if (compiled.sceneJson === null) {
    return { status: "compile-error", diagnostics: compiled.diagnostics };
  }
  const base = compiled.sceneJson;
  const target = applyOverlay(overlay, base).scene;

  const { absorbable, residual } = partition(overlay);
  const movedCandidates = residual.filter(
    (e): e is [string, OverlayEntry & { moved: OverlayPlacement }] => e[1].moved !== undefined,
  );
  if (absorbable.length === 0 && movedCandidates.length === 0) {
    return {
      status: "nothing",
      message:
        "nothing absorb can express yet: every overlay entry is a restyled/relabelled/rebound/deleted op, or an added shape absorb doesn't handle (only added geo/note shapes are absorbable)",
    };
  }

  const source = await deps.fs.read(path);
  const genResult = absorbAdded(
    source,
    absorbable.map(([, entry]) => entry.added),
  );
  if ("error" in genResult) {
    return { status: "codegen-error", message: genResult.error };
  }

  const moveResult = await runMoveLadder(
    genResult.source,
    path,
    base,
    target,
    movedCandidates,
    deps,
  );

  const gitStatus = deps.gitStatus === undefined ? "no-repo" : await deps.gitStatus(path);
  if (gitStatus === "dirty" && !force) {
    return {
      status: "refused-dirty",
      message: `refusing to write ${path}: it has uncommitted changes (rerun with --force to override)`,
    };
  }
  let backupPath: string | undefined;
  if (gitStatus === "no-repo") {
    backupPath = `${path}${BACKUP_SUFFIX}`;
    await deps.fsWrite.write(backupPath, source);
  }

  await deps.fsWrite.write(path, moveResult.source);

  const recompiled = await compileFile(path, compileDeps);
  if (recompiled.sceneJson === null) {
    await deps.fsWrite.write(path, source);
    return withBackup(
      {
        status: "verify-failed" as const,
        diverging: [] as string[],
        diagnostics: recompiled.diagnostics,
      },
      backupPath,
    );
  }

  const absorbedMoveIds = new Set(moveResult.absorbedIds);
  const residualEntries: Record<string, OverlayEntry> = {};
  for (const [id, entry] of residual) {
    if (!absorbedMoveIds.has(id)) {
      residualEntries[id] = entry;
      continue;
    }
    const rest = Object.fromEntries(
      Object.entries(entry).filter(([key]) => key !== "moved"),
    ) as OverlayEntry;
    if (Object.keys(rest).length > 0) residualEntries[id] = rest;
  }
  const residualOverlay: Overlay =
    Object.keys(residualEntries).length === 0
      ? emptyOverlay(sceneHash(recompiled.sceneJson))
      : { v: OVERLAY_VERSION, basedOn: sceneHash(recompiled.sceneJson), entries: residualEntries };
  const result = applyOverlay(residualOverlay, recompiled.sceneJson).scene;

  const diverging = diffIds(target, result);
  if (diverging.length > 0) {
    await deps.fsWrite.write(path, source);
    return withBackup({ status: "verify-failed" as const, diverging }, backupPath);
  }

  await deps.fsWrite.write(overlayPath, `${JSON.stringify(residualOverlay, null, 2)}\n`);
  return withBackup(
    {
      status: "absorbed" as const,
      absorbedIds: [...absorbable.map(([id]) => id), ...moveResult.absorbedIds],
      residualCount: Object.keys(residualEntries).length,
      ...(moveResult.notes.length > 0 ? { moveNotes: moveResult.notes } : {}),
    },
    backupPath,
  );
}

/**
 * For each `moved` entry, try to express it as a JSX reorder or `gap` change
 * instead of a raw coordinate. Candidates are compiled in memory (no disk
 * I/O) and compared against `target`; the first that matches wins and becomes
 * the baseline for the next entry.
 *
 * Runs to a fixed point, not a single pass: absorbing one entry as a reorder
 * can reposition its siblings, satisfying their entries for free regardless
 * of processing order. A pass that resolves nothing ends it.
 *
 * Never writes to `path` - `runAbsorb` does the single write.
 */
async function runMoveLadder(
  startSource: string,
  path: string,
  base: SceneJSON,
  target: SceneJSON,
  movedEntries: readonly [string, OverlayEntry & { moved: OverlayPlacement }][],
  deps: AbsorbDeps,
): Promise<{ source: string; absorbedIds: string[]; notes: string[] }> {
  let current = startSource;
  const absorbedIds: string[] = [];
  let pending: [string, OverlayEntry & { moved: OverlayPlacement }][] = [...movedEntries];

  for (;;) {
    const stillPending: [string, OverlayEntry & { moved: OverlayPlacement }][] = [];
    let progress = false;

    for (const [id, entry] of pending) {
      const resolved = await resolveOneMove(current, path, base, target, id, entry.moved, deps);
      if (resolved === null) {
        stillPending.push([id, entry]);
        continue;
      }
      if (resolved.source !== undefined) current = resolved.source;
      absorbedIds.push(id);
      progress = true;
    }

    pending = stillPending;
    if (!progress || pending.length === 0) break;
  }

  const notes = await Promise.all(
    pending.map(
      async ([id, entry]) =>
        `${id}: ${await explainUnabsorbable(current, path, base, id, entry.moved, deps)}`,
    ),
  );

  return { source: current, absorbedIds, notes };
}

/**
 * One `moved` entry against the current source. `null` means "couldn't
 * resolve it this pass"; `{ source }` means an edit won; `{}` means it was
 * already satisfied and nothing needs to change.
 */
async function resolveOneMove(
  current: string,
  path: string,
  base: SceneJSON,
  target: SceneJSON,
  id: string,
  placement: OverlayPlacement,
  deps: AbsorbDeps,
): Promise<{ source?: string } | null> {
  const baseRecord = base.store[id];
  if (baseRecord === undefined) return null;

  const compiled = await compileIR(current, path, deps);
  if (compiled === null) return null;
  const currentScene = safeEmit(compiled.positioned);
  if (currentScene !== null && positionsMatch(currentScene, target, [id])) {
    return {};
  }

  const plan = planMoveCandidates(compiled.ir, compiled.positioned, id, placement, {
    x: baseRecord.x as number,
    y: baseRecord.y as number,
  });
  if ("reason" in plan) return null;

  for (const candidate of plan.candidates) {
    const edited =
      candidate.rung === "reorder"
        ? spliceReorder(current, candidate.siblingSpans, candidate.draggedIndex, candidate.toIndex)
        : patchGapAttr(current, candidate.containerSpan, candidate.attr, candidate.value);
    if ("error" in edited) continue;

    const candidateScene = await compileScene(edited.source, path, deps);
    if (candidateScene !== null && positionsMatch(candidateScene, target, candidate.affectedIds)) {
      return { source: edited.source };
    }
  }
  return null;
}

/** Re-derives why `resolveOneMove` gave up, for the human-facing note - kept
 *  separate so the hot path above doesn't build strings it may not need. */
async function explainUnabsorbable(
  current: string,
  path: string,
  base: SceneJSON,
  id: string,
  placement: OverlayPlacement,
  deps: AbsorbDeps,
): Promise<string> {
  const baseRecord = base.store[id];
  if (baseRecord === undefined)
    return "no such record in the base scene - can't plan a move for it";
  const compiled = await compileIR(current, path, deps);
  if (compiled === null) return "current source failed to compile while planning its move";
  const plan = planMoveCandidates(compiled.ir, compiled.positioned, id, placement, {
    x: baseRecord.x as number,
    y: baseRecord.y as number,
  });
  if ("reason" in plan) return plan.reason;
  return "no reorder or gap candidate reproduced the render";
}

function safeEmit(positioned: IRDocPositioned): SceneJSON | null {
  try {
    return emit(positioned);
  } catch {
    return null;
  }
}

async function compileIR(
  source: string,
  path: string,
  deps: AbsorbDeps,
): Promise<{ ir: IRDoc; positioned: IRDocPositioned } | null> {
  try {
    const executed = await deps.execute.execute(source, path);
    if ("diagnostics" in executed) return null;
    const { ir, diagnostics } = lower(executed.ast);
    if (ir === null || hasErrors(diagnostics)) return null;
    const positioned = await deps.layout.layout(ir);
    return { ir, positioned };
  } catch {
    return null;
  }
}

async function compileScene(
  source: string,
  path: string,
  deps: AbsorbDeps,
): Promise<SceneJSON | null> {
  const compiled = await compileIR(source, path, deps);
  if (compiled === null) return null;
  return safeEmit(compiled.positioned);
}

/** Position-relevant fields only (x, y, parentId, props.w/h). `index` is
 *  never compared: a reorder legitimately changes emit order. */
function positionsMatch(candidate: SceneJSON, target: SceneJSON, ids: readonly string[]): boolean {
  return ids.every((id) => {
    const a = candidate.store[id];
    const t = target.store[id];
    if (a === undefined || t === undefined) return false;
    if (a.x !== t.x || a.y !== t.y || a.parentId !== t.parentId) return false;
    const ap = (a.props as Record<string, unknown> | undefined) ?? {};
    const tp = (t.props as Record<string, unknown> | undefined) ?? {};
    return ap.w === tp.w && ap.h === tp.h;
  });
}

/** Missing file, unparseable JSON and wrong shape all return null. */
export async function readOverlay(fs: FsReadPort, overlayPath: string): Promise<Overlay | null> {
  let raw: string;
  try {
    raw = await fs.read(overlayPath);
  } catch (err) {
    if (isFileNotFoundError(err)) return null;
    throw err;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isOverlay(parsed) ? parsed : null;
}

function isAbsorbableEntry(entry: OverlayEntry): entry is { added: TLRecord } {
  const keys = Object.keys(entry);
  if (keys.length !== 1 || keys[0] !== "added") return false;
  const record = entry.added;
  return (
    record !== undefined &&
    record.typeName === "shape" &&
    (record.type === "geo" || record.type === "note")
  );
}

function partition(overlay: Overlay): {
  absorbable: [string, OverlayEntry & { added: TLRecord }][];
  residual: [string, OverlayEntry][];
} {
  const absorbable: [string, OverlayEntry & { added: TLRecord }][] = [];
  const residual: [string, OverlayEntry][] = [];
  for (const [id, entry] of Object.entries(overlay.entries)) {
    if (isAbsorbableEntry(entry)) {
      absorbable.push([id, entry]);
    } else {
      residual.push([id, entry]);
    }
  }
  return { absorbable, residual };
}

/** `index` never factors into the divergence check: emit hands out indices in
 *  JSX order, so a reorder the move ladder absorbs necessarily reassigns them
 *  for the whole container. Comparing it would make every successful reorder
 *  look like a failed verification. */
function withoutIndex(record: TLRecord): TLRecord {
  if (!("index" in record)) return record;
  return Object.fromEntries(Object.entries(record).filter(([key]) => key !== "index")) as TLRecord;
}

function diffIds(expected: SceneJSON, actual: SceneJSON): string[] {
  const ids = new Set([...Object.keys(expected.store), ...Object.keys(actual.store)]);
  const diverging: string[] = [];
  for (const id of ids) {
    const e = expected.store[id];
    const a = actual.store[id];
    if (e === undefined) diverging.push(`${id} (unexpected)`);
    else if (a === undefined) diverging.push(`${id} (missing)`);
    else if (!deepEqual(withoutIndex(e), withoutIndex(a))) diverging.push(`${id} (differs)`);
  }
  return diverging;
}
