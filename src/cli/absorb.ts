/**
 * `tldx absorb <file> [--force]`: fold a diagram's overlay back into its JSX
 * source (`src/app/absorb.ts`). This module owns argv shape, result-to-text
 * formatting, and the exit code; `runAbsorb` itself never prints or exits
 * (CONTEXT.md: app/ never touches stdio).
 */

import { runAbsorb, type AbsorbDeps } from "../app/absorb.js";

import { formatDiagnostics } from "./format-diagnostics.js";

export type AbsorbIo = {
  writeStdout: (chunk: string) => void;
  writeStderr: (chunk: string) => void;
};

export type RunAbsorbCliArgs = {
  path: string;
  force: boolean;
  deps: AbsorbDeps;
  io: AbsorbIo;
};

export async function runAbsorbCli(args: RunAbsorbCliArgs): Promise<number> {
  const { path, force, deps, io } = args;
  const result = await runAbsorb({ path, force }, deps);

  if (result.backupPath !== undefined && result.status !== "refused-dirty") {
    io.writeStderr(`wrote backup of the original source to ${result.backupPath}\n`);
  }

  switch (result.status) {
    case "nothing":
      io.writeStdout(`${result.message}\n`);
      return 0;

    case "compile-error":
      io.writeStderr(`${formatDiagnostics(result.diagnostics)}\n`);
      return 1;

    case "refused-dirty":
      io.writeStderr(`${result.message}\n`);
      return 1;

    case "codegen-error":
      io.writeStderr(`absorb: ${result.message}\n`);
      return 1;

    case "verify-failed": {
      io.writeStderr(
        "absorb: rewrite did not verifiably reproduce the render - left the original source and overlay untouched\n",
      );
      if (result.diagnostics !== undefined && result.diagnostics.length > 0) {
        io.writeStderr(`${formatDiagnostics(result.diagnostics)}\n`);
      }
      if (result.diverging.length > 0) {
        io.writeStderr(`diverging records: ${result.diverging.join(", ")}\n`);
      }
      return 1;
    }

    case "absorbed": {
      const lines = [
        `absorbed ${result.absorbedIds.length} shape(s) into the source: ${result.absorbedIds.join(", ")}`,
        result.residualCount > 0
          ? `${result.residualCount} overlay entr${result.residualCount === 1 ? "y" : "ies"} left in the overlay (not expressible in JSX yet)`
          : "overlay is now empty",
        ...(result.moveNotes ?? []).map((note) => `  ${note}`),
      ];
      io.writeStdout(`${lines.join("\n")}\n`);
      return 0;
    }
  }
}
