/**
 * `tldx measure <file> [--frame <id>]`: print each shape's id, size and
 * position, then each edge's terminals, bend and label box.
 *
 * Runs the pipeline by hand (read -> execute -> lower -> layout) rather than
 * via `compileFile`, whose opaque `SceneJSON` carries no geometry.
 */

import type { ExecutePort } from "../app/ports/execute.js";
import type { FsReadPort } from "../app/ports/fs.js";
import { hasErrors } from "../domain/diagnostics/index.js";
import { lower } from "../domain/ir/index.js";
import {
  walkEdges,
  walkShapes,
  type AbsEdge,
  type AbsShape,
  type AbsTerminal,
} from "../domain/layout/occlusion.js";
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
    .map(
      (s) =>
        `${s.id.padEnd(idWidth)}  ${sizeOf(s).padEnd(sizeWidth)}  @ (${Math.round(s.x)},${Math.round(s.y)})`,
    )
    .join("\n");
}

/** `auto` where the router bound nothing and tldraw clips at the shape's outline. */
const terminalAt = (p: AbsTerminal | undefined): string =>
  p === undefined ? "auto" : `${p.side} (${Math.round(p.x)},${Math.round(p.y)})`;

/**
 * `from -> to  <start> -> <end>  bend N  "label" W x H @ (x,y)`, columns
 * aligned like `formatMeasure`. An unlabelled edge stops after the bend.
 *
 * The label's box is the point of it: a label wrapped one character per line
 * is a tall one-glyph-wide rect, and a label buried under a shape has
 * coordinates inside that shape's rect a line above.
 */
export function formatEdges(edges: readonly AbsEdge[]): string {
  const pairOf = (e: AbsEdge): string => `${e.from} -> ${e.to}`;
  const termsOf = (e: AbsEdge): string => `${terminalAt(e.start)} -> ${terminalAt(e.end)}`;
  const bendOf = (e: AbsEdge): string => `bend ${Math.round(e.bend)}`;
  const labelOf = (e: AbsEdge): string => {
    if (e.label === undefined) return "";
    const b = e.labelBox;
    return b === undefined
      ? `"${e.label}"`
      : `"${e.label}"  ${Math.round(b.w)} x ${Math.round(b.h)}  @ (${Math.round(b.x)},${Math.round(b.y)})`;
  };
  const widest = (f: (e: AbsEdge) => string): number =>
    Math.max(0, ...edges.map((e) => f(e).length));
  const [pairW, termsW, bendW] = [widest(pairOf), widest(termsOf), widest(bendOf)];
  return edges
    .map((e) =>
      `${pairOf(e).padEnd(pairW)}  ${termsOf(e).padEnd(termsW)}  ${bendOf(e).padEnd(bendW)}  ${labelOf(e)}`.trimEnd(),
    )
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
  const path = args.argv.find(
    (a, i) => !a.startsWith("--") && (frameIdx < 0 || i !== frameIdx + 1),
  );

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
      const validIds = shapes
        .map((s) => s.id)
        .sort()
        .join(", ");
      io.writeStderr(`tldx measure: unknown --frame id "${frame}". Valid ids: ${validIds}\n`);
      return 1;
    }
  }

  // An edge is in scope only when both its endpoints are: `--frame` aside,
  // every endpoint is a shape, so this filter is a no-op for the whole doc.
  const ids = new Set(narrowed.map((s) => s.id));
  const edges = walkEdges(positioned).filter((e) => ids.has(e.from) && ids.has(e.to));

  const sections: string[] = [];
  if (narrowed.length > 0) sections.push(`shapes:\n${formatMeasure(narrowed)}`);
  if (edges.length > 0) sections.push(`edges:\n${formatEdges(edges)}`);
  io.writeStdout(sections.length > 0 ? `${sections.join("\n\n")}\n` : "");
  return 0;
}
