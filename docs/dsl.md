# DSL syntax

A `.tldsl.jsx` file is a JS module that exports a function returning a
`<Doc>` tree. It compiles (esbuild), runs in a Node worker, and lowers to
the same IR/layout/emit pipeline the old text format used. See
`docs/jsx-pivot.md` for why - this doc only covers what `tldsl check`/`serve`
accept today.

```jsx
import { Doc, Frame, Box, Note, Edge, flow } from "tldsl";

export default function Diagram() {
  return <Doc>...</Doc>;
}
```

`"tldsl"` is aliased by the CLI's esbuild pass to its own bundled runtime -
there is nothing to `npm install` in the target repo. Ordinary ES `import`
splits a diagram across files; `serve`'s watcher follows the whole module
graph esbuild bundled, so editing an imported component file re-renders too.

The entry must be a default-exported **function**, not a bare `<Doc>`
element - that's what leaves room for props (themes, datasets) later without
a breaking change.

## No React, no TypeScript

`<Box/>` is a plain function call returning an object; `jsx`/`jsxDEV` call it
directly. No `react-reconciler`, no state, no hooks, no lifecycle. `<div>` is
an unknown element and `useState` is an unresolved identifier - both fail
loudly (`runtime/threw`), not silently. A component is just a function
returning a node (or an array, or null/undefined/a boolean, which are
dropped) - `.map()` over data works exactly like normal JSX composition.

The extension is `.jsx`, not `.tsx` - no `tsconfig`, no autocomplete, no
compiler catching a bad prop name. `ir/unknown-prop` (below) is the
replacement: an unrecognized prop is always an error, never silently
dropped.

## Components

This is the entire surface exported from `"tldsl"`. There is no `<Group>`,
`<Shape>`, `<Text>`, `<Line>`, `<Import>`, or `<Use>`.

| element | kind | purpose |
|---|---|---|
| `<Doc>` | container | root of the diagram |
| `<Frame>` | container | visual container - tldraw frame chrome (border + title) |
| `<Box />` | leaf | labelled box |
| `<Note>text</Note>` | leaf | sticky note; text is the **children**, not a prop |
| `<Edge />` | leaf | arrow between two ids |
| `flow("a", "b", "c")` | function | returns `[Edge a->b, Edge b->c, ...]`; splice with `{flow(...)}` |

`<Doc>` may only appear at the top level - a nested `<Doc>` is
`ir/nested-doc`.

## Props

Exact allowed sets. Anything else is `ir/unknown-prop`, reported with the
line number and the allowed list.

| element | allowed props |
|---|---|
| `<Doc>` | `id`, `direction`, `layout`, `gap`, `pad`, `cols` |
| `<Frame>` | `id`, `name`, `direction`, `layout`, `gap`, `pad`, `cols`, `x`, `y`, `w`, `h` |
| `<Box>` | `id`, `label`, `x`, `y`, `w`, `h`, `maxW` |
| `<Note>` | `id`, `x`, `y`, `w`, `h` |
| `<Edge>` | `id`, `from`, `to` |

`x`/`y`/`w`/`h`/`gap`/`pad`/`cols`/`maxW` are numbers written as strings
(`w="200"`), like any other JSX attribute value. A non-numeric value is
`ir/invalid-numeric-attr`. `maxW` on `<Box>` caps the char budget a label
wraps against, without pinning `w` itself; explicit `w`/`h` still win over
any computed size.

`id` is required on `<Box>` and `<Frame>` (`ir/missing-id`) since edges
address them by id. `<Doc>`, `<Note>`, and `<Edge>` get a synthesized id when
omitted. Duplicate explicit ids are `ir/duplicate-id`, reported at the
*second* occurrence, naming the first definition's line.

There is no `color`, `fill`, `variant`, or any other styling prop today -
`className` or `style` are `ir/unknown-prop` just like a typo would be.

## Layout

`layout` is one of `row`, `col`, `grid`, `auto`, `free`. **Default when
absent is `col`.** An unrecognized value is `ir/bad-layout-mode`.

`row` / `col` / `grid` / `free` place deterministically, bottom-up: children
are sized first, then the container places them (`grid` uses `cols` for the
column count). `auto` is the only mode that calls ELK, and it sees a *flat*
graph of that container's already-sized direct children - not the whole
document, so cross-container topology doesn't factor in.

Each container lays itself out independently: a `<Frame layout="row">`
nested inside a `<Doc layout="col">` runs its children left-to-right
regardless of the doc's own axis.

