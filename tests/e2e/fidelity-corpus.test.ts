/**
 * The fidelity harness run over the whole corpus: compile a fixture through
 * a real `tldx serve`, PUT a mutated snapshot, reload, and check that the
 * served scene and `applyOverlay`'s own output both reproduce the mutation
 * exactly.
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
    .filter((name) => name.endsWith(".tldx.jsx"))
    .sort();
}

describe("overlay corpus: real-server round-trip is lossless", () => {
  const fixtures = discoverCorpusFixtures();

  it("discovered at least six fixtures", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(6);
  });

  for (const name of fixtures) {
    it(`${name}: served scene and applyOverlay both reproduce the mutated canvas`, async () => {
      const failures = await checkFidelity(join(CORPUS_DIR, name));
      expect(failures).toEqual([]);
    }, 30_000);
  }
});
