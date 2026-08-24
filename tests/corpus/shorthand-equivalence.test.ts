/**
 * For every corpus fixture, mechanically rewriting each
 * `<Frame layout="row"|"col"|"grid">` into the matching `<Row>`/`<Col>`/
 * `<Grid>` shorthand must produce byte-identical scene JSON. Fixtures are
 * never edited: the rewrite happens in memory and compiles from a temp file.
 */

import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compileFile } from "../../src/app/compile-file.js";
import { hasErrors } from "../../src/domain/diagnostics/index.js";
import { createJsxExecute } from "../../src/infra/execute-jsx/execute-jsx.js";
import { createNodeFsRead } from "../../src/infra/fs/node-fs-read.js";
import { ElkLayoutAdapter } from "../../src/infra/layout-elk/elk-layout.js";

const HERE = dirname(fileURLToPath(import.meta.url));

const LAYOUT_TO_COMPONENT: Record<string, string> = { row: "Row", col: "Col", grid: "Grid" };

function discoverCorpusFixtures(): string[] {
  return readdirSync(HERE)
    .filter((name) => name.endsWith(".tldx.jsx"))
    .sort();
}

/**
 * Rewrites every `<Frame ...>` whose attrs include `layout="row"|"col"|"grid"`
 * into the matching shorthand component, dropping the `layout` attr and
 * renaming the paired `</Frame>` via a stack (self-closing frames need no
 * pairing). Frames with `layout="auto"` or no `layout` attr pass through
 * untouched. Assumes attribute values never contain a literal `>` - true for
 * this corpus.
 */
function rewriteFrameShorthands(source: string): { rewritten: string; rewriteCount: number } {
  const tagRe = /<\/?Frame\b[^>]*>/g;
  const stack: (string | null)[] = [];
  let result = "";
  let lastIndex = 0;
  let rewriteCount = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(source)) !== null) {
    result += source.slice(lastIndex, match.index);
    const tag = match[0];
    if (tag.startsWith("</")) {
      const newName = stack.pop();
      result += newName ? `</${newName}>` : tag;
    } else {
      const selfClosing = tag.endsWith("/>");
      const layoutMatch = /\slayout="(row|col|grid)"/.exec(tag);
      if (layoutMatch) {
        const newName = LAYOUT_TO_COMPONENT[layoutMatch[1]!]!;
        const newTag = tag
          .replace(/^<Frame\b/, `<${newName}`)
          .replace(/\slayout="(row|col|grid)"/, "");
        result += newTag;
        if (!selfClosing) stack.push(newName);
        rewriteCount++;
      } else {
        result += tag;
        if (!selfClosing) stack.push(null);
      }
    }
    lastIndex = tagRe.lastIndex;
  }
  result += source.slice(lastIndex);
  return { rewritten: result, rewriteCount };
}

/** Adds any shorthand names actually used to the `import { ... } from "tldx"` line. */
function fixImports(source: string, usedNames: readonly string[]): string {
  if (usedNames.length === 0) return source;
  return source.replace(
    /import\s*\{([^}]*)\}\s*from\s*["']tldx["'];/,
    (full: string, names: string) => {
      const existing = names
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const merged = [...existing];
      for (const n of usedNames) if (!merged.includes(n)) merged.push(n);
      return `import { ${merged.join(", ")} } from "tldx";`;
    },
  );
}

const fixtures = discoverCorpusFixtures().map((name) => {
  const path = join(HERE, name);
  const original = readFileSync(path, "utf8");
  const { rewritten, rewriteCount } = rewriteFrameShorthands(original);
  const usedNames = [...new Set([...rewritten.matchAll(/<(Row|Col|Grid)\b/g)].map((m) => m[1]!))];
  const fixedSource = fixImports(rewritten, usedNames);
  return { name, path, original, fixedSource, rewriteCount };
});

describe("shorthand-equivalence: Row/Col/Grid produce identical scene JSON to Frame layout=...", () => {
  it("rewrote at least 5 fixtures (not vacuous)", () => {
    const rewrittenFixtureCount = fixtures.filter((f) => f.rewriteCount > 0).length;
    expect(rewrittenFixtureCount).toBeGreaterThanOrEqual(5);
  });

  for (const fixture of fixtures) {
    it(`${fixture.name}: shorthand form matches <Frame layout=...> form`, async () => {
      if (fixture.rewriteCount > 0) {
        expect(fixture.fixedSource).not.toBe(fixture.original);
      }

      const tmpDir = mkdtempSync(join(tmpdir(), "tldx-shorthand-"));
      // A fixture may relatively import sibling modules, so copy those
      // alongside for the rewritten copy to resolve.
      const libDir = join(HERE, "lib");
      if (existsSync(libDir)) cpSync(libDir, join(tmpDir, "lib"), { recursive: true });
      const tmpPath = join(tmpDir, fixture.name);
      writeFileSync(tmpPath, fixture.fixedSource, "utf8");

      try {
        const deps = {
          fs: createNodeFsRead(),
          layout: new ElkLayoutAdapter(),
          execute: createJsxExecute(),
        };
        const [originalResult, rewrittenResult] = await Promise.all([
          compileFile(fixture.path, deps),
          compileFile(tmpPath, deps),
        ]);

        // A fixture may carry a legitimate occlusion warning; the
        // invariant under test is that the rewrite is scene-JSON-identical,
        // not that either form is silent.
        expect(hasErrors(originalResult.diagnostics)).toBe(false);
        expect(hasErrors(rewrittenResult.diagnostics)).toBe(false);
        expect(rewrittenResult.sceneJson).not.toBeNull();
        expect(JSON.stringify(rewrittenResult.sceneJson)).toBe(
          JSON.stringify(originalResult.sceneJson),
        );
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    }, 30_000);
  }
});
