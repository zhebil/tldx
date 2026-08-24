/**
 * `compileFile`: read a `.tldx.jsx` file and run the pure compiler pipeline
 * (JSX executor via `ExecutePort`, then ir, layout, emit). Returns the
 * produced `SceneJSON` (null when there are errors) plus the merged
 * diagnostics.
 *
 * Does no I/O beyond `fs.read` and never logs - the caller decides what to do
 * on error.
 */

import { basename, dirname, join, relative, resolve } from "node:path";

import { hasErrors, type Diagnostic, type SourceSpan, error } from "../domain/diagnostics/index.js";
import { emit } from "../domain/emit/index.js";
import { lower } from "../domain/ir/index.js";
import { computeOcclusionDiagnostics } from "../domain/layout/occlusion.js";
import type { AstNode } from "../domain/parser/index.js";
import type { LayoutPort } from "../domain/ports/layout.js";
import type { SceneJSON } from "../contracts/scene-json.js";

import type { ExecutePort } from "./ports/execute.js";
import { isFileNotFoundError, type FsReadPort } from "./ports/fs.js";

export type CompileFileDeps = {
  fs: FsReadPort;
  layout: LayoutPort;
  execute: ExecutePort;
};

export type CompileFileResult = {
  /** Populated only when the pipeline ran clean. Null on any error. */
  sceneJson: SceneJSON | null;
  diagnostics: Diagnostic[];
  /**
   * Every file that contributed to this compile, in `path`'s style. Null
   * means "unknown, keep whatever you had": a watcher should leave its
   * existing subscriptions alone rather than dropping them.
   */
  inputs: string[] | null;
};

export async function compileFile(
  path: string,
  deps: CompileFileDeps,
): Promise<CompileFileResult> {
  let source: string;
  try {
    source = await deps.fs.read(path);
  } catch (err) {
    return { sceneJson: null, diagnostics: [readErrorDiag(path, err)], inputs: null };
  }

  const executed = await deps.execute.execute(source, path);
  if ("diagnostics" in executed) {
    return {
      sceneJson: null,
      diagnostics: normaliseSpans(path, executed.diagnostics),
      inputs: null,
    };
  }
  const ast: AstNode = executed.ast;
  const diagnostics: Diagnostic[] = [];
  const inputs: string[] = executed.inputs.map((f) => normalisePath(path, f));

  const { ir, diagnostics: lowerDiags } = lower(ast);
  diagnostics.push(...normaliseSpans(path, lowerDiags));

  if (ir === null || hasErrors(diagnostics)) {
    return { sceneJson: null, diagnostics, inputs };
  }

  const positioned = await deps.layout.layout(ir);
  diagnostics.push(...normaliseSpans(path, computeOcclusionDiagnostics(positioned)));
  const sceneJson = emit(positioned, docName(path));
  return { sceneJson, diagnostics, inputs };
}

/** `dir/kernel.tldx.jsx` -> `kernel`: the page name when nothing sets `title`. */
function docName(path: string): string {
  return basename(path).replace(/\.tldx\.jsx$/, "");
}

function readErrorDiag(path: string, err: unknown): Diagnostic {
  if (isFileNotFoundError(err)) {
    return error("fs/not-found", `file not found: ${path}`);
  }
  const message = err instanceof Error ? err.message : String(err);
  return error("fs/read-error", `failed to read ${path}: ${message}`);
}

/**
 * Rewrite every diagnostic's `span.file` into `path`'s style. `jsxDEV` spans
 * are basenames relative to the entry file's directory and the execute
 * adapter's own diagnostics carry absolute paths.
 */
function normaliseSpans(path: string, diagnostics: readonly Diagnostic[]): Diagnostic[] {
  return diagnostics.map((d) =>
    d.span === undefined ? d : { ...d, span: normaliseSpan(path, d.span) },
  );
}

function normaliseSpan(path: string, span: SourceSpan): SourceSpan {
  return { ...span, file: normalisePath(path, span.file) };
}

function normalisePath(path: string, file: string): string {
  const dir = dirname(path);
  const resolved = resolve(dir, file);
  return join(dir, relative(resolve(dir), resolved));
}
