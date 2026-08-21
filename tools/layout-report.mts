/**
 * `tools/layout-report.mts <file>` - deterministic, pure-stdout diagnostic
 * dump of a compiled diagram's geometry: a per-shape table, objective
 * layout-quality metrics, and a coarse ASCII render. Phase B uses these
 * metrics as objective gates, so precision here matters more than polish.
 *
 * Builds its own mini pipeline (fs read -> jsx execute -> lower -> layout)
 * instead of `compileFile`, because `compileFile` only returns opaque
 * `SceneJSON` - useless for geometry inspection.
 */

import { basename } from "node:path";

import { hasErrors } from "../src/domain/diagnostics/index.js";
import { lower } from "../src/domain/ir/index.js";
import type {
  IRDocPositioned,
  IREdge,
  IRElementPositioned,
} from "../src/domain/ir/index.js";
import { createJsxExecute } from "../src/infra/execute-jsx/execute-jsx.js";
import { createNodeFsRead } from "../src/infra/fs/node-fs-read.js";
import { ElkLayoutAdapter } from "../src/infra/layout-elk/elk-layout.js";
import { formatDiagnostics } from "../src/cli/format-diagnostics.js";

// -- geometry model -----------------------------------------------------------

export type ShapeKind = "frame" | "box" | "note";

export type AbsShape = {
  id: string;
  kind: ShapeKind;
  label: string;
  parentId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  ancestorFrameIds: string[];
};

export type ContainerInfo = {
  id: string;
  mode: string;
  children: { id: string; x: number; y: number }[];
};

export type Walked = { shapes: AbsShape[]; edges: IREdge[]; containers: ContainerInfo[] };

export function walk(doc: IRDocPositioned): Walked {
  const shapes: AbsShape[] = [];
  const edges: IREdge[] = [];
  const containers: ContainerInfo[] = [];

  function visit(
    id: string,
    mode: string,
    children: IRElementPositioned[],
    offX: number,
    offY: number,
    ancestorFrameIds: string[],
  ): void {
    const info: ContainerInfo = { id, mode, children: [] };
    containers.push(info);
    for (const child of children) {
      if (child.kind === "edge") {
        edges.push(child);
        continue;
      }
      if (child.kind === "doc") continue; // never a child in practice; narrows the union below
      const absX = offX + child.x;
      const absY = offY + child.y;
      info.children.push({ id: child.id, x: absX, y: absY });
      if (child.kind === "frame") {
        shapes.push({
          id: child.id,
          kind: "frame",
          label: child.name ?? child.id,
          parentId: id,
          x: absX,
          y: absY,
          w: child.w,
          h: child.h,
          ancestorFrameIds,
        });
        visit(child.id, child.layout ?? "col", child.children, absX, absY, [
          ...ancestorFrameIds,
          child.id,
        ]);
      } else if (child.kind === "box") {
        shapes.push({
          id: child.id,
          kind: "box",
          label: child.label ?? child.id,
          parentId: id,
          x: absX,
          y: absY,
          w: child.w,
          h: child.h,
          ancestorFrameIds,
        });
      } else {
        shapes.push({
          id: child.id,
          kind: "note",
          label: child.text,
          parentId: id,
          x: absX,
          y: absY,
          w: child.w,
          h: child.h,
          ancestorFrameIds,
        });
      }
    }
  }

  visit(doc.id, doc.layout ?? "col", doc.children, 0, 0, []);
  return { shapes, edges, containers };
}

function isAncestor(a: AbsShape, b: AbsShape): boolean {
  return b.ancestorFrameIds.includes(a.id) || a.ancestorFrameIds.includes(b.id);
}

function overlapArea(a: AbsShape, b: AbsShape): number {
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ox > 0 && oy > 0 ? ox * oy : 0;
}

// -- segment geometry -----------------------------------------------------------

type Pt = { x: number; y: number };

function orientation(p: Pt, q: Pt, r: Pt): number {
  const val = (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y);
  if (Math.abs(val) < 1e-9) return 0;
  return val > 0 ? 1 : 2;
}

function onSegment(p: Pt, q: Pt, r: Pt): boolean {
  return (
    q.x <= Math.max(p.x, r.x) + 1e-9 &&
    q.x >= Math.min(p.x, r.x) - 1e-9 &&
    q.y <= Math.max(p.y, r.y) + 1e-9 &&
    q.y >= Math.min(p.y, r.y) - 1e-9
  );
}

