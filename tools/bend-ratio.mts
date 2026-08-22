// Throwaway diagnostic - not committed. Prints bend/chord ratio per edge.
import { basename } from "node:path";

import { hasErrors } from "../src/domain/diagnostics/index.js";
import { lower } from "../src/domain/ir/index.js";
import { computeEdgeRoutes } from "../src/domain/layout/routing.js";
import { createJsxExecute } from "../src/infra/execute-jsx/execute-jsx.js";
import { createNodeFsRead } from "../src/infra/fs/node-fs-read.js";
import { ElkLayoutAdapter } from "../src/infra/layout-elk/elk-layout.js";
import { formatDiagnostics } from "../src/cli/format-diagnostics.js";
import type { IRDocPositioned, IRElementPositioned } from "../src/domain/ir/index.js";

type AbsShape = { id: string; x: number; y: number; w: number; h: number };

function collect(ir: IRDocPositioned): Map<string, AbsShape> {
  const byId = new Map<string, AbsShape>();
  function visit(children: IRElementPositioned[], offX: number, offY: number): void {
    for (const child of children) {
      if (child.kind === "edge" || child.kind === "doc") continue;
      const absX = offX + child.x;
      const absY = offY + child.y;
      byId.set(child.id, { id: child.id, x: absX, y: absY, w: child.w, h: child.h });
      if (child.kind === "frame") visit(child.children, absX, absY);
    }
  }
  visit(ir.children, 0, 0);
  return byId;
}

async function reportFile(path: string): Promise<void> {
  const source = await createNodeFsRead().read(path);
  const executed = await createJsxExecute().execute(source, path);
  if ("diagnostics" in executed) {
    console.log(formatDiagnostics(executed.diagnostics));
    return;
  }
  const { ir, diagnostics } = lower(executed.ast);
  if (ir === null || hasErrors(diagnostics)) {
    console.log(formatDiagnostics(diagnostics));
    return;
  }
  const positioned = await new ElkLayoutAdapter().layout(ir);
  const byId = collect(positioned);
  const routes = computeEdgeRoutes(positioned);

  function walkEdges(children: IRElementPositioned[]): { id: string; from: string; to: string }[] {
    const out: { id: string; from: string; to: string }[] = [];
    for (const child of children) {
      if (child.kind === "edge") out.push({ id: child.id, from: child.from, to: child.to });
      else if (child.kind === "frame") out.push(...walkEdges(child.children));
    }
    return out;
  }
  const edges = walkEdges(positioned.children);

  console.log(`== ${basename(path)} ==`);
  const rows: { label: string; bend: number; dist: number; ratio: number }[] = [];
  for (const e of edges) {
    if (e.from === e.to) continue;
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from || !to) continue;
    const route = routes.get(e.id);
    const bend = route?.bend ?? 0;
    const cx1 = from.x + from.w / 2;
    const cy1 = from.y + from.h / 2;
    const cx2 = to.x + to.w / 2;
    const cy2 = to.y + to.h / 2;
    const dist = Math.hypot(cx2 - cx1, cy2 - cy1);
    const ratio = dist === 0 ? 0 : Math.abs(bend) / dist;
    rows.push({ label: `${e.from} -> ${e.to}`, bend, dist, ratio });
  }
  rows.sort((a, b) => b.ratio - a.ratio);
  for (const r of rows) {
    console.log(
      `  bend=${r.bend.toFixed(1).padStart(7)} dist=${r.dist.toFixed(0).padStart(5)} ratio=${r.ratio.toFixed(2).padStart(5)}  ${r.label}`,
    );
  }
}

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  for (const f of files) await reportFile(f);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