`direction` is `RIGHT | DOWN | LEFT | UP`, default `RIGHT`. It only affects
`layout="auto"` (ELK's flow axis) - a no-op on `row`/`col`/`grid`/`free`.

## Edges

```jsx
<Edge id="e1" from="login" to="auth" />
```

`from`/`to` are **plain id strings**, resolved against every id in the
document (not just siblings), center-to-center. There's no `type`, `route`,
`head-start`, or `head-end` prop - none of that is read downstream, so none
of it is accepted.

An unresolved id is `ir/unknown-reference`; a missing `from`/`to` is
`ir/missing-edge-endpoint`. Dotted anchors and free endpoints parse (they're
just strings) but are rejected at lowering, not supported:

```jsx
<Edge from="api.bottom" to="db.top" />   // ir/anchor-not-supported
<Edge from="x:100,y:200" to="db" />      // ir/free-endpoint-not-supported
```

`flow("a", "b", "c")` is sugar for consecutive edges - use it for a simple
chain, use explicit `<Edge>`s for anything non-linear.

## Reuse

Components are ordinary functions - `.map()` over data, extract a component,
import it from another file. Ids are **not** namespaced automatically: a
component used twice emits the same ids twice, which is `ir/duplicate-id`.

The convention is an `ns` prop the component interpolates into every id it
defines:

```jsx
function Service({ ns, name }) {
  return (
    <Frame id={`${ns}-frame`} name={name} layout="col" gap="8">
      <Box id={`${ns}-api`} label="API" />
      <Box id={`${ns}-db`} label="DB" />
      <Edge from={`${ns}-api`} to={`${ns}-db`} />
    </Frame>
  );
}
```

`ir/duplicate-id` names the first definition's line, so a missed `ns` is a
one-turn fix.

**Use `-` or `_`, never `.`, as the separator.** An edge's `from`/`to` is
scanned for a literal `.` before anything else, and any match is treated as
dotted-anchor syntax (see Edges, above) - so an id like `billing.api` can
never be referenced by an `<Edge>`; it always fails with
`ir/anchor-not-supported`, even though the id itself is legal on the `<Box>`.

**The `key` gotcha:** esbuild's automatic JSX transform takes `key` as a
positional argument to `jsxDEV`, so on a `.map()`'d element it never reaches
`props` - it's dropped with **no diagnostic**. The one prop name in the
language that fails silently. Don't write it; there's no reconciler,
nothing consumes it.

## Comments

`{/* ... */}` is a JS comment - esbuild strips it before it ever reaches the
runtime, so it does **not** become a sticky. Use `<Note>` to annotate:

```jsx
<Note id="n1">Token store is the only writer of session tokens.</Note>
```

## Execution model

A `.tldsl.jsx` file runs as real JS in a Node worker - it is code, not inert
text, and it needs the CLI to render (it's not portable, self-contained text
the way the old `.tldsl` format was).

Diagnostics an author will hit:

| code | when |
|---|---|
| `runtime/compile` | the file failed to build; esbuild reports all build errors at once |
| `runtime/threw` | the module threw while constructing the tree - exactly one error, mapped to the original line, no diagram |
| `runtime/timeout` | execution exceeded a hard 2s budget; the worker is terminated |
| `ir/root-not-doc` | top-level element isn't `<Doc>` |
| `ir/nested-doc` | a `<Doc>` appears below the top level |
| `ir/missing-id` | an addressable element (`<Box>`, `<Frame>`) has no `id` |
| `ir/duplicate-id` | two elements claim the same `id` |
| `ir/unknown-reference` | an edge's `from`/`to` doesn't resolve to any id |
| `ir/missing-edge-endpoint` | `<Edge>` is missing `from` or `to` |
| `ir/unknown-prop` | an attribute isn't in the allowed set for that element |
| `ir/bad-layout-mode` | `layout` isn't `row`/`col`/`grid`/`auto`/`free` |
| `ir/invalid-direction` | `direction` isn't `RIGHT`/`DOWN`/`LEFT`/`UP` |
| `ir/invalid-numeric-attr` | `x`/`y`/`w`/`h`/`gap`/`pad`/`cols` isn't a finite number |
| `ir/anchor-not-supported` | `from`/`to` used dotted-anchor syntax |
| `ir/free-endpoint-not-supported` | `from`/`to` used a free-endpoint syntax |
| `fs/not-found` | the file path doesn't exist |
| `fs/read-error` | the file exists but couldn't be read |

## Full example

```jsx
import { Doc, Frame, Box, Note, Edge, flow } from "tldsl";

function Service({ ns, name }) {
  return (
    <Frame id={`${ns}-frame`} name={name} layout="col" gap="12" pad="16">
      <Box id={`${ns}-api`} label="API" />
      <Box id={`${ns}-db`} label="DB" />
      <Edge from={`${ns}-api`} to={`${ns}-db`} />
    </Frame>
  );
}

export default function Diagram() {
  return (
    <Doc id="system" layout="row" gap="32">
      <Frame id="auth-flow" name="Auth flow" layout="col" gap="16" pad="24">
        <Box id="user" label="User" />
        <Box id="login" label="Login form" />
        <Box id="auth" label="Auth service" />
        <Box id="tokens" label="Token store" />

        {flow("user", "login", "auth", "tokens")}

        <Note id="n-design">Token store is the only writer of session tokens.</Note>
      </Frame>

      <Service ns="billing" name="Billing" />

      <Edge from="tokens" to="billing-api" />
    </Doc>
  );
}
```

This nests a `<Frame>` inside `<Doc>`, reuses `Service` with an `ns` prop
(hyphenated, not dotted - see the gotcha under Reuse), and uses `flow(...)`
for the linear chain inside `auth-flow`. The last edge crosses from the
`auth-flow` frame straight to `Service`'s `billing-api` box - `from`/`to`
resolve against every id in the document, not just siblings.

## Not implemented

Everything below parses as valid JSX (nothing here is a syntax error) but is
rejected or unavailable at lowering:

- Named anchors and fractional endpoints (`"api.right"`, `"api@1,0.25"`) -
  parsed, rejected with `ir/anchor-not-supported`.
- Free endpoints (`"x:100,y:200"`) - parsed, rejected with
  `ir/free-endpoint-not-supported`.
- Any visual/style prop (`color`, `fill`, `variant`, `className`, `style`) -
  `ir/unknown-prop`.
- Edge decoration (`type`, `route`, `head-start`, `head-end`) - not a
  recognized `<Edge>` prop at all.
- Comments-as-stickies - dead; use `<Note>`.
- Automatic id namespacing for reused components - use the `ns`-prop
  convention.
- `.tsx` / TypeScript on the authoring path.
