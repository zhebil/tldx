/**
 * `tldx measure <file> [--frame <id>]`: print each shape's id, size, and
 * position without the render-to-SVG-and-grep workaround (tldx-9mu).
 *
 * Builds the same mini pipeline `tools/layout-report.mts` does (fs read ->
 * jsx execute -> lower -> layout) instead of `compileFile`, which only
 * returns opaque `SceneJSON` - useless for geometry. Reuses
 * `domain/layout/occlusion.ts`'s `walkShapes` for the geometry itself
 * rather than re-walking the IR a second time.
 */

import type { ExecutePort } from "../app/ports/execute.js";
import type { FsReadPort } from "../app/ports/fs.js";
import { hasErrors } from "../domain/diagnostics/index.js";
import { lower } from "../domain/ir/index.js";
import { walkShapes, type AbsShape } from "../domain/layout/occlusion.js";
import type { LayoutPort } from "../domain/ports/layout.js";

import { formatDiagnostics } from "./format-diagnostics.js";

export type MeasureDeps = {
  fs: FsReadPort;
  layout: LayoutPort;
  execute: ExecutePort;
};

export type MeasureIo = {
  writeStdout: (chunk: string) => void;
  writeStderr: (chunk: string) => void;
};

export type RunMeasureArgs = {
  /** argv after the `measure` command name, e.g. ["a.tldx.jsx", "--frame", "ctx"] */
  argv: readonly string[];
  deps: MeasureDeps;
  io: MeasureIo;
};

const USAGE = "usage: tldx measure <file> [--frame <id>]";

/** `id  W x H  @ (x,y)`, columns aligned to the widest entry. */
export function formatMeasure(shapes: readonly AbsShape[]): string {
  const sizeOf = (s: AbsShape): string => `${Math.round(s.w)} x ${Math.round(s.h)}`;
  const idWidth = Math.max(0, ...shapes.map((s) => s.id.length));
  const sizeWidth = Math.max(0, ...shapes.map((s) => sizeOf(s).length));
  return shapes
    .map((s) => `${s.id.padEnd(idWidth)}  ${sizeOf(s).padEnd(sizeWidth)}  @ (${Math.round(s.x)},${Math.round(s.y)})`)
    .join("\n");
}

/** The frame itself plus every descendant shape - matches `render --frame`'s selection. */
export function narrowToFrame(shapes: readonly AbsShape[], frame: string): AbsShape[] {
  return shapes.filter((s) => s.id === frame || s.ancestorFrameIds.includes(frame));
}

export async function runMeasure(args: RunMeasureArgs): Promise<number> {
  const { deps, io } = args;
  const frameIdx = args.argv.indexOf("--frame");
  const frame = frameIdx >= 0 ? args.argv[frameIdx + 1] : undefined;
  const path = args.argv.find((a, i) => !a.startsWith("--") && (frameIdx < 0 || i !== frameIdx + 1));

  if (path === undefined) {
    io.writeStderr(`tldx measure: missing <file> argument\n${USAGE}\n`);
    return 1;
  }

  let source: string;
  try {
    source = await deps.fs.read(path);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    io.writeStderr(`tldx measure: ${msg}\n`);
    return 1;
  }

  const executed = await deps.execute.execute(source, path);
  if ("diagnostics" in executed) {
    io.writeStderr(`${formatDiagnostics(executed.diagnostics)}\n`);
    return 1;
  }

  const { ir, diagnostics } = lower(executed.ast);
  if (ir === null || hasErrors(diagnostics)) {
    io.writeStderr(`${formatDiagnostics(diagnostics)}\n`);
    return 1;
  }

  const positioned = await deps.layout.layout(ir);
  const shapes = walkShapes(positioned);

  let narrowed = shapes;
  if (frame !== undefined) {
    narrowed = narrowToFrame(shapes, frame);
    if (narrowed.length === 0) {
      const validIds = shapes.map((s) => s.id).sort().join(", ");
      io.writeStderr(`tldx measure: unknown --frame id "${frame}". Valid ids: ${validIds}\n`);
      return 1;
    }
  }

  io.writeStdout(narrowed.length > 0 ? `${formatMeasure(narrowed)}\n` : "");
  return 0;
}
