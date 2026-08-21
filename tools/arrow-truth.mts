/**
 * `tools/arrow-truth.mts <file.tldsl.jsx> [more files...]` - the arrow paths
 * tldraw actually renders, extracted from the live editor. This is the
 * single source for the "arrow paths crossing a non-endpoint shape" metric:
 * `layout-report.mts` used to carry a router guess for it, but that guess
 * matched 0 of 84 corpus arrows against real vertices and has been deleted.
 *
 * Serves the file (via `serve-harness.mts`), opens headless chromium, and
 * pulls arrow vertices and candidate shape bounds straight out of
 * `window.editor`.
 */

import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";

import { chromium } from "playwright";
import type { Editor, TLArrowBinding, TLArrowShape, Vec } from "tldraw";

import { withServedDiagram } from "./serve-harness.mjs";

type Pt = { x: number; y: number };

export type ArrowTruth = {
  arrowId: string;
  kind: string;
  from: string;
  to: string;
  points: Pt[];
};

export type ShapeBounds = { id: string; x: number; y: number; w: number; h: number };

export type PageTruth = { arrows: ArrowTruth[]; shapes: ShapeBounds[] };

export type CrossingPair = { arrowId: string; from: string; to: string; crossedId: string };

async function main(): Promise<void> {
  const files = process.argv.slice(2);
  if (files.length === 0) {
    throw new Error("usage: tools/arrow-truth.mts <file.tldsl.jsx> [more files...]");
  }

  for (const fileArg of files) {
    const file = resolve(process.cwd(), fileArg);
    if (!existsSync(file)) {
      throw new Error(`no such file: ${file}`);
    }
    process.stdout.write(`== ${basename(file)} ==\n`);
    await reportFile(file);
  }
}

async function reportFile(file: string): Promise<void> {
  const { arrows, shapes } = await withServedDiagram(file, (url) => extractTruth(url));
  const sortedArrows = [...arrows].sort((a, b) => a.arrowId.localeCompare(b.arrowId));

  for (const a of sortedArrows) {
    process.stdout.write(`${a.arrowId} kind=${a.kind} from=${a.from} to=${a.to}\n`);
    process.stdout.write(`  truth: ${formatPath(a.points)}\n`);
  }

  process.stdout.write(
    `\narrow paths crossing a non-endpoint shape: ${countCrossings(sortedArrows, shapes)}\n`,
  );
}

function formatPath(points: Pt[]): string {
  return points.map(({ x, y }) => `(${round1(x)},${round1(y)})`).join(" -> ");
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Liang-Barsky segment/rect clip test - exact, not sampled. */
export function segmentHitsRect(
  p: Pt,
  q: Pt,
  rect: { x: number; y: number; w: number; h: number },
): boolean {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const checks: [number, number][] = [
    [-dx, p.x - rect.x],
    [dx, rect.x + rect.w - p.x],
    [-dy, p.y - rect.y],
    [dy, rect.y + rect.h - p.y],
  ];
  let t0 = 0;
  let t1 = 1;
  for (const [pk, qk] of checks) {
    if (pk === 0) {
      if (qk < 0) return false;
      continue;
    }
    const r = qk / pk;
    if (pk < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 <= t1;
}

/**
 * One row per (arrow, crossed shape) pair, deduped so one arrow crossing one
 * shape counts once. Shared by `arrow-truth`'s own count and by
 * `crossing-classify.mts`, so the two tools cannot drift on what counts as a
 * crossing.
 */
export function crossingPairs(arrows: ArrowTruth[], shapes: ShapeBounds[]): CrossingPair[] {
  const pairs: CrossingPair[] = [];
  for (const { arrowId, points, from, to } of arrows) {
    const hit = new Set<string>();
    for (const s of shapes) {
      if (s.id === from || s.id === to) continue;
      if (hit.has(s.id)) continue;
      const rect = { x: s.x + 0.5, y: s.y + 0.5, w: s.w - 1, h: s.h - 1 };
      for (let i = 0; i < points.length - 1; i++) {
        if (segmentHitsRect(points[i]!, points[i + 1]!, rect)) {
          hit.add(s.id);
          pairs.push({ arrowId, from, to, crossedId: s.id });
          break;
        }
      }
    }
  }
  return pairs;
}

function countCrossings(arrows: ArrowTruth[], shapes: ShapeBounds[]): number {
  return crossingPairs(arrows, shapes).length;
}

export async function extractTruth(url: string): Promise<PageTruth> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    await page.waitForSelector("[data-shape-id]", { timeout: 15_000, state: "attached" });
    return await page.evaluate(() => {
      const editor = (window as unknown as { editor: Editor }).editor;

      const arrows: ArrowTruth[] = [];
      const shapes: ShapeBounds[] = [];

      for (const shape of editor.getCurrentPageShapes()) {
        if (shape.type === "geo" || shape.type === "note") {
          const bounds = editor.getShapePageBounds(shape);
          if (bounds) {
            shapes.push({
              id: shape.id.replace(/^shape:/, ""),
              x: bounds.x,
              y: bounds.y,
              w: bounds.w,
              h: bounds.h,
            });
          }
          continue;
        }
        if (shape.type !== "arrow") continue;

        const arrow = shape as TLArrowShape;
        const bindings = editor.getBindingsFromShape<TLArrowBinding>(arrow, "arrow");
        const startBinding = bindings.find((b) => b.props.terminal === "start");
        const endBinding = bindings.find((b) => b.props.terminal === "end");
        if (!startBinding || !endBinding) continue;

        const geometry = editor.getShapeGeometry(arrow);
        const body = (geometry as unknown as { children: { vertices: Vec[] }[] }).children[0];
        if (!body) continue;
        const transform = editor.getShapePageTransform(arrow);
        const points = body.vertices.map((v) => {
          const p = transform.applyToPoint(v);
          return { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
        });

        arrows.push({
          arrowId: arrow.id.replace(/^shape:/, ""),
          kind: arrow.props.kind,
          from: startBinding.toId.replace(/^shape:/, ""),
          to: endBinding.toId.replace(/^shape:/, ""),
          points,
        });
      }
      return { arrows, shapes };
    });
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  main().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`tools/arrow-truth.mts: ${msg}\n`);
    process.exit(1);
  });
}
