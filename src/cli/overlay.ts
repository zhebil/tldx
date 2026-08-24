/**
 * `tldx overlay show <file>`: report what's pending in a diagram's overlay
 * (`src/app/verify.ts`, same result `tldx verify` uses - a different
 * presenter). Unlike `verify`, this always exits 0 unless the subcommand or
 * args are wrong, or the file fails to compile.
 */

import { runVerify, type VerifyDeps } from "../app/verify.js";

import { formatDiagnostics } from "./format-diagnostics.js";

export type OverlayIo = {
  writeStdout: (chunk: string) => void;
  writeStderr: (chunk: string) => void;
};

export type RunOverlayCliArgs = {
  /** argv after the `overlay` command name, e.g. ["show", "<file>"] */
  argv: readonly string[];
  deps: VerifyDeps;
  io: OverlayIo;
};

const USAGE = "usage: tldx overlay show <file>";

export async function runOverlayCli(args: RunOverlayCliArgs): Promise<number> {
  const { argv, deps, io } = args;
  const [sub, path] = argv;

  if (sub !== "show") {
    io.writeStderr(`${USAGE}\n`);
    return 1;
  }
  if (path === undefined) {
    io.writeStderr("tldx overlay show: missing <file> argument\n");
    return 1;
  }

  const result = await runVerify({ path }, deps);

  if (result.status === "compile-error") {
    io.writeStderr(`${formatDiagnostics(result.diagnostics)}\n`);
    return 1;
  }

  if (result.status === "no-overlay") {
    io.writeStdout(`no overlay at ${result.overlayPath} - nothing pending\n`);
    return 0;
  }

  const { overlayPath, stale, entries } = result;
  if (entries.length === 0) {
    io.writeStdout(`${overlayPath}: empty\n`);
    return 0;
  }

  const lines = [`${entries.length} overlay entr${entries.length === 1 ? "y" : "ies"} at ${overlayPath}:`];
  for (const entry of entries) {
    const marker = entry.changesScene ? "" : " (already in the source)";
    lines.push(`  ${entry.id}  ${entry.ops.join("+")}  ${entry.detail}${marker}`);
  }
  if (stale) {
    lines.push("note: the overlay was recorded against a different compile of this file");
  }
  io.writeStdout(`${lines.join("\n")}\n`);
  return 0;
}
