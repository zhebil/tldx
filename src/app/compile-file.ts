/**
 * `compileFile`: read a `.tldsl` file and run the pure compiler pipeline
 * (parse → ir → layout → emit). Returns the produced `SceneJSON` (or null
 * when there are errors) plus the merged diagnostics.
 *
 * Per ADR-13, the caller decides what to do on error: `cli/check` formats
 * diagnostics and exits non-zero; `watchAndServe` pushes only an error
 * envelope and leaves the viewer's last-good scene rendered. This use case
 * does no I/O beyond `fs.read` and never logs - rendering is the CLI's job.
 */

import { hasErrors, type Diagnostic, error } from "../domain/diagnostics/index.js";
import { emit } from "../domain/emit/index.js";
import { lower } from "../domain/ir/index.js";
import { parse } from "../domain/parser/index.js";
import type { LayoutPort } from "../domain/ports/layout.js";
import type { SceneJSON } from "../contracts/scene-json.js";

import { isFileNotFoundError, type FsReadPort } from "./ports/fs.js";

export type CompileFileDeps = {
  fs: FsReadPort;
  layout: LayoutPort;
};

export type CompileFileResult = {
  /** Populated only when the pipeline ran clean. Null on any error. */
  sceneJson: SceneJSON | null;
  diagnostics: Diagnostic[];
};

export async function compileFile(
  path: string,
  deps: CompileFileDeps,
): Promise<CompileFileResult> {
  let source: string;
  try {
    source = await deps.fs.read(path);
  } catch (err) {
    return { sceneJson: null, diagnostics: [readErrorDiag(path, err)] };
  }

  const { ast, diagnostics: parseDiags } = parse(source, path);
  const diagnostics: Diagnostic[] = [...parseDiags];

  const { ir, diagnostics: lowerDiags } = lower(ast);
  diagnostics.push(...lowerDiags);

  if (ir === null || hasErrors(diagnostics)) {
    return { sceneJson: null, diagnostics };
  }

  const positioned = await deps.layout.layout(ir);
  const sceneJson = emit(positioned);
  return { sceneJson, diagnostics };
}

function readErrorDiag(path: string, err: unknown): Diagnostic {
  if (isFileNotFoundError(err)) {
    return error("fs/not-found", `file not found: ${path}`);
  }
  const message = err instanceof Error ? err.message : String(err);
  return error("fs/read-error", `failed to read ${path}: ${message}`);
}
