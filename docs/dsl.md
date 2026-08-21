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
| `<Note>text</Note>` | leaf | warm-filled geo box annotation; text is the **children**, not a prop |
| `<Sticky>text</Sticky>` | leaf | real tldraw sticky note (fixed 200px width); same props as `<Note>` |
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
| `<Frame>` | `id`, `name`, `direction`, `layout`, `gap`, `pad`, `cols`, `x`, `y`, `w`, `h`, `color` |
| `<Box>` | `id`, `label`, `x`, `y`, `w`, `h`, `maxW`, `color`, `fill`, `dash`, `textAlign`, `verticalAlign`, `labelColor`, `font`, `size` |
| `<Note>` / `<Sticky>` | `id`, `on`, `x`, `y`, `w`, `h`, `color`, `textAlign`, `verticalAlign`, `labelColor`, `font`, `size` |
| `<Edge>` | `id`, `from`, `to`, `color`, `dash`, `arrowheadStart`, `arrowheadEnd`, `label`, `labelColor`, `font`, `size` |

`x`/`y`/`w`/`h`/`gap`/`pad`/`cols`/`maxW` are numbers written as strings
(`w="200"`), like any other JSX attribute value. A non-numeric value is
`ir/invalid-numeric-attr`. `maxW` on `<Box>` caps the char budget a label
wraps against, without pinning `w` itself; explicit `w`/`h` still win over
any computed size.

`id` is required on `<Box>` and `<Frame>` (`ir/missing-id`) since edges
address them by id. `<Doc>`, `<Note>`, and `<Edge>` get a synthesized id when
omitted. Duplicate explicit ids are `ir/duplicate-id`, reported at the
*second* occurrence, naming the first definition's line.

`color`/`fill`/`dash`/`arrowheadStart`/`arrowheadEnd` are raw tldraw style
enums, pass-through only - they never affect layout geometry. `color` is one
of tldraw's 13-value palette (`black`, `grey`, `light-violet`, `violet`,
`blue`, `light-blue`, `yellow`, `orange`, `green`, `light-green`,
`light-red`, `red`, `white`); `fill` is `none | semi | solid | pattern |
fill`; `dash` is `draw | solid | dashed | dotted`; `arrowheadStart` /
`arrowheadEnd` (on `<Edge>` only) are one of `arrow | triangle | square | dot
| pipe | diamond | inverted | bar | none`. An unrecognized value is
`ir/invalid-style-value`, naming the allowed list. `<Frame>` has no `fill` or
`dash` - tldraw's frame shape doesn't support them, so they're
`ir/unknown-prop` there. There is no `variant`, or any other CSS-style
prop today - `className` or `style` are `ir/unknown-prop` just like a typo
would be.

`textAlign`/`verticalAlign`/`labelColor` (T10) are raw tldraw text-style
enums on `<Box>` and `<Note>`/`<Sticky>` only, pass-through only (no effect
on layout geometry). `textAlign` and `verticalAlign` are each `start |
middle | end`; `labelColor` reuses the same 13-value palette as `color`. An
unrecognized value is `ir/invalid-style-value`, same as the other style
props. Named `textAlign`, not `align`: `align` is already the container
cross-axis alignment prop on `<Doc>`/`<Frame>` (see B1) and reusing it here
would make the same prop name mean two different things depending on which
component reads it. `<Edge>` also accepts `labelColor` (T12, see Edges
below) - it's a pass-through only there too. `<Frame>` has none of these
three - tldraw's frame shape props are exactly `{ w, h, name, color }`.
`<Edge>` has no `textAlign`/`verticalAlign` - an arrow label is always
center-anchored on its own bounding box, so alignment doesn't apply.

`font`/`size` (T11) are raw tldraw text-style enums on `<Box>`,
`<Note>`/`<Sticky>`, and `<Edge>` (T12). On `<Box>`/`<Note>` they *do* affect
layout: label wrapping and box/note sizing key off tldraw's real per-glyph
metrics for the chosen (font, size) pair (`domain/layout/glyph-metrics.ts`).
`font` is `draw | sans | serif | mono`; `size` is `s | m | l | xl`, tldraw's
`LABEL_FONT_SIZES` (18/22/26/32px) on `<Box>`/`<Note>`, or
`ARROW_LABEL_FONT_SIZES` on `<Edge>` (`size` there also sets the arrow's
stroke weight, same as `<Box>`/`<Note>` size sets border weight). An
unrecognized value is `ir/invalid-style-value`, same as the other style
props. Default is `draw`/`m`. `<Frame>` has neither - a frame title doesn't
wrap through this path.

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

`label` (T12) sets the arrow's text, matching `<Box label=...>`. Omitted or
empty is an unlabeled arrow (tldraw's default empty text):

```jsx
<Edge id="e2" from="api" to="db" label="reads" />
```

## Attaching a note

`on` pins a `<Note>` (or `<Sticky>`) to whatever it's annotating instead of
leaving it to flow in source order:

```jsx
<Note on="api-gateway">Only the gateway terminates TLS.</Note>
<Note on="e-orders-payments">Retries are idempotent here.</Note>
```

`on` names any box, frame, note, or edge id in the document (not just
siblings). An id that doesn't resolve is `ir/note-target-not-found`; the
note falls back to normal flow placement rather than being dropped.

A note attached to an **edge** is placed at the midpoint of the edge's two
endpoint shapes' centres - a straight-chord approximation that ignores any
bow a same-axis skip edge is drawn with, since the note only needs to land
near the edge, not trace its curve.

An attached note does not participate in layout: it never resizes a row/
column/grid, and it never pushes a sibling. After the rest of the document
is placed, it's parked 24px off one side of its target (right, then below,
then left, then above - whichever is clear of every other shape, or least
overlapping if none is fully clear), centred on the target on the other
axis. It is also **re-parented to the document root** regardless of where
it was declared - tldraw frames clip their children, so a note left parented
to a frame and placed outside that frame's bounds would be invisible.

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
| `ir/note-target-not-found` | a `<Note>`/`<Sticky>` `on` doesn't resolve to any id |
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
- Any CSS-style prop (`variant`, `className`, `style`) - `ir/unknown-prop`.
  (`color`, `fill`, `dash`, `arrowheadStart`, `arrowheadEnd` - raw tldraw
  enums - are implemented; see the Props table above.)
- Edge decoration (`type`, `route`, `head-start`, `head-end`) - not a
  recognized `<Edge>` prop at all.
- Comments-as-stickies - dead; use `<Note>`.
- Automatic id namespacing for reused components - use the `ns`-prop
  convention.
- `.tsx` / TypeScript on the authoring path.
