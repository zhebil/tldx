/**
 * JSX execution port. `execute(source, path)` runs a `.tldx.jsx` module and
 * hands back the `AstNode` it produced plus every file that contributed to
 * the bundle. The real adapter (`infra/execute-jsx/`, A3) bundles with
 * esbuild and runs the module in a fresh `worker_threads` worker per
 * compile, hard-terminated after a 2s budget - see `docs/jsx-pivot.md`
 * decision 8.
 *
 * The result is `AstNode`, not `AstDoc`: root-must-be-`<doc>` validation stays
 * in `domain/ir/lower.ts` where it already lives for the text parser.
 *
 * `inputs` is every file that contributed to the bundle (source + every
 * transitive import, including the runtime), as absolute paths - decision 12
 * needs this to re-subscribe the watcher to the module graph, not just the
 * entry file.
 *
 * This port never rejects. Every failure mode - a compile error, user code
 * throwing, or the 2s timeout - comes back as `{ diagnostics }` with
 * `severity: "error"`. The real adapter uses diagnostic codes `runtime/compile`
 * (the bundle failed to build - bad JS/JSX syntax), `runtime/threw` (user code
 * threw or the module errored) and `runtime/timeout` (the worker was
 * terminated after exceeding its budget).
 */

import type { AstNode } from "../../domain/parser/ast.js";
import type { Diagnostic } from "../../domain/diagnostics/index.js";

export type ExecuteResult =
  | { ast: AstNode; inputs: string[] }
  | { diagnostics: Diagnostic[] };

export interface ExecutePort {
  execute(source: string, path: string): Promise<ExecuteResult>;
}
