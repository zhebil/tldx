/**
 * `tools/crossing-classify.mts <file.tldx.jsx> [more files...]` - classifies
 * every arrow crossing from `arrow-truth.mts` into one of four buckets, so a
 * routing fix (T3-T5 in `docs/plan.md`) can be scoped to the actual failure
 * mode instead of guessed at.
 *
 * Reuses `arrow-truth.mts`'s exact crossing rule (`crossingPairs`) against
 * real rendered geometry, and `layout-report.mts`'s `walk()` against the same
 * file's positioned IR for container/parent structure and out-degree. The two
 * pipelines describe the same diagram, so ids join directly (tldraw strips
 * the `shape:` prefix; the IR never had one).
 */

import { basename, resolve } from "node:path";
import { existsSync } from "node:fs";

import { hasErrors } from "../src/domain/diagnostics/index.js";
import { lower } from "../src/domain/ir/index.js";
import { createJsxExecute } from "../src/infra/execute-jsx/execute-jsx.js";
import { createNodeFsRead } from "../src/infra/fs/node-fs-read.js";
import { ElkLayoutAdapter } from "../src/infra/layout-elk/elk-layout.js";
import { formatDiagnostics } from "../src/cli/format-diagnostics.js";

import { crossingPairs, extractTruth, type CrossingPair } from "./arrow-truth.mjs";
import { walk, type AbsShape, type Walked } from "./layout-report.mjs";
import { withServedDiagram } from "./serve-harness.mjs";

export type Bucket = "same-axis skip" | "cross-container" | "fan" | "other";

const BUCKETS: Bucket[] = ["same-axis skip", "cross-container", "fan", "other"];

type ClassifyCtx = {
  byId: Map<string, AbsShape>;
  outDegreeInContainer: Map<string, number>;
};

/** Pure. Applies the T2 precedence order: same-axis skip, cross-container, fan, other. */
export function classifyCrossing(
  pair: { from: string; to: string; crossedId: string },
  ctx: ClassifyCtx,
): Bucket {
  const from = ctx.byId.get(pair.from);
  const to = ctx.byId.get(pair.to);
  const crossed = ctx.byId.get(pair.crossedId);
  if (!from || !to || !crossed) return "other";

  if (from.parentId === to.parentId && from.parentId === crossed.parentId) {
    if (isSameAxisSkip(from, to, crossed)) return "same-axis skip";
  }

  if (from.parentId !== to.parentId) return "cross-container";

  if ((ctx.outDegreeInContainer.get(pair.from) ?? 0) >= 4) return "fan";

  return "other";
}

function centerX(s: AbsShape): number {
  return s.x + s.w / 2;
}

function centerY(s: AbsShape): number {
  return s.y + s.h / 2;
}

function xOverlap(a: AbsShape, b: AbsShape): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w;
}

function yOverlap(a: AbsShape, b: AbsShape): boolean {
  return a.y < b.y + b.h && b.y < a.y + a.h;
}

function pairwiseOverlap(
  shapes: [AbsShape, AbsShape, AbsShape],
  overlaps: (a: AbsShape, b: AbsShape) => boolean,
): boolean {
  return (
    overlaps(shapes[0], shapes[1]) && overlaps(shapes[0], shapes[2]) && overlaps(shapes[1], shapes[2])
  );
}

/**
 * Axis is derived geometrically (y-ranges overlap => a horizontal axis;
 * x-ranges overlap => a vertical axis) rather than from the container's
 * declared mode, so a `grid` row is handled the same as a `row`.
 */
function isSameAxisSkip(from: AbsShape, to: AbsShape, crossed: AbsShape): boolean {
  const triple: [AbsShape, AbsShape, AbsShape] = [from, to, crossed];
  const xAxisQualifies =
    pairwiseOverlap(triple, yOverlap) && isStrictlyBetween(centerX(from), centerX(to), centerX(crossed));
  const yAxisQualifies =
    pairwiseOverlap(triple, xOverlap) && isStrictlyBetween(centerY(from), centerY(to), centerY(crossed));
  return xAxisQualifies || yAxisQualifies;
}

function isStrictlyBetween(a: number, b: number, v: number): boolean {
  return v > Math.min(a, b) && v < Math.max(a, b);
}

function bucketCounts(rows: { bucket: Bucket }[]): Record<Bucket, number> {
  const counts: Record<Bucket, number> = {
    "same-axis skip": 0,
    "cross-container": 0,
    fan: 0,
    other: 0,
  };
  for (const r of rows) counts[r.bucket]++;
  return counts;
}

function computeOutDegreeInContainer(walked: Walked): Map<string, number> {
  const byId = new Map(walked.shapes.map((s) => [s.id, s]));
  const out = new Map<string, number>();
  for (const e of walked.edges) {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from || !to) continue;
    if (from.parentId !== to.parentId) continue;
    out.set(e.from, (out.get(e.from) ?? 0) + 1);
  }
  return out;
}

async function walkFile(file: string): Promise<Walked> {
  const source = await createNodeFsRead().read(file);
  const executed = await createJsxExecute().execute(source, file);
  if ("diagnostics" in executed) {
    throw new Error(`compile error in ${file}:\n${formatDiagnostics(executed.diagnostics)}`);
  }
  const { ir, diagnostics } = lower(executed.ast);
  if (ir === null || hasErrors(diagnostics)) {
    throw new Error(`lower error in ${file}:\n${formatDiagnostics(diagnostics)}`);
  }
  const positioned = await new ElkLayoutAdapter().layout(ir);
  return walk(positioned);
}

type Row = CrossingPair & { bucket: Bucket };

