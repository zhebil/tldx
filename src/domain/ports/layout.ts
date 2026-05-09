/**
 * LayoutPort: the seam between the pure compiler core and the layout engine.
 *
 * The real adapter is `infra/layout-elk/` (elkjs); the deterministic fake is
 * `layout.fake.ts`. Domain stages depend on this interface only - direct
 * `elkjs` imports are lint-rejected outside `infra/layout-elk/`.
 *
 * Async because real layout engines are async. Returning a `Promise` keeps the
 * adapter free to call ELK's promise API without forcing the fake to fake-out
 * a sync codepath.
 *
 * Adapters MUST preserve every id, every kind, and the child order of the
 * input IR. They fill in `x | y | w | h` for visual elements; they do not
 * add, drop, or reorder elements. See `layout.contract.ts` for the assertions
 * every adapter is held to.
 */

import type { IRDoc, IRDocPositioned } from "../ir/index.js";

export interface LayoutPort {
  layout(ir: IRDoc): Promise<IRDocPositioned>;
}
