/**
 * `verify`: does this file's JSX source alone reproduce what the overlay
 * says the canvas looked like? Backs both `tldsl verify` (pass/fail) and
 * `tldsl overlay show` (a report) - docs/plan.md T26.
 *
 * For each overlay entry, apply *only that entry* to the freshly compiled
 * base scene and compare against the base: if nothing changes, the source
 * already expresses that edit (a candidate for `absorb`, or evidence a
 * hand-rewrite of the JSX already covers it).
 *
 * Never prints, never exits - `cli/verify.ts` and `cli/overlay.ts` own
 * stdio and the exit code.
 */

import { OVERLAY_VERSION, type Overlay, type OverlayEntry, type OverlayPlacement } from "../contracts/overlay.js";
import type { Diagnostic } from "../domain/diagnostics/index.js";
import { applyOverlay, deepEqual, overlayPathFor, sceneHash } from "../domain/overlay/index.js";
import type { LayoutPort } from "../domain/ports/layout.js";

import { readOverlay } from "./absorb.js";
import { compileFile, type CompileFileDeps } from "./compile-file.js";
import type { ExecutePort } from "./ports/execute.js";
import type { FsReadPort } from "./ports/fs.js";

export type VerifyDeps = { fs: FsReadPort; layout: LayoutPort; execute: ExecutePort };

export type OverlayEntryReport = {
  id: string;
  /** which op keys the entry carries, e.g. ["moved", "restyled"] */
  ops: string[];
  /** one-line human summary of the entry, e.g. `moved to (900, 120)` or `relabelled to "Gateway"` */
  detail: string;
  /** false => applying this entry alone to the compiled scene changes nothing,
   *  i.e. the source already expresses it */
  changesScene: boolean;
};

export type VerifyResult =
  | { status: "compile-error"; diagnostics: Diagnostic[] }
  | { status: "no-overlay"; overlayPath: string }
  | { status: "verified"; overlayPath: string; stale: boolean; entries: OverlayEntryReport[] };

export async function runVerify(args: { path: string }, deps: VerifyDeps): Promise<VerifyResult> {
  const { path } = args;
  const overlayPath = overlayPathFor(path);

  const overlay = await readOverlay(deps.fs, overlayPath);
  if (overlay === null) {
    return { status: "no-overlay", overlayPath };
  }

  const compileDeps: CompileFileDeps = { fs: deps.fs, layout: deps.layout, execute: deps.execute };
  const compiled = await compileFile(path, compileDeps);
  if (compiled.sceneJson === null) {
    return { status: "compile-error", diagnostics: compiled.diagnostics };
  }
  const base = compiled.sceneJson;

  const entries = Object.entries(overlay.entries)
    .map(([id, entry]) => {
      const single: Overlay = {
        v: OVERLAY_VERSION,
        basedOn: overlay.basedOn,
        entries: { [id]: entry },
      };
      const applied = applyOverlay(single, base).scene;
      return {
        id,
        ops: opsOf(entry),
        detail: detailOf(entry),
        changesScene: !deepEqual(base, applied),
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    status: "verified",
    overlayPath,
    stale: overlay.basedOn !== sceneHash(base),
    entries,
  };
}

const OP_ORDER = ["moved", "restyled", "relabelled", "deleted", "added"] as const satisfies readonly (keyof OverlayEntry)[];

function opsOf(entry: OverlayEntry): string[] {
  return OP_ORDER.filter((op) => entry[op] !== undefined);
}

function detailOf(entry: OverlayEntry): string {
  const parts: string[] = [];
  if (entry.moved !== undefined) parts.push(movedDetail(entry.moved));
  if (entry.restyled !== undefined) parts.push(restyledDetail(entry.restyled));
  if (entry.relabelled !== undefined) parts.push(`relabelled to ${JSON.stringify(entry.relabelled)}`);
  if (entry.deleted === true) parts.push("deleted");
  if (entry.added !== undefined) parts.push(`added ${String(entry.added.type ?? entry.added.typeName)} shape`);
  return parts.join("; ");
}

function movedDetail(p: OverlayPlacement): string {
  const clauses: string[] = [];
  if (p.x !== undefined || p.y !== undefined) clauses.push(`to (${p.x ?? "?"}, ${p.y ?? "?"})`);
  if (p.rotation !== undefined) clauses.push(`rotation to ${p.rotation}`);
  if (p.parentId !== undefined) clauses.push("reparented");
  if (p.index !== undefined) clauses.push("reordered");
  if (p.w !== undefined || p.h !== undefined) clauses.push(`resized to ${p.w ?? "?"}x${p.h ?? "?"}`);
  return `moved ${clauses.join(", ")}`;
}

function restyledDetail(patch: Record<string, unknown>): string {
  return `restyled (${Object.keys(patch).join(", ")})`;
}
