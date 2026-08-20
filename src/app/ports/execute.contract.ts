/**
 * Contract suite for `ExecutePort`. Both `FakeExecute` and the real
 * worker-based adapter (A3) run this against their own constructors.
 *
 * The harness owns how `source` maps to a result. The fake's harness
 * generates a unique marker string per call and pre-programs `setResult()`
 * for it before handing it back - `execute()` itself never parses `source`.
 * The real adapter's harness (A3) instead returns actual `.tldsl.jsx` source
 * text that the worker bundles and runs for real.
 */

import { describe, it, expect } from "vitest";

import type { AstNode } from "../../domain/parser/ast.js";
import type { ExecutePort } from "./execute.js";

export interface ExecuteHarness {
  port: ExecutePort;
  /** Absolute-ish path to pass as the second argument to execute(). */
  path: string;
  /** Source for a module that produces a <doc> containing a <box id={boxId}>. */
  okSource(boxId: string): string;
  /** Source for a module that throws at execution time. */
  throwingSource(): string;
  /** Source for a module that never returns. */
  infiniteSource(): string;
  /** Source with a genuine JS/JSX syntax error - fails to build, never runs. */
  compileErrorSource(): string;
  dispose(): Promise<void>;
}

/** Depth-first search for a box node whose `attrs.id.value` matches `id`. */
function findBox(node: AstNode, id: string): boolean {
  if (node.kind === "box" && node.attrs.id?.value === id) return true;
  if ("children" in node) {
    return node.children.some((child) => findBox(child, id));
  }
  return false;
}

export function runExecuteContract(
  label: string,
  make: () => Promise<ExecuteHarness>,
  options: { timeoutMs?: number } = {},
): void {
  const timeoutMs = options.timeoutMs ?? 10000;

  describe(`ExecutePort contract: ${label}`, () => {
    it(
      "success: resolves with an ast containing the expected box",
      async () => {
        const h = await make();
        try {
          const result = await h.port.execute(h.okSource("a"), h.path);
          expect("ast" in result).toBe(true);
          if (!("ast" in result)) throw new Error("expected ast result");
          expect(result.ast.kind).toBe("doc");
          expect(findBox(result.ast, "a")).toBe(true);
          expect(result.inputs).toContain(h.path);
        } finally {
          await h.dispose();
        }
      },
      timeoutMs,
    );

    it(
      "throw: resolves (never rejects) with a runtime/threw diagnostic",
      async () => {
        const h = await make();
        try {
          const result = await h.port.execute(h.throwingSource(), h.path);
          expect("diagnostics" in result).toBe(true);
          if (!("diagnostics" in result)) throw new Error("expected diagnostics result");
          expect(result.diagnostics.length).toBeGreaterThan(0);
          for (const d of result.diagnostics) {
            expect(d.severity).toBe("error");
          }
          const threw = result.diagnostics.find((d) => d.code === "runtime/threw");
          expect(threw).toBeDefined();
          expect(threw?.span?.file).toBe(h.path);
        } finally {
          await h.dispose();
        }
      },
      timeoutMs,
    );

    it(
      "timeout: resolves with a runtime/timeout diagnostic",
      async () => {
        const h = await make();
        try {
          const result = await h.port.execute(h.infiniteSource(), h.path);
          expect("diagnostics" in result).toBe(true);
          if (!("diagnostics" in result)) throw new Error("expected diagnostics result");
          const timedOut = result.diagnostics.find((d) => d.code === "runtime/timeout");
          expect(timedOut).toBeDefined();
        } finally {
          await h.dispose();
        }
      },
      timeoutMs,
    );

    it(
      "compile error: resolves with runtime/compile diagnostics",
      async () => {
        const h = await make();
        try {
          const result = await h.port.execute(h.compileErrorSource(), h.path);
          expect("diagnostics" in result).toBe(true);
          if (!("diagnostics" in result)) throw new Error("expected diagnostics result");
          expect(result.diagnostics.length).toBeGreaterThan(0);
          for (const d of result.diagnostics) {
            expect(d.severity).toBe("error");
          }
          const compileError = result.diagnostics.find((d) => d.code === "runtime/compile");
          expect(compileError).toBeDefined();
        } finally {
          await h.dispose();
        }
      },
      timeoutMs,
    );

    it(
      "no cross-call state: same path, different sources, no caching",
      async () => {
        const h = await make();
        try {
          const first = await h.port.execute(h.okSource("first"), h.path);
          if (!("ast" in first)) throw new Error("expected ast result");
          expect(findBox(first.ast, "first")).toBe(true);

          const second = await h.port.execute(h.okSource("second"), h.path);
          if (!("ast" in second)) throw new Error("expected ast result");
          expect(findBox(second.ast, "second")).toBe(true);
          expect(findBox(second.ast, "first")).toBe(false);
        } finally {
          await h.dispose();
        }
      },
      timeoutMs,
    );
  });
}
