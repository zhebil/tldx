# Reference

Everything the `"tldx"` module exports, every prop it accepts, and every value
those props take. Anything not listed here is rejected with `ir/unknown-prop`.

## Components

**Containers.** Each lays out its children independently of its parent's axis,
so nesting is how you get structure.

|                          |                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------ |
| `<Doc>`                  | the root, one per file                                                               |
| `<Frame name>`           | border + title                                                                       |
| `<Group>`                | no chrome, pure layout — the workhorse                                               |
| `<Row>` `<Col>` `<Grid>` | `<Frame>` with `layout` forced                                                       |
| `<Pipeline>`             | a row; children are auto-wired in source order (each needs an `id`)                  |
| `<Layers>`               | a column of tiers; an unnamed tier draws no chrome                                   |
| `<Swimlanes>`            | like `<Layers>`, but lanes keep chrome. Columns do **not** align across lanes        |
| `<Graph>`                | `layout="auto"`, hands the container to ELK. A last resort — prefer nested `<Group>` |

**Leaves.**

|                         |                                             |
| ----------------------- | ------------------------------------------- |
| `<Box label>`           | a geo shape                                 |
| `<Text>…</Text>`        | tldraw's text shape, no border              |
| `<Sticky on>…</Sticky>` | a real tldraw note, fixed at 200px wide     |
| `<Edge from to>`        | one arrow                                   |
| `<Edges>`               | a block of arrows, one per line (see below) |
| `flow("a","b","c")`     | a function that expands to a chain of edges |

An unnamed container that isn't a `<Group>` also draws no chrome.

## Props

| element               | props                                                                                               |
| --------------------- | --------------------------------------------------------------------------------------------------- |
| `<Doc>`               | `id title direction layout gap rowGap colGap pad cols align equalize`                               |
| `<Frame>` and aliases | all of `<Doc>`'s, plus `name x y w h color`                                                         |
| `<Box>`               | `id label x y w h maxW color fill dash geo textAlign verticalAlign labelColor font size`            |
| `<Text>`              | `id x y w maxW color textAlign font size`                                                           |
| `<Sticky>`            | `id on x y w h maxW color textAlign verticalAlign labelColor font size`                             |
| `<Edge>` `<Edges>`    | `id from to fromSide toSide bend color dash arrowheadStart arrowheadEnd label labelColor font size` |

`<Text>` has no `h` — tldraw's text shape doesn't have one. `fill`, `dash` and
`geo` are `<Box>`-only.

All numbers are strings: `gap="48"`, not `gap={48}`.

`id` is required on `<Box>` and every container. It is synthesized for `<Doc>`,
`<Text>`, `<Sticky>` and `<Edge>` when you leave it off.

## Title

`title` names the diagram: it becomes the tldraw page name and the browser tab
title in `tldx serve`. With no `title` anywhere, the page is named after the
file: `auth.tldx.jsx` becomes `auth`.

```jsx
<Doc title="Auth flow">…</Doc>
```

With several diagrams on one server the page name is the only thing telling
them apart in tldraw's page menu, so give each `<Doc>` a `title`.

`title` is also allowed on `<Frame>` and its aliases, so an imported component
can name the sub-diagram it draws. Only one title reaches the page: the
shallowest one wins, ties within a level going to source order. A `<Doc title>`
therefore always beats a title further down, and a component's own title only
surfaces when nothing above it declared one. Nothing is drawn on the canvas for
a `title` - use `<Frame name>` or `<Text>` for a visible heading.

## Values

| prop                             | values                                                                                                                                                                                                         |
| -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `layout`                         | `col` (default) `row` `grid` `auto` `free`                                                                                                                                                                     |
| `align`                          | `start` `center` (default) `end` `stretch`                                                                                                                                                                     |
| `direction`                      | `RIGHT` (default) `DOWN` `LEFT` `UP` — only affects `layout="auto"`                                                                                                                                            |
| `color`, `labelColor`            | `black` `grey` `white` `red` `light-red` `orange` `yellow` `green` `light-green` `blue` `light-blue` `violet` `light-violet`                                                                                   |
| `fill`                           | `none` `semi` `solid` `pattern` `fill`                                                                                                                                                                         |
| `dash`                           | `draw` `solid` `dashed` `dotted`                                                                                                                                                                               |
| `font`                           | `draw` (default) `sans` `serif` `mono`                                                                                                                                                                         |
| `size`                           | `s` `m` (default) `l` `xl`                                                                                                                                                                                     |
| `textAlign`, `verticalAlign`     | `start` `middle` `end`                                                                                                                                                                                         |
| `arrowheadStart`, `arrowheadEnd` | `arrow` `triangle` `square` `dot` `pipe` `diamond` `inverted` `bar` `none`                                                                                                                                     |
| `geo`                            | `rectangle` (default) `ellipse` `oval` `diamond` `rhombus` `hexagon` `octagon` `pentagon` `triangle` `trapezoid` `star` `cloud` `heart` `check-box` `x-box` `arrow-up` `arrow-down` `arrow-left` `arrow-right` |
| `fromSide`, `toSide`             | `n` `ne` `e` `se` `s` `sw` `w` `nw` `center`, or `"x,y"` with each in 0..1                                                                                                                                     |
| `bend`                           | a signed number of page px - how far the arc's midpoint sits off the straight chord                                                                                                                            |

