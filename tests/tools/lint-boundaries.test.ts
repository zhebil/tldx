import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

// The layer rules in `.oxlintrc.json` are glob-matched against import
// specifiers. A typo in a glob does not fail the lint - it silently stops
// matching, and the boundary quietly disappears. Each case below plants an
// import the config is supposed to reject and asserts that it does.

const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const oxlint = join(repoRoot, "node_modules/.bin/oxlint");

const probes: [zone: string, specifier: string][] = [
  ["domain", "../infra/layout-elk/layout-elk.js"],
  ["domain", "../app/compile-file.js"],
  ["domain", "node:fs"],
  ["domain", "tldraw"],
  ["app", "../infra/fs/fs-read.js"],
  ["app", "../cli/main.js"],
  ["app", "node:fs"],
  ["app", "elkjs"],
  ["contracts", "../domain/parser/ast.js"],
  ["runtime", "../app/compile-file.js"],
  ["infra", "../app/compile-file.js"],
  ["infra", "../cli/main.js"],
  ["viewer", "../domain/parser/ast.js"],
  ["cli", "../runtime/jsx-runtime.js"],
  ["cli", "tldraw"],
  ["cli", "chokidar"],
];

const probeDir = (zone: string) => join(repoRoot, "src", zone, "__lint_probe__");

afterAll(() => {
  for (const [zone] of probes) rmSync(probeDir(zone), { recursive: true, force: true });
});

function lint(file: string): string {
  try {
    return execFileSync(oxlint, [file], { cwd: repoRoot, encoding: "utf8" });
  } catch (err) {
    // oxlint exits non-zero when it reports errors; the report is on stdout.
    return String((err as { stdout?: string }).stdout ?? "");
  }
}

describe("oxlint layer boundaries", () => {
  it.each(probes)("rejects %s importing %s", (zone, specifier) => {
    const dir = probeDir(zone);
    mkdirSync(dir, { recursive: true });
    // One level deeper than the zone root, so `../x` resolves the same way a
    // real sibling-directory import inside that zone would.
    const file = join(dir, "probe.ts");
    const from = specifier.startsWith(".") ? `../${specifier}` : specifier;
    writeFileSync(file, `import * as probe from "${from}";\nexport const used = probe;\n`);

    expect(lint(file)).toContain("no-restricted-imports");
  });
});
