/**
 * Fixture-driven e2e test for `tldsl check`.
 *
 * Each fixture is a pair `<name>.tldsl` + `<name>.diagnostics.txt` (the
 * expected stderr; empty = no output expected). The non-`.tldsl` skip case
 * uses `<name>.<other-ext>` as input.
 *
 * The test invokes `runCheck` directly with the real `NodeFs` adapter and
 * `StubLayout` (real ELK is a separate parallel issue, tldsl-gxl).
 * Per docs/testing.md, this is the canonical golden-file shape: new cases
 * = new fixture files, no test-code changes.
 *
 * The `.diagnostics.txt` may contain `{path}` as a placeholder for the
 * absolute fixture path; the diagnostic prefix uses whatever path was
 * passed to runCheck, so this keeps fixtures portable across machines.
 *
 * Convention: fixtures whose basename starts with `check-` are part of
 * this suite. Other fixtures (e.g. `auth.tldsl`) are owned by other tests.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, extname, join } from "node:path";

import { describe, expect, it } from "vitest";

import { runCheck, type CheckIo } from "../../src/cli/check.js";
import { StubLayout } from "../../src/domain/ports/layout.fake.js";
import { createNodeFsRead } from "../../src/infra/fs/node-fs-read.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, "fixtures");
const FIXTURE_PREFIX = "check-";

type Fixture = {
  /** Full input filename, e.g. "check-good.tldsl" or "check-not-tldsl.txt". */
  input: string;
  /** Path to the matching <basename>.diagnostics.txt. */
  expectedStderr: string;
  /** Whether the expected exit code is non-zero (file has any errors). */
  expectError: boolean;
};

function discoverFixtures(): Fixture[] {
  const entries = readdirSync(FIXTURES);
  const out: Fixture[] = [];
  for (const name of entries) {
    if (!name.startsWith(FIXTURE_PREFIX)) continue;
    if (name.endsWith(".diagnostics.txt")) continue;
    const ext = extname(name);
    const base = name.slice(0, -ext.length);
    const expectedFile = `${base}.diagnostics.txt`;
    const expectedPath = join(FIXTURES, expectedFile);
    const expectedStderr = readFileSync(expectedPath, "utf8");
    out.push({
      input: name,
      expectedStderr,
      expectError: expectedStderr.length > 0,
    });
  }
  return out.sort((a, b) => a.input.localeCompare(b.input));
}

function makeCaptureIo(): CheckIo & { stdout: string; stderr: string } {
  const buf = { stdout: "", stderr: "" };
  return {
    get stdout() {
      return buf.stdout;
    },
    get stderr() {
      return buf.stderr;
    },
    writeStdout(chunk) {
      buf.stdout += chunk;
    },
    writeStderr(chunk) {
      buf.stderr += chunk;
    },
  };
}

describe("e2e: tldsl check fixtures", () => {
  const fixtures = discoverFixtures();

  it("discovered at least one fixture", () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const fx of fixtures) {
    it(`${fx.input} -> ${fx.expectError ? "non-zero" : "exit 0"}`, async () => {
      const inputPath = join(FIXTURES, fx.input);
      const io = makeCaptureIo();

      const exitCode = await runCheck({
        path: inputPath,
        deps: { fs: createNodeFsRead(), layout: new StubLayout() },
        io,
      });

      const expected = fx.expectedStderr.replace(/\{path\}/g, inputPath);

      expect(io.stdout).toBe("");
      expect(io.stderr).toBe(expected);
      if (fx.expectError) {
        expect(exitCode).not.toBe(0);
      } else {
        expect(exitCode).toBe(0);
      }
    });
  }
});
