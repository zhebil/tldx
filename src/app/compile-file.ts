/**
 * `compileFile`: read a `.tldsl` or `.tldsl.jsx` file and run the pure
 * compiler pipeline (front end → ir → layout → emit). Two front ends feed
 * the same pipeline: the text parser (`.tldsl`) and the JSX executor
 * (`.jsx`, via `ExecutePort` - see `docs/jsx-pivot.md` decision 8). Both
 * produce the same `AstNode` shape, so `lower`/`layout`/`emit` don't know
 * which front end ran. Returns the produced `SceneJSON` (or null when there
 * are errors) plus the merged diagnostics.
 *
 * Per ADR-13, the caller decides what to do on error: `cli/check` formats
 * diagnostics and exits non-zero; `watchAndServe` pushes only an error
 * envelope and leaves the viewer's last-good scene rendered. This use case
 * does no I/O beyond `fs.read` and never logs - rendering is the CLI's job.
 */

import { dirname, join, relative, resolve } from "node:path";

import { hasErrors, type Diagnostic, type SourceSpan, error } from "../domain/diagnostics/index.js";
import { emit } from "../domain/emit/index.js";
import { lower } from "../domain/ir/index.js";
import { parse, type AstNode } from "../domain/parser/index.js";
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
   * means "unknown, keep whatever you had" - the fs-read-error and JSX
   * diagnostics-only arms don't know the input set, so a watcher should
   * leave its existing subscriptions alone rather than dropping them.
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

  let ast: AstNode | null;
  let diagnostics: Diagnostic[];
  let inputs: string[];

  if (path.endsWith(".jsx")) {
    const executed = await deps.execute.execute(source, path);
    if ("diagnostics" in executed) {
      return {
        sceneJson: null,
        diagnostics: normaliseSpans(path, executed.diagnostics),
        inputs: null,
      };
    }
    ast = executed.ast;
    diagnostics = [];
    inputs = executed.inputs.map((f) => normalisePath(path, f));
  } else {
    const parsed = parse(source, path);
    ast = parsed.ast;
    diagnostics = normaliseSpans(path, parsed.diagnostics);
    inputs = [path];
  }

  const { ir, diagnostics: lowerDiags } = lower(ast);
  diagnostics.push(...normaliseSpans(path, lowerDiags));

  if (ir === null || hasErrors(diagnostics)) {
    return { sceneJson: null, diagnostics, inputs };
  }

  const positioned = await deps.layout.layout(ir);
  const sceneJson = emit(positioned);
  return { sceneJson, diagnostics, inputs };
}

function readErrorDiag(path: string, err: unknown): Diagnostic {
  if (isFileNotFoundError(err)) {
    return error("fs/not-found", `file not found: ${path}`);
  }
  const message = err instanceof Error ? err.message : String(err);
  return error("fs/read-error", `failed to read ${path}: ${message}`);
}

/**
 * Every diagnostic's `span.file` is expressed the same way the caller
 * expressed `path`. The text parser already does this (`normalise(path)`
 * is a no-op), but JSX spans from `jsxDEV` are basenames relative to the
 * entry file's directory, and the execute adapter's own diagnostics carry
 * absolute paths - both get rewritten here to match `path`'s style.
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