type FileResult = {
  name: string;
  rows: Row[];
  arrowCount: number;
  ancestorFrameNote: number;
  fanSkipNote: number;
  skipShapedNote: number;
};

async function classifyFile(file: string): Promise<FileResult> {
  const { arrows, shapes: truthShapes } = await withServedDiagram(file, (url) => extractTruth(url));
  const walked = await walkFile(file);
  const byId = new Map(walked.shapes.map((s) => [s.id, s]));
  const outDegreeInContainer = computeOutDegreeInContainer(walked);

  const pairs = crossingPairs(arrows, truthShapes);
  const rows: Row[] = pairs
    .map((p) => ({ ...p, bucket: classifyCrossing(p, { byId, outDegreeInContainer }) }))
    .sort((a, b) => a.arrowId.localeCompare(b.arrowId) || a.crossedId.localeCompare(b.crossedId));

  let ancestorFrameNote = 0;
  let fanSkipNote = 0;
  let skipShapedNote = 0;
  for (const r of rows) {
    const from = byId.get(r.from);
    const to = byId.get(r.to);
    const crossed = byId.get(r.crossedId);
    if (from?.ancestorFrameIds.includes(r.crossedId) || to?.ancestorFrameIds.includes(r.crossedId)) {
      ancestorFrameNote++;
    }
    if (r.bucket === "same-axis skip" && (outDegreeInContainer.get(r.from) ?? 0) >= 4) {
      fanSkipNote++;
    }
    if (r.bucket !== "same-axis skip" && from && to && crossed && isSameAxisSkip(from, to, crossed)) {
      skipShapedNote++;
    }
  }

  return {
    name: basename(file),
    rows,
    arrowCount: arrows.length,
    ancestorFrameNote,
    fanSkipNote,
    skipShapedNote,
  };
}

function printFileReport(result: FileResult): void {
  process.stdout.write(`== ${result.name} ==\n`);
  for (const r of result.rows) {
    process.stdout.write(`${r.arrowId} from=${r.from} to=${r.to} crosses=${r.crossedId} class=${r.bucket}\n`);
  }
  const counts = bucketCounts(result.rows);
  process.stdout.write(`  same-axis skip: ${counts["same-axis skip"]}\n`);
  process.stdout.write(`  cross-container: ${counts["cross-container"]}\n`);
  process.stdout.write(`  fan: ${counts.fan}\n`);
  process.stdout.write(`  other: ${counts.other}\n`);
  process.stdout.write(`  total: ${result.rows.length}   (arrows: ${result.arrowCount})\n`);
  process.stdout.write(
    `  note: crossed shape is an ancestor frame of an endpoint: ${result.ancestorFrameNote}\n`,
  );
  process.stdout.write(
    `  note: same-axis skips whose source is also a fan (>=4 out-degree): ${result.fanSkipNote}\n`,
  );
  process.stdout.write(
    `  note: non-skip crossings that are skip-shaped anyway (collinear + between, endpoints in different containers): ${result.skipShapedNote}\n`,
  );
}

function printTotal(perFile: FileResult[]): void {
  process.stdout.write(`== TOTAL ==\n`);
  const grand: Record<Bucket, number> = { "same-axis skip": 0, "cross-container": 0, fan: 0, other: 0 };
  let grandTotal = 0;
  let grandAncestorNote = 0;
  let grandFanSkipNote = 0;
  let grandSkipShapedNote = 0;

  for (const f of perFile) {
    const counts = bucketCounts(f.rows);
    process.stdout.write(
      `${f.name}: same-axis skip=${counts["same-axis skip"]} cross-container=${counts["cross-container"]} fan=${counts.fan} other=${counts.other} total=${f.rows.length}\n`,
    );
    for (const b of BUCKETS) grand[b] += counts[b];
    grandTotal += f.rows.length;
    grandAncestorNote += f.ancestorFrameNote;
    grandFanSkipNote += f.fanSkipNote;
    grandSkipShapedNote += f.skipShapedNote;
  }

  process.stdout.write(`  same-axis skip: ${grand["same-axis skip"]}\n`);
  process.stdout.write(`  cross-container: ${grand["cross-container"]}\n`);
  process.stdout.write(`  fan: ${grand.fan}\n`);
  process.stdout.write(`  other: ${grand.other}\n`);
  process.stdout.write(`  total: ${grandTotal}\n`);
  process.stdout.write(
    `  note: crossed shape is an ancestor frame of an endpoint: ${grandAncestorNote}\n`,
  );
  process.stdout.write(
    `  note: same-axis skips whose source is also a fan (>=4 out-degree): ${grandFanSkipNote}\n`,
  );
  process.stdout.write(
    `  note: non-skip crossings that are skip-shaped anyway (collinear + between, endpoints in different containers): ${grandSkipShapedNote}\n`,
  );

  const sum = grand["same-axis skip"] + grand["cross-container"] + grand.fan + grand.other;
  const ok = sum === grandTotal;
  process.stdout.write(
    `sum check: ${grand["same-axis skip"]}+${grand["cross-container"]}+${grand.fan}+${grand.other} = ${sum} == ${grandTotal} ${ok ? "OK" : "MISMATCH"}\n`,
  );
  if (!ok) process.exitCode = 1;
}

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    throw new Error("usage: tools/crossing-classify.mts <file.tldx.jsx> [more files...]");
  }

  const perFile: FileResult[] = [];
  for (const fileArg of files) {
    const file = resolve(process.cwd(), fileArg);
    if (!existsSync(file)) {
      throw new Error(`no such file: ${file}`);
    }
    const result = await classifyFile(file);
    perFile.push(result);
    printFileReport(result);
  }

  printTotal(perFile);
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`tools/crossing-classify.mts: ${msg}\n`);
    process.exit(1);
  });
}