## Edges

`from` and `to` are ids, resolved across the whole document — an edge may cross
frame boundaries.

```jsx
<Edges color="blue">{`
  a -> b: sends
  b -> c -> d
`}</Edges>
```

One edge per line. A chain expands pairwise. The text after `:` is the label.
Props on the `<Edges>` block apply to every edge in it. Drop to a hand-written
`<Edge>` when one edge needs its own `id` or its own style.

By default the router picks the attachment faces. `fromSide` / `toSide` pin
them.

`bend` pins the curve. It is the same signed pixel offset tldraw itself
stores, so a bend dragged into shape on the canvas can be read off
`tldx overlay show` and written straight into the source. It overrides the
arc only - the router still picks the attachment faces, so the pasted number
draws the arc it drew on the canvas. Nothing later shrinks it: no chord cap,
no bend minimizing. `bend="0"` forces a straight line the router would
otherwise bow.

## Sizing

A `<Box>` sizes itself to its label. `maxW` caps how wide the label may run
before wrapping; height grows to keep it inside the shape. `<Sticky>` ignores
`maxW` — tldraw fixes note width at 200px.

On a non-rectangular `geo`, `maxW` is a hint rather than a cap. A diamond
holds about half its bounding box, so a label that only just fits a 220px
rectangle needs a 220x680 diamond — a spike. When honouring `maxW` would make
the box taller than it is wide, the box takes its natural width instead, which
is what it would have been with no `maxW` at all. Use `w` to pin a width for
real.

Setting `x`/`y` pins a shape and takes it out of flow layout. Prefer changing
the layout over pinning.

## Gotchas

These produce no error, or a confusing one:

- **`key` on a `.map()`'d element is silently swallowed.** It never reaches the
  component. Use `id` — which you need anyway.
- **A `.` in an id makes it unreferenceable** by an edge (`ir/anchor-not-supported`).
- **`label="a\nb"` renders a literal backslash-n.** Write `label={"a\nb"}`.
  This warns (`ir/literal-newline-in-label`).
- **`ir/missing-id` says `<frame>`**, not the alias you actually wrote.
- **An `<Edge>` pointing at a `<Group>` binds to nothing** — a group emits no
  shape.

## CLI

```
tldx check   <file>                        parse + validate; exit non-zero on error.
                                           Files not ending .tldx.jsx exit 0 silently.
tldx serve   <file|dir>                    watch the module graph, recompile, push over
             [--no-open] [--ttl m]         SSE, and open the tab. A directory serves
                                           every .tldx.jsx directly inside it, sorted
                                           by name, one page each - no recursion, and
                                           no diagram in it is an error. One server per
                                           project: a second `serve` hands its file
                                           to the running one, which serves it as
                                           another page, and exits. Idle-exits after
                                           --ttl minutes (default 60, 0 disables);
                                           the first --ttl wins.
tldx render  <file> <out>                  export cropped to content, from the source
             [--frame id | --shapes a,b]   alone. Reuses a running serve that serves
             [--padding px] [--scale n]    this file, unless it is stale or has a
                                           pending overlay. Never writes an overlay.
             [--format png|svg|jpeg|webp]
             [--dark] [--no-background] [--reuse-only]
tldx measure <file> [--frame id]           every shape's id, size and position,
                                           then every edge's terminals, bend and
                                           label box
tldx verify  <file>                        does the source alone reproduce what the
                                           overlay says the canvas showed?
tldx overlay show <file>                   what's pending in the overlay
tldx absorb  <file> [--force]              fold the overlay's expressible edits into
                                           source; verifies before emptying.
                                           --force overrides the dirty-worktree guard.
```
