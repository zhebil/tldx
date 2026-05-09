/**
 * `tldsl check <file>`: parse → ir → layout → emit a single file and report
 * diagnostics. The composition root (`cli/main.ts`) wires real adapters and
 * calls into `runCheck`; this module owns argv shape, the non-`.tldsl` skip
 * rule, diagnostic formatting, and the exit code.
 *
 * Per CONTEXT.md "tldsl check on non-`.tldsl` files": the agent's
 * `PostToolUse` hook fires on every Write|Edit, so anything that doesn't end
 * in `.tldsl` exits 0 silently. Don't pollute agent context with noise on
 * unrelated edits.
 *
 * Pure-ish: no `process.exit`, no global stdio. The caller passes an `io`
 * struct (write functions) and uses the returned exit code. That keeps the
 * function directly testable from e2e tests without spawning a child
 * process.
 */

import { compileFile, type CompileFileDeps } from "../app/compile-file.js";
import { hasErrors } from "../domain/diagnostics/index.js";

import { formatDiagnostics } from "./format-diagnostics.js";

export type CheckIo = {
  writeStdout: (chunk: string) => void;
  writeStderr: (chunk: string) => void;
};

export type RunCheckArgs = {
  path: string;
  deps: CompileFileDeps;
  io: CheckIo;
};

const TLDSL_EXT = ".tldsl";

export async function runCheck(args: RunCheckArgs): Promise<number> {
  const { path, deps, io } = args;

  // PostToolUse fires on every Write|Edit. Stay silent on unrelated files.
  if (!path.endsWith(TLDSL_EXT)) {
    return 0;
  }

  const { diagnostics } = await compileFile(path, deps);

  if (diagnostics.length > 0) {
    const rendered = formatDiagnostics(diagnostics);
    io.writeStderr(`${rendered}\n`);
  }

  return hasErrors(diagnostics) ? 1 : 0;
}
