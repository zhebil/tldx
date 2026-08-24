/**
 * Fixture-driven e2e test for the plugin hooks `plugin/hooks/on-edit.sh` (PostToolUse)
 * and `plugin/hooks/on-prompt.sh` (UserPromptSubmit).
 *
 * Both scripts are spawned for real via `spawnSync("sh", ...)`, fed the
 * hook's stdin JSON contract, with stdout and exit code read back, so their
 * shell logic is never reimplemented in TypeScript. `on-edit.sh` runs the
 * real CLI from source via `TLDX_BIN`.
 */

import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "..", "..");
const FIXTURES = join(REPO_ROOT, "tests", "e2e", "fixtures");
const TLDX_BIN = `${join(REPO_ROOT, "node_modules", ".bin", "tsx")} ${join(REPO_ROOT, "src", "cli", "main.ts")}`;

function runHook(script: string, stdin: unknown, extraEnv: Record<string, string> = {}) {
  return spawnSync("sh", [script], {
    input: JSON.stringify(stdin),
    encoding: "utf8",
    env: { ...process.env, ...extraEnv },
  });
}

describe("e2e: plugin/hooks/on-edit.sh", () => {
  const HOOK = join(REPO_ROOT, "plugin", "hooks", "on-edit.sh");

  it(
    "does nothing for a non-*.tldx.jsx file path",
    () => {
      const result = runHook(HOOK, { tool_input: { file_path: "/tmp/x.ts" } }, { TLDX_BIN });
      expect(result.stdout).toBe("");
      expect(result.status).toBe(0);
    },
    30_000,
  );

  it(
    "does nothing for a *.tldx.jsx path that does not exist",
    () => {
      const result = runHook(
        HOOK,
        { tool_input: { file_path: "/tmp/does-not-exist.tldx.jsx" } },
        { TLDX_BIN },
      );
      expect(result.stdout).toBe("");
      expect(result.status).toBe(0);
    },
    30_000,
  );

  it(
    "surfaces check diagnostics for a broken fixture",
    () => {
      const file = join(FIXTURES, "check-jsx-broken.tldx.jsx");
      const result = runHook(HOOK, { tool_input: { file_path: file } }, { TLDX_BIN });
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout);
      expect(parsed.hookSpecificOutput.hookEventName).toBe("PostToolUse");
      expect(parsed.hookSpecificOutput.additionalContext).toContain("tldx check failed");
      expect(parsed.hookSpecificOutput.additionalContext).toContain("error[runtime/threw]");
    },
    30_000,
  );

  it(
    "reports clean with no warm serve for a clean fixture",
    () => {
      const file = join(FIXTURES, "check-jsx-good.tldx.jsx");
      const result = runHook(HOOK, { tool_input: { file_path: file } }, { TLDX_BIN });
      expect(result.status).toBe(0);
      const parsed = JSON.parse(result.stdout);
      const ctx = parsed.hookSpecificOutput.additionalContext as string;
      expect(ctx).toContain("clean.");
      expect(ctx).toContain("No `tldx serve` is running");
      expect(ctx).not.toContain("Rendered to");
    },
    30_000,
  );
});

describe("e2e: plugin/hooks/on-prompt.sh", () => {
  const HOOK = join(REPO_ROOT, "plugin", "hooks", "on-prompt.sh");
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "tldx-hooks-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it(
    "reports unabsorbed canvas changes",
    () => {
      writeFileSync(join(dir, "a.tldx.jsx"), "export default function Diagram() {}\n");
      writeFileSync(
        join(dir, "a.tldx.overlay.json"),
        JSON.stringify({ v: 1, basedOn: "x", entries: { a: {}, b: {} } }),
      );
      const result = runHook(HOOK, { cwd: dir });
      expect(result.status).toBe(0);
      expect(result.stdout).toContain("2 unabsorbed canvas change(s)");
      expect(result.stdout).toContain(join(dir, "a.tldx.jsx"));
      expect(result.stdout).toContain("/tldx:sync");
    },
    30_000,
  );

  it(
    "stays silent for an overlay with no entries",
    () => {
      writeFileSync(join(dir, "a.tldx.jsx"), "export default function Diagram() {}\n");
      writeFileSync(
        join(dir, "a.tldx.overlay.json"),
        JSON.stringify({ v: 1, basedOn: "x", entries: {} }),
      );
      const result = runHook(HOOK, { cwd: dir });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
    },
    30_000,
  );

  it(
    "stays silent when there is no overlay file",
    () => {
      writeFileSync(join(dir, "a.tldx.jsx"), "export default function Diagram() {}\n");
      const result = runHook(HOOK, { cwd: dir });
      expect(result.status).toBe(0);
      expect(result.stdout).toBe("");
    },
    30_000,
  );
});
