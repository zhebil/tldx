/**
 * `tldx verify <file>`: does a diagram's JSX source alone reproduce the
 * canvas the overlay describes?
 *
 * Exit 0: no overlay, or every entry is already a no-op against the compiled
 * source. Exit 1: a compile error, or an entry still changes the scene.
 */

import { runVerify, type VerifyDeps } from "../app/verify.js";

import { formatDiagnostics } from "./format-diagnostics.js";

export type VerifyIo = {
  writeStdout: (chunk: string) => void;
  writeStderr: (chunk: string) => void;
};

export type RunVerifyCliArgs = {
  path: string;
  deps: VerifyDeps;
  io: VerifyIo;
};

export async function runVerifyCli(args: RunVerifyCliArgs): Promise<number> {
  const { path, deps, io } = args;
  const result = await runVerify({ path }, deps);

  if (result.status === "compile-error") {
    io.writeStderr(`${formatDiagnostics(result.diagnostics)}\n`);
    return 1;
  }

  if (result.status === "no-overlay") {
    io.writeStdout(`verified ${path}: the source is the whole diagram (overlay is empty)\n`);
    return 0;
  }

  const { overlayPath, stale, entries } = result;
  const staleLine = stale
    ? `note: the overlay at ${overlayPath} was recorded against a different compile of this file\n`
    : "";
  const outstanding = entries.filter((entry) => entry.changesScene);

  if (outstanding.length === 0) {
    const body =
      entries.length === 0
        ? `verified ${path}: the source is the whole diagram (overlay is empty)`
        : [
            `verified ${path}: the source already expresses all ${entries.length} overlay entr${entries.length === 1 ? "y" : "ies"}`,
            `the overlay at ${overlayPath} is now redundant and can be deleted`,
          ].join("\n");
    io.writeStdout(`${staleLine}${body}\n`);
    return 0;
  }

  if (staleLine !== "") io.writeStderr(staleLine);
  for (const entry of outstanding) {
    io.writeStderr(`  ${entry.name}: ${entry.detail}\n`);
  }
  io.writeStderr(
    `${path} does not yet reproduce the canvas (${outstanding.length} outstanding overlay entr${outstanding.length === 1 ? "y" : "ies"})\n`,
  );
  return 1;
}
