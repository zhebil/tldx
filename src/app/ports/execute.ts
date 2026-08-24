/**
 * JSX execution port. `execute(source, path)` runs a `.tldx.jsx` module and
 * hands back the `AstNode` it produced plus `inputs`: every file that
 * contributed to the bundle (source and every transitive import), as absolute
 * paths, so a watcher can subscribe to the whole module graph.
 *
 * The result is `AstNode`, not `AstDoc`: root-must-be-`<doc>` validation lives
 * in `domain/ir/lower.ts`.
 *
 * This port never rejects. Every failure comes back as `{ diagnostics }` with
 * `severity: "error"`, coded `runtime/compile`, `runtime/threw` or
 * `runtime/timeout`.
 */

import type { AstNode } from "../../domain/parser/ast.js";
import type { Diagnostic } from "../../domain/diagnostics/index.js";

export type ExecuteResult =
  | { ast: AstNode; inputs: string[] }
  | { diagnostics: Diagnostic[] };

export interface ExecutePort {
  execute(source: string, path: string): Promise<ExecuteResult>;
}
