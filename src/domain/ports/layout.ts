/**
 * LayoutPort: the seam between the pure compiler core and the layout engine.
 * The real adapter is `infra/layout-elk/` (elkjs); the deterministic fake is
 * `layout.fake.ts`. Direct `elkjs` imports are lint-rejected outside the
 * adapter. Async because real layout engines are.
 *
 * Adapters MUST preserve every id, every kind, and the child order of the
 * input IR: they fill in `x | y | w | h` for visual elements and never add,
 * drop, or reorder. `layout.contract.ts` holds them to it.
 */

import type { IRDoc, IRDocPositioned } from "../ir/index.js";

export interface LayoutPort {
  layout(ir: IRDoc): Promise<IRDocPositioned>;
}
