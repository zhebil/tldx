/**
 * `tldx check <file>`: compile a single file and report diagnostics.
 *
 * A `PostToolUse` hook fires this on every Write|Edit, so anything not
 * ending in `.tldx.jsx` exits 0 silently rather than adding noise.
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

const TLDX_JSX_EXT = ".tldx.jsx";

export async function runCheck(args: RunCheckArgs): Promise<number> {
  const { path, deps, io } = args;

  // PostToolUse fires on every Write|Edit. Stay silent on unrelated files.
  if (!path.endsWith(TLDX_JSX_EXT)) {
    return 0;
  }

  const { diagnostics } = await compileFile(path, deps);

  if (diagnostics.length > 0) {
    const rendered = formatDiagnostics(diagnostics);
    io.writeStderr(`${rendered}\n`);
  }

  return hasErrors(diagnostics) ? 1 : 0;
}
