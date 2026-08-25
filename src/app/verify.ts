/**
 * `verify`: does this file's JSX source alone reproduce what the overlay says
 * the canvas looked like? Backs `tldx verify` and `tldx overlay show`.
 *
 * Each overlay entry is applied *alone* to the freshly compiled base scene: if
 * nothing changes, the source already expresses that edit.
 *
 * Never prints, never exits - the CLI owns stdio and the exit code.
 */

import {
  OVERLAY_VERSION,
  type Overlay,
  type OverlayEntry,
  type OverlayPlacement,
  type OverlayRebind,
} from "../contracts/overlay.js";
import type { Diagnostic } from "../domain/diagnostics/index.js";
import {
  applyOverlay,
  deepEqual,
  describeRecordId,
  localName,
  overlayPathFor,
  sceneHash,
} from "../domain/overlay/index.js";
import type { LayoutPort } from "../domain/ports/layout.js";

import { readOverlay } from "./absorb.js";
import { compileFile, type CompileFileDeps } from "./compile-file.js";
import type { ExecutePort } from "./ports/execute.js";
import type { FsReadPort } from "./ports/fs.js";

export type VerifyDeps = { fs: FsReadPort; layout: LayoutPort; execute: ExecutePort };

export type OverlayEntryReport = {
  id: string;
  /** The record id in the language of the source, e.g. `api -> db (end)`. */
  name: string;
  /** One-line human summary, e.g. `moved to (900, 120)`. */
  detail: string;
  /** False means applying this entry alone changes nothing: the source
   *  already expresses it. */
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
        name: describeRecordId(base, id),
        detail: detailOf(entry),
        changesScene: !deepEqual(base, applied),
      };
    })
    // By name, so an arrow and its two terminals - three entries for one
    // gesture - land next to each other rather than under `b` and `s`.
    .sort((a, b) => compare(a.name, b.name) || compare(a.id, b.id));

  return {
    status: "verified",
    overlayPath,
    stale: overlay.basedOn !== sceneHash(base),
    entries,
  };
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function detailOf(entry: OverlayEntry): string {
  const parts: string[] = [];
  if (entry.moved !== undefined) parts.push(movedDetail(entry.moved));
  if (entry.restyled !== undefined) parts.push(restyledDetail(entry.restyled));
  if (entry.relabelled !== undefined)
    parts.push(`relabelled to ${JSON.stringify(entry.relabelled)}`);
  if (entry.rebound !== undefined) parts.push(reboundDetail(entry.rebound));
  if (entry.deleted === true) parts.push("deleted");
  if (entry.added !== undefined)
    parts.push(`added ${String(entry.added.type ?? entry.added.typeName)} shape`);
  return parts.join("; ");
}

function movedDetail(p: OverlayPlacement): string {
  const clauses: string[] = [];
  if (p.x !== undefined || p.y !== undefined) clauses.push(`to (${p.x ?? "?"}, ${p.y ?? "?"})`);
  if (p.rotation !== undefined) clauses.push(`rotation to ${p.rotation}`);
  if (p.parentId !== undefined) clauses.push("reparented");
  if (p.index !== undefined) clauses.push("reordered");
  if (p.w !== undefined || p.h !== undefined)
    clauses.push(`resized to ${p.w ?? "?"}x${p.h ?? "?"}`);
  return `moved ${clauses.join(", ")}`;
}

/** The anchor is worth printing: rebinding onto another face of the *same*
 *  shape is a real edit, and `rebound to gate` alone would read as a no-op. */
function reboundDetail(rebound: OverlayRebind): string {
  const anchor = rebound.props.normalizedAnchor;
  if (typeof anchor !== "object" || anchor === null) return `rebound to ${localName(rebound.toId)}`;
  const { x, y } = anchor as { x?: unknown; y?: unknown };
  if (typeof x !== "number" || typeof y !== "number")
    return `rebound to ${localName(rebound.toId)}`;
  return `rebound to ${localName(rebound.toId)} at (${round2(x)}, ${round2(y)})`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * `restyled (bend 43, color blue)`. The value prints only when it is a scalar:
 * `richText` and `normalizedAnchor` are objects no single line can hold, and
 * the key alone already says which knob moved.
 */
function restyledDetail(patch: Record<string, unknown>): string {
  const parts = Object.entries(patch).map(([key, value]) => {
    if (typeof value === "number") return `${key} ${round2(value)}`;
    if (typeof value === "string" || typeof value === "boolean") return `${key} ${String(value)}`;
    return key;
  });
  return `restyled (${parts.join(", ")})`;
}
