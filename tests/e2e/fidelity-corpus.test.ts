/**
 * Fidelity harness (docs/plan.md T21) run over the whole corpus: compile a
 * fixture through a real `tldsl serve`, PUT a mutated snapshot, reload, and
 * check the served scene and `applyOverlay`'s own output both reproduce the
 * mutation exactly. Supersedes `tests/e2e/overlay-corpus.test.ts` (same
 * mutation generator, plus real disk serialization and a real serve
 * reload); see `tests/e2e/fidelity-harness.test.ts` for the harness's own
 * negative-control coverage.
 */

import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { checkFidelity } from "./fidelity/harness.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const CORPUS_DIR = join(HERE, "..", "corpus");

function discoverCorpusFixtures(): string[] {
  return readdirSync(CORPUS_DIR)
    .filter((name) => name.endsWith(".tldsl.jsx"))
    .sort();
}

describe("overlay corpus: real-server round-trip is lossless", () => {
  const fixtures = discoverCorpusFixtures();

  it("discovered at least six fixtures", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(6);
  });

  for (const name of fixtures) {
    it(
      `${name}: served scene and applyOverlay both reproduce the mutated canvas`,
      async () => {
        const failures = await checkFidelity(join(CORPUS_DIR, name));
        expect(failures).toEqual([]);
      },
      30_000,
    );
  }
});
