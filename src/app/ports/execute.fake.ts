/**
 * `FakeExecute` - canonical fake for `ExecutePort`. No worker, no esbuild,
 * no parsing of `source`: it is a lookup table keyed by the exact source
 * string, programmed via `setResult()`. The real worker adapter is held to
 * the same scenarios in `execute.contract.ts`.
 */

import type { AstDoc } from "../../domain/parser/ast.js";
import type { ExecutePort, ExecuteResult } from "./execute.js";

function defaultAst(path: string): AstDoc {
  return {
    kind: "doc",
    attrs: {},
    children: [],
    span: { file: path, line: 1, column: 1 },
  };
}

export class FakeExecute implements ExecutePort {
  private readonly results = new Map<string, ExecuteResult>();
  private readonly callLog: { source: string; path: string }[] = [];

  /** Program the result returned the next time `source` is executed. */
  setResult(source: string, result: ExecuteResult): void {
    this.results.set(source, result);
  }

  /** Calls made so far, in order. */
  get calls(): readonly { source: string; path: string }[] {
    return this.callLog;
  }

  execute(source: string, path: string): Promise<ExecuteResult> {
    this.callLog.push({ source, path });
    const programmed = this.results.get(source);
    return Promise.resolve(programmed ?? { ast: defaultAst(path) });
  }
}