/** Inclusive intersection test (touching counts). Used for frame-border crossing. */
function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);
  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(p1, p3, p2)) return true;
  if (o2 === 0 && onSegment(p1, p4, p2)) return true;
  if (o3 === 0 && onSegment(p3, p1, p4)) return true;
  if (o4 === 0 && onSegment(p3, p2, p4)) return true;
  return false;
}

/** Strict "properly crosses" test - excludes touching/collinear cases. */
function properlyCrosses(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const o1 = orientation(p1, p2, p3);
  const o2 = orientation(p1, p2, p4);
  const o3 = orientation(p3, p4, p1);
  const o4 = orientation(p3, p4, p2);
  return o1 !== 0 && o2 !== 0 && o3 !== 0 && o4 !== 0 && o1 !== o2 && o3 !== o4;
}

function center(s: AbsShape): Pt {
  return { x: s.x + s.w / 2, y: s.y + s.h / 2 };
}

function frameBorders(f: AbsShape): [Pt, Pt][] {
  const tl = { x: f.x, y: f.y };
  const tr = { x: f.x + f.w, y: f.y };
  const bl = { x: f.x, y: f.y + f.h };
  const br = { x: f.x + f.w, y: f.y + f.h };
  return [
    [tl, tr],
    [tr, br],
    [br, bl],
    [bl, tl],
  ];
}

// -- report -----------------------------------------------------------

export function layoutReport(doc: IRDocPositioned): string {
  const { shapes, edges, containers } = walk(doc);
  const byId = new Map(shapes.map((s) => [s.id, s]));

  const lines: string[] = [];
  lines.push("== Geometry ==");
  lines.push(formatGeometryTable(shapes));
  lines.push("");
  lines.push("== Metrics ==");
  lines.push(...metricsLines(shapes, edges, containers, byId));
  lines.push("");
  lines.push(renderAscii(shapes, edges, byId));
  return lines.join("\n");
}

function formatGeometryTable(shapes: AbsShape[]): string {
  const header = ["id", "parent", "x", "y", "w", "h"];
  const rows = shapes.map((s) => [
    s.id,
    s.parentId,
    String(Math.round(s.x)),
    String(Math.round(s.y)),
    String(Math.round(s.w)),
    String(Math.round(s.h)),
  ]);
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length)),
  );
  const fmt = (r: string[]): string =>
    r.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ").trimEnd();
  return [fmt(header), ...rows.map(fmt)].join("\n");
}

type Bounds = { minX: number; minY: number; w: number; h: number };

function bounds(shapes: AbsShape[]): Bounds {
  if (shapes.length === 0) return { minX: 0, minY: 0, w: 0, h: 0 };
  const minX = Math.min(...shapes.map((s) => s.x));
  const minY = Math.min(...shapes.map((s) => s.y));
  const maxX = Math.max(...shapes.map((s) => s.x + s.w));
  const maxY = Math.max(...shapes.map((s) => s.y + s.h));
  return { minX, minY, w: maxX - minX, h: maxY - minY };
}

