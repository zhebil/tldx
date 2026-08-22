---
name: tldsl
description: >-
  Write architecture and flow diagrams as JSX with tldsl, which compiles
  `.tldsl.jsx` to a laid-out tldraw canvas. Use whenever a diagram is asked for
  or would help - system/context diagrams, service maps, pipelines, state
  machines, sequence-ish flows, layered or swimlane views - and whenever a file
  named `*.tldsl.jsx` is being read or edited. Covers the component vocabulary,
  the styling props, and the `check` / `serve` / `render` workflow.
---

# tldsl

A diagram is a `.tldsl.jsx` file. You write JSX; tldsl sizes the boxes, lays out
the containers and routes the arrows. **You never write coordinates.** Positions
in the source are an escape hatch, not the normal way to work.

## The file

```jsx
import { Doc, Frame, Box, Edge, Note, flow } from "tldsl";

export default function Diagram() {
  return (
    <Doc>
      <Frame id="web" name="Web tier" layout="row" gap="48">
        <Box id="lb" label="Load balancer" />
        <Box id="app" label="App server" />
      </Frame>
      <Box id="db" label="Postgres" geo="ellipse" color="blue" />
      {flow("lb", "app", "db")}
      <Note on="db">Single writer. Replicas are read-only.</Note>
    </Doc>
  );
}
```

Rules that are not negotiable:

- The default export is a **function** returning a single `<Doc>`. Not a bare
  `<Doc>` element, not a class.
- **Every container needs an `id`** - `<Row>`, `<Col>`, `<Grid>`, `<Group>`,
  `<Pipeline>`, `<Layers>`, `<Swimlanes>` and `<Graph>`, not just `<Frame>`, and
  whether or not anything points at it. Omit one and `check` reports
  `ir/missing-id` against `<frame>`, a name that does not appear in your file;
  the source location is what tells you which element it means.
- `"tldsl"` resolves without installing anything - the CLI aliases it.
- No React. No hooks, no state, no `useMemo`. It is JSX-as-data.
- Loops are `.map()`. **Do not pass `key`** - it is silently swallowed, and it is
  the only mistake in this language that produces no error.
- Numeric props are strings: `gap="48"`, not `gap={48}`.
- `<Edge>` and `{flow(...)}` are ordinary children. Put them wherever reads best -
  usually last, at the top level, after the containers they connect.

## Components

All from `"tldsl"`.

| | |
|---|---|
| `<Doc>` | Root. One per file, top level only. |
| `<Frame id name>` | Visual container - border and a title. `id` required. |
| `<Row id> <Col id> <Grid id>` | `<Frame>` with `layout` preset. `<Grid cols="3">`. |
| `<Group id>` | Container that draws no chrome. Groups for layout only. Never point an edge at a `<Group>` id. |
| `<Pipeline id>` | Row whose children get wired in source order automatically. Every child needs an `id`. |
| `<Layers id>` | Column of tiers; each child frame becomes a row. Unnamed tiers lose their chrome. |
| `<Swimlanes id>` | Like `<Layers>` but lanes keep their border and title. |
| `<Graph id>` | `layout="auto"` - hands this container to ELK. Use for graph-shaped things with no natural reading order. |
| `<Box id label>` | A leaf. `id` required. |
| `<Note on>text</Note>` | Annotation. Text is children, not a prop. |
| `<Sticky>text</Sticky>` | A real tldraw sticky note, fixed 200px wide. |
| `<Edge from to>` | One arrow. |
| `flow("a","b","c")` | Returns the chain of edges. Splice with `{flow(...)}`. |

Reusable components are just functions that return JSX - no registration, no
mechanism. Give them an `ns` prop and interpolate it into every `id` they
define, or the second instance collides.

```jsx
const Service = ({ ns, label }) => (
  <Frame id={`${ns}-svc`} name={label} layout="col">
    <Box id={`${ns}-api`} label="API" />
    <Box id={`${ns}-db`} label="Store" geo="ellipse" />
  </Frame>
);
```

## Layout

Put these on `<Doc>`, `<Frame>` and its aliases:

- `layout` - `col` (default) `row` `grid` `auto` `free`
- `gap` `pad` - numeric strings
- `cols` - grid column count
- `align` - `start` `center` (default) `end`, cross-axis
- `direction` - `RIGHT` `DOWN` `LEFT` `UP`; only affects `layout="auto"`

Every container lays out independently of its parent's axis. Nest freely -
that is how you get structure, and nesting is cheaper than positioning.

## Style

On `<Box>` / `<Note>` / `<Sticky>`:

- `color`, `labelColor` - `black grey light-violet violet blue light-blue yellow
  orange green light-green light-red red white`
- `fill` - `none semi solid pattern fill`
- `dash` - `draw solid dashed dotted`
- `font` - `draw` (default) `sans serif mono`
- `size` - `s m` (default) `l xl`
- `textAlign`, `verticalAlign` - `start middle end`
- `geo` (Box only) - `rectangle` (default) `ellipse oval diamond rhombus
  hexagon octagon pentagon triangle trapezoid star cloud heart check-box x-box
  arrow-up arrow-down arrow-left arrow-right`
- `maxW` - caps how wide a label may run before wrapping

On `<Edge>`: `color`, `dash`, `label`, `labelColor`, `font`, `size`,
`arrowheadStart` / `arrowheadEnd` (`arrow triangle square dot pipe diamond
inverted bar none`).

`<Frame>` only supports `color` - tldraw's frame shape has nothing else.

## Edges

`from` and `to` are ids, resolved across the whole document - a frame does not
scope them. `<Edge from="lb" to="app" label="tls" color="blue" />`.

**Never put a `.` in an id.** A dot in `from`/`to` is parsed as anchor syntax,
which is not implemented, so it always fails. Use `-` or `_`.

## Notes

`<Note on="app">…</Note>` parks the note beside `app` and takes it out of
layout, so it never pushes anything around. `on` accepts any box, frame, note or
edge id. A note on an edge sits at that edge's midpoint. Without `on`, a note
flows like a normal child.

Because an attached note is outside layout, it can land on top of something.
Keep the text to a sentence, and check the render if a diagram is note-heavy.

## Workflow

```bash
tldsl check  diagram.tldsl.jsx          # parse + validate. Fast, no browser.
tldsl serve  diagram.tldsl.jsx          # live viewer, reloads on save
tldsl render diagram.tldsl.jsx out.png  # export, cropped to content
```

- **`check` before you claim it is done.** Every diagnostic carries a code and a
  source location.
- **`serve` while iterating** - it watches the file.
- **`render` when you need to actually look at it.** Then Read the PNG. A
  diagram that validates can still read badly; the pixels are the only real
  test. `--frame <id>` exports one region, `--scale`, `--dark`,
  `--format png|svg|jpeg|webp`.

In this repo, unbuilt: `npm run dev:cli -- check diagram.tldsl.jsx`.

## What `check` will reject

1. `ir/missing-id` - every `<Box>` and every container needs an explicit
   `id`. Reported against `<frame>` whichever container alias you wrote.
2. `ir/anchor-not-supported` - a `.` in an edge endpoint.
3. `ir/duplicate-id` - usually a component instantiated twice without `ns`.
4. `ir/unknown-prop` - there is no `className`, `style` or `variant`. The message
   lists what is allowed.
5. `ir/invalid-style-value` - a colour or `geo` outside the sets above.
