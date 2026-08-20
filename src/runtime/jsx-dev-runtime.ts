/**
 * `tldsl/jsx-dev-runtime` - imported when esbuild compiles with `jsxDev:
 * true`. `jsxDEV` gets the extra `source` argument (file/line/column of the
 * element), which is where AST spans come from (docs/jsx-pivot.md decision 7).
 */
import { invokeComponent, type JsxSource, type Props } from "./components.js";

export { Fragment } from "./jsx-runtime.js";

// `key` and `isStatic` (args 3-4) and `self` (arg 6, dropped here - JS
// ignores extra call arguments) are part of esbuild's jsxDEV call shape but
// unused by this runtime.
export function jsxDEV(
  type: unknown,
  props: Props,
  _key: unknown,
  _isStatic: boolean,
  source: JsxSource | undefined,
): unknown {
  return invokeComponent(type, props, source);
}