function metricsLines(
  shapes: AbsShape[],
  edges: IREdge[],
  containers: ContainerInfo[],
  byId: Map<string, AbsShape>,
): string[] {
  const out: string[] = [];

  const { w: canvasW, h: canvasH } = bounds(shapes);
  const canvasArea = canvasW * canvasH;
  const aspect = canvasH > 0 ? canvasW / canvasH : 0;

  out.push(`canvas: ${Math.round(canvasW)} x ${Math.round(canvasH)}`);
  out.push(`aspect ratio: ${aspect.toFixed(2)}`);

  const leafArea = shapes
    .filter((s) => s.kind !== "frame")
    .reduce((sum, s) => sum + s.w * s.h, 0);
  const fillRatio = canvasArea > 0 ? leafArea / canvasArea : 0;
  out.push(`fill ratio (leaf area / canvas area): ${fillRatio.toFixed(3)}`);

  let overlapPairs = 0;
  for (let i = 0; i < shapes.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const a = shapes[i]!;
      const b = shapes[j]!;
      if (isAncestor(a, b)) continue;
      if (overlapArea(a, b) > 0) overlapPairs++;
    }
  }
  out.push(`overlapping shape pairs: ${overlapPairs}`);

  const resolved: { edge: IREdge; from: AbsShape; to: AbsShape }[] = [];
  let skipped = 0;
  for (const e of edges) {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from || !to) {
      skipped++;
      continue;
    }
    resolved.push({ edge: e, from, to });
  }

  let crossings = 0;
  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const ei = resolved[i]!;
      const ej = resolved[j]!;
      const sharesEndpoint =
        ei.edge.from === ej.edge.from ||
        ei.edge.from === ej.edge.to ||
        ei.edge.to === ej.edge.from ||
        ei.edge.to === ej.edge.to;
      if (sharesEndpoint) continue;
      if (properlyCrosses(center(ei.from), center(ei.to), center(ej.from), center(ej.to))) {
        crossings++;
      }
    }
  }
  out.push(`edge-edge crossings: ${crossings}`);

  const lengths = resolved.map(({ from, to }) => {
    const p = center(from);
    const q = center(to);
    return Math.hypot(q.x - p.x, q.y - p.y);
  });
  const totalLen = lengths.reduce((s, v) => s + v, 0);
  const meanLen = lengths.length > 0 ? totalLen / lengths.length : 0;
  out.push(`total edge length: ${Math.round(totalLen)}`);
  out.push(`mean edge length: ${Math.round(meanLen)}`);
  out.push(`edges skipped (unresolved endpoint): ${skipped}`);

  const frames = shapes.filter((s) => s.kind === "frame");
  let boundaryCrossings = 0;
  for (const { from, to } of resolved) {
    const p = center(from);
    const q = center(to);
    for (const f of frames) {
      if (from.id === f.id || to.id === f.id) continue;
      if (from.ancestorFrameIds.includes(f.id) || to.ancestorFrameIds.includes(f.id)) continue;
      const hit = frameBorders(f).some(([b1, b2]) => segmentsIntersect(p, q, b1, b2));
      if (hit) boundaryCrossings++;
    }
  }
  out.push(`edges crossing a frame boundary they don't belong to: ${boundaryCrossings}`);

  out.push("source-order violations per container:");
  for (const c of containers) {
    out.push(`  ${c.id} (${c.mode}): ${sourceOrderViolations(c)}`);
  }

  out.push("left-edge alignment groups per container:");
  for (const c of containers) {
    const groups = new Set(c.children.map((ch) => ch.x));
    out.push(`  ${c.id}: ${groups.size} groups over ${c.children.length} children`);
  }

  return out;
}

function gridOrderViolations(
  children: ContainerInfo["children"],
  serpentine: boolean,
): number {
  let count = 0;
  let row = 0;
  for (let i = 1; i < children.length; i++) {
    const prev = children[i - 1]!;
    const cur = children[i]!;
    if (cur.y !== prev.y) {
      if (cur.y < prev.y) count++;
      row++;
      continue;
    }
    const reversed = serpentine && row % 2 === 1;
    if (reversed ? cur.x > prev.x : cur.x < prev.x) count++;
  }
  return count;
}

function sourceOrderViolations(c: ContainerInfo): number {
  if (c.mode === "auto" || c.mode === "free") return 0;
  if (c.mode === "grid") {
    // A grid may be placed row-major or serpentine, and the geometry alone does not
    // say which; scoring under both and keeping the lower count accepts either.
    return Math.min(
      gridOrderViolations(c.children, false),
      gridOrderViolations(c.children, true),
    );
  }
  let count = 0;
  for (let i = 1; i < c.children.length; i++) {
    const prev = c.children[i - 1]!;
    const cur = c.children[i]!;
    if (c.mode === "row") {
      if (cur.x < prev.x) count++;
    } else {
      // "col" and any unrecognised mode fall back to the col rule.
      if (cur.y < prev.y) count++;
    }
  }
  return count;
}

// -- ASCII render -----------------------------------------------------------

const GRID_W = 100;
/** A very tall diagram would otherwise render as hundreds of rows, which is
 *  useless to a judge and blows up the prompt. Compressing the vertical scale
 *  distorts proportion, so the header states the px-per-cell both ways. */
const GRID_MAX_H = 60;

