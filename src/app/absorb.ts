/**
 * `absorb`: fold a diagram's overlay back into its JSX source
 * (docs/round-trip.md D3, D5; docs/plan.md T22).
 *
 * 1. Read overlay + compile the source (`base`); `target = applyOverlay(overlay,
 *    base).scene` is "the scene the canvas showed".
 * 2. Partition overlay entries into absorbable (bare `added` geo/note shapes)
 *    and residual (everything else - moved/restyled/relabelled/deleted, added
 *    arrows/bindings/other shape kinds). Residual entries are never touched.
 * 3. Generate JSX for the absorbable records (`domain/absorb/codegen.ts`) and
 *    splice them into the source as children of the root `<Doc>`.
 * 4. Guardrail (D5) before any write: a dirty git file refuses without
 *    `--force`; a file outside a repo (or no `gitStatus` at all) gets a
 *    `.bak` of the original written first.
 * 5. Write the rewrite, recompile, apply the residual overlay to the fresh
 *    compile, and verify the result deep-equals `target`. Only on a match is
 *    the residual overlay written to disk - the only destructive step, and
 *    it happens last (D5). On any mismatch the original source is restored
 *    and the overlay file is left untouched.
 *
 * Never prints, never exits - `cli/absorb.ts` owns stdio and the exit code.
 */

import {
  OVERLAY_VERSION,
  emptyOverlay,
  isOverlay,
  type Overlay,
  type OverlayEntry,
} from "../contracts/overlay.js";
import type { SceneJSON, TLRecord } from "../contracts/scene-json.js";
import { absorbAdded } from "../domain/absorb/index.js";
import type { Diagnostic } from "../domain/diagnostics/index.js";
import {
  applyOverlay,
  deepEqual,
  overlayPathFor,
  sceneHash,
} from "../domain/overlay/index.js";
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
  /** Optional - absent is treated the same as `"no-repo"` (D5). */
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
  | { status: "verify-failed"; diverging: string[]; diagnostics?: Diagnostic[]; backupPath?: string }
  | {
      status: "absorbed";
      absorbedIds: string[];
      residualCount: number;
      backupPath?: string;
    };

const BACKUP_SUFFIX = ".bak";

/** `exactOptionalPropertyTypes` rejects `backupPath: undefined` - spread it
 *  in only when a backup was actually written. */
function withBackup<T extends Record<string, unknown>>(result: T, backupPath: string | undefined): T {
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
  if (absorbable.length === 0) {
    return {
      status: "nothing",
      message: "nothing absorb can express yet: every overlay entry is a moved/restyled/relabelled/deleted op, or an added shape absorb doesn't handle (only added geo/note shapes are absorbable)",
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

  await deps.fsWrite.write(path, genResult.source);

  const recompiled = await compileFile(path, compileDeps);
  if (recompiled.sceneJson === null) {
    await deps.fsWrite.write(path, source);
    return withBackup(
      { status: "verify-failed" as const, diverging: [] as string[], diagnostics: recompiled.diagnostics },
      backupPath,
    );
  }

  const residualEntries = Object.fromEntries(residual);
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
      absorbedIds: absorbable.map(([id]) => id),
      residualCount: Object.keys(residualEntries).length,
    },
    backupPath,
  );
}

async function readOverlay(fs: FsReadPort, overlayPath: string): Promise<Overlay | null> {
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

/** Ids that are missing, unexpected, or differ between the pre-absorb applied
 *  scene and the post-absorb one - the divergence report D5 requires on a
 *  failed verification. */
function diffIds(expected: SceneJSON, actual: SceneJSON): string[] {
  const ids = new Set([...Object.keys(expected.store), ...Object.keys(actual.store)]);
  const diverging: string[] = [];
  for (const id of ids) {
    const e = expected.store[id];
    const a = actual.store[id];
    if (e === undefined) diverging.push(`${id} (unexpected)`);
    else if (a === undefined) diverging.push(`${id} (missing)`);
    else if (!deepEqual(e, a)) diverging.push(`${id} (differs)`);
  }
  return diverging;
}
