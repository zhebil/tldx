/**
 * `tldx/jsx-runtime` - the automatic-runtime module esbuild imports for plain
 * (non-dev) JSX transforms. No React: `jsx`/`jsxs` call the resolved component
 * function directly.
 */
import type { AstNode } from "../domain/parser/ast.js";

import { flattenNodes, invokeComponent, type Props } from "./components.js";

export function jsx(type: unknown, props: Props): unknown {
  return invokeComponent(type, props, undefined);
}

export const jsxs = jsx;

export function Fragment(props: Props): unknown[] {
  return flattenNodes(props.children, "Fragment");
}

// Read by tsc for JSX expression typing when a file's `jsxImportSource`
// points here. A namespace is what TS's JSX typing convention wants here, not
// a general-purpose one.
export namespace JSX {
  export type Element = AstNode | AstNode[];
  export interface ElementChildrenAttribute {
    children: unknown;
  }
  // No intrinsic (lowercase-tag) elements - only imported components.
  export interface IntrinsicElements {}
}
