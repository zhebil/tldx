/**
 * `tldx/jsx-dev-runtime` - imported when esbuild compiles with `jsxDev: true`.
 * `jsxDEV` gets the extra `source` argument (file/line/column of the element),
 * which is where AST spans come from.
 */
import { invokeComponent, type JsxSource, type Props } from "./components.js";

export { Fragment } from "./jsx-runtime.js";

// `key`, `isStatic` and `self` are part of esbuild's jsxDEV call shape but
// unused here; `self` is simply not declared, since JS ignores extra args.
export function jsxDEV(
  type: unknown,
  props: Props,
  _key: unknown,
  _isStatic: boolean,
  source: JsxSource | undefined,
): unknown {
  return invokeComponent(type, props, source);
}