function renderAscii(shapes: AbsShape[], edges: IREdge[], byId: Map<string, AbsShape>): string {
  const { minX, minY, w: canvasW, h: canvasH } = bounds(shapes);
  const gridH =
    canvasW > 0
      ? clamp(Math.round(((canvasH / canvasW) * GRID_W) / 2), 1, GRID_MAX_H)
      : 1;

  const scaleX = canvasW > 0 ? (GRID_W - 1) / canvasW : 0;
  const scaleY = canvasH > 0 ? (gridH - 1) / canvasH : 0;
  const toCol = (x: number): number =>
    clamp(Math.round((x - minX) * scaleX), 0, GRID_W - 1);
  const toRow = (y: number): number => clamp(Math.round((y - minY) * scaleY), 0, gridH - 1);

  const grid: string[][] = Array.from({ length: gridH }, () => Array(GRID_W).fill(" "));
  const set = (row: number, col: number, ch: string): void => {
    if (row >= 0 && row < gridH && col >= 0 && col < GRID_W) {
      const r = grid[row];
      if (r) r[col] = ch;
    }
  };
  const write = (row: number, col: number, text: string): void => {
    for (let i = 0; i < text.length; i++) set(row, col + i, text[i]!);
  };

  const frames = shapes.filter((s) => s.kind === "frame");
  for (const f of frames) {
    const left = toCol(f.x);
    const right = toCol(f.x + f.w);
    const top = toRow(f.y);
    const bottom = toRow(f.y + f.h);
    for (let c = left; c <= right; c++) {
      set(top, c, "-");
      set(bottom, c, "-");
    }
    for (let r = top; r <= bottom; r++) {
      set(r, left, "|");
      set(r, right, "|");
    }
    set(top, left, "+");
    set(top, right, "+");
    set(bottom, left, "+");
    set(bottom, right, "+");
    write(top, left + 1, truncate(f.label, Math.max(0, right - left - 1)));
  }

  for (const e of edges) {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (!from || !to) continue;
    const p = center(from);
    const q = center(to);
    drawLine(grid, gridH, toCol(p.x), toRow(p.y), toCol(q.x), toRow(q.y));
  }

  for (const s of shapes) {
    if (s.kind === "frame") continue;
    const left = toCol(s.x);
    const right = toCol(s.x + s.w);
    const top = toRow(s.y);
    const bottom = toRow(s.y + s.h);
    const rows = bottom - top + 1;
    const cols = right - left + 1;
    if (rows >= 3 && cols >= 3) {
      for (let c = left; c <= right; c++) {
        set(top, c, "-");
        set(bottom, c, "-");
      }
      for (let r = top; r <= bottom; r++) {
        set(r, left, "|");
        set(r, right, "|");
      }
      const midRow = top + Math.floor((bottom - top) / 2);
      write(midRow, left + 1, truncate(s.label, Math.max(0, cols - 2)));
    } else {
      // Too small to draw a border. Show at least a few label chars so the
      // shape is visible at all, without running the full grid width.
      write(top, left, truncate(s.label, clamp(cols, 6, GRID_W - left)));
    }
  }

  const pxPerCol = canvasW > 0 ? canvasW / GRID_W : 0;
  const pxPerRow = canvasH > 0 ? canvasH / gridH : 0;
  const header =
    `== ASCII Render (${GRID_W}x${gridH} cells; ` +
    `1 cell = ${pxPerCol.toFixed(1)} x ${pxPerRow.toFixed(1)} px) ==`;
  return [header, ...grid.map((row) => row.join(""))].join("\n");
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function truncate(s: string, maxLen: number): string {
  if (maxLen <= 0) return "";
  return s.length <= maxLen ? s : s.slice(0, maxLen);
}

function drawLine(
  grid: string[][],
  gridH: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  for (;;) {
    if (y >= 0 && y < gridH && x >= 0 && x < GRID_W) {
      const r = grid[y];
      if (r && r[x] === " ") r[x] = ".";
    }
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

// -- main -----------------------------------------------------------

async function main(): Promise<void> {
  const path = process.argv[2];
  if (!path) {
    console.error("usage: layout-report.mts <file>");
    process.exit(1);
  }

  const source = await createNodeFsRead().read(path);
  const executed = await createJsxExecute().execute(source, path);
  if ("diagnostics" in executed) {
    console.log(formatDiagnostics(executed.diagnostics));
    process.exit(1);
  }

  const { ir, diagnostics } = lower(executed.ast);
  if (ir === null || hasErrors(diagnostics)) {
    console.log(formatDiagnostics(diagnostics));
    process.exit(1);
  }

  const positioned = await new ElkLayoutAdapter().layout(ir);

  console.log(`layout-report: ${path}\n`);
  console.log(layoutReport(positioned));
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
