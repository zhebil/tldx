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
| `<Group id>` | Container that draws no chrome - pure layout. **The main tool for controlling layout.** Never point an edge at a `<Group>` id. |
| `<Pipeline id>` | Row whose children get wired in source order automatically. Every child needs an `id`. |
| `<Layers id>` | Column of tiers; each child frame becomes a row. Unnamed tiers lose their chrome. |
| `<Swimlanes id>` | Like `<Layers>` but lanes keep their border and title. |
| `<Graph id>` | `layout="auto"` - hands this container to ELK. **Last resort**, see below. |
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

## Multi-file diagrams

Split a diagram across files with plain ES `import` - nothing tldsl-specific,
no registration. A module exports a component that returns one element
(usually a `<Frame>`); the entry file imports it and places it inside `<Doc>`.
Only the entry file needs the `.tldsl.jsx` extension - modules it imports are
plain `.jsx`.

```jsx
// diagrams/checkout.jsx
import { Frame, Box, Edge } from "tldsl";

export function Checkout({ ns }) {
  return (
    <Frame id={`${ns}-checkout`} name="Checkout" layout="row" gap="60">
      <Box id={`${ns}-cart`} label="Cart" />
      <Box id={`${ns}-pay`} label="Payment" />
      <Edge from={`${ns}-cart`} to={`${ns}-pay`} />
    </Frame>
  );
}
```

```jsx
// board.tldsl.jsx
import { Doc } from "tldsl";
import { Checkout } from "./diagrams/checkout.jsx";

export default function Diagram() {
  return (
    <Doc layout="col" gap="120">
      <Checkout ns="ck" />
    </Doc>
  );
}
```

Nest a module's own `<Edge>`s inside the `<Frame>` it returns, as above. They
render correctly and take up no layout space, so a module is self-contained -
it never needs to export a separate edge array alongside its JSX.

## Nest `<Group>` - this is how you control layout

**Reach for nested `<Group>` before anything else, including for graph-shaped
subjects like state machines.** A group draws nothing; it only arranges. You
name a concept, put the boxes in it, and give it a `layout` and a `gap`:

```jsx
<Group id="opening" layout="col" gap="90">
  <Box id="closed" label="CLOSED" />
  <Group id="handshake" layout="row" gap="260">
    <Box id="syn_sent" label="SYN_SENT" />
    <Box id="listen" label="LISTEN" />
  </Group>
  <Box id="syn_rcvd" label="SYN_RCVD" />
</Group>
```

The nesting names the *concepts* - "opening", "handshake", "teardown" - not
positions. An eleven-state machine laid out this way needs about five `gap`
values and no coordinates. That is the whole trick: decompose the picture into
groups until each group is a plain row or column.

Two reasons this beats the alternatives:

- **A wrong `gap` degrades gracefully.** Too loose or too tight still reads. A
  wrong coordinate puts an arrowhead inside a box.
- **It survives edits.** Add a state to a group and everything reflows. Add one
  to a hand-positioned diagram and you re-tune its neighbours by hand.

Almost every diagram that looks like it needs a graph layout decomposes into
groups. Try that first.

**`<Graph>` / `layout="auto"` is a last resort.** ELK is not yet told how big
edge labels are, so it reserves no room for them: on a graph with labelled
edges they pile up on each other and on the boxes. Use it only for a genuinely
unstructured graph, and only when the edges are unlabelled or few.

## Layout

Put these on `<Doc>`, `<Frame>` and its aliases:

- `layout` - `col` (default) `row` `grid` `auto` `free`
- `gap` `pad` - numeric strings
- `cols` - grid column count
- `align` - `start` `center` (default) `end`, cross-axis
- `direction` - `RIGHT` `DOWN` `LEFT` `UP`; only affects `layout="auto"`

Every container lays out independently of its parent's axis. Nest freely -
that is how you get structure, and nesting is cheaper than positioning.

### Size and position

`w`, `h`, `x`, `y` are valid on `<Box>`, `<Frame>`, and `<Note>` - numeric
strings, same as `gap`. They are the escape hatch flagged at the top of this
doc.

- `w` / `h` pin a box's size instead of deriving it from the label. Use for a
  percentage bar or a tall lane box, where the size is the content.
- `h` appears to need `w` alongside it to be reliable. Reported: `h` alone
  applied in a multi-child row, was silently ignored on a lone child, and
  adding an explicit `w` fixed it every time. Root cause is open and tracked
  separately, not a documentation problem - if a lone `h` doesn't seem to
  take, add a `w`.
- `x` / `y` pin an absolute position and take the element out of flow
  layout - it stops reflowing with its siblings, and they stop making room
  for it.

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
- `maxW` - caps how wide a label may run before wrapping. Works on `<Box>`
  and `<Note>`; a `<Sticky>`'s width is fixed by tldraw at 200px, so `maxW`
  has no effect there.

On `<Edge>`: `color`, `dash`, `label`, `labelColor`, `font`, `size`,
`arrowheadStart` / `arrowheadEnd` (`arrow triangle square dot pipe diamond
inverted bar none`).

`<Frame>` only supports `color` - tldraw's frame shape has nothing else.

A `label` written as a plain string attribute is raw JSX text - `label="a\nb"`
renders the two characters `\` and `n`, not a line break. For a multiline
label, use the expression form: `label={"a\nb"}`. `check` warns
(`ir/literal-newline-in-label`) if it sees a literal `\n` in a string-literal
label.

## Edges

`from` and `to` are ids, resolved across the whole document - a frame does not
scope them. `<Edge from="lb" to="app" label="tls" color="blue" />`.

An endpoint can resolve to a `<Frame>` id, not just a box -
`<Edge from="checkout" to="payments" />` points at the whole frame. Use it
for "this drives that subsystem" without picking one box inside the frame to
stand in for the group.

`from` and `to` can be the same id. A self-edge renders as a circular arrow
looping off the shape - the natural way to draw a flowchart polling loop
(`Time up? --No-->` itself).

**Never put a `.` in an id.** A dot in `from`/`to` is parsed as anchor syntax,
which is not implemented, so it always fails. Use `-` or `_`.

## Notes

`<Note on="app">…</Note>` parks the note beside `app` and takes it out of
layout, so it never pushes anything around. `on` accepts any box, frame, note or
edge id. A note on an edge sits at that edge's midpoint. Without `on`, a note
flows like a normal child.

Because an attached note is outside layout, it does not just risk overlap -
it drifts. On a wide diagram an attached note can land far from its target,
and it can end up outside its own frame entirely. Keep the text to a
sentence, and check the live viewer (or a render) on any note-heavy diagram
before you call it done.

## Workflow

**Start `serve` first, keep it open for the whole session.** The browser is the
user's view of the diagram - they watch it change as you edit, and they should
never have to wait on you for a picture.

```bash
tldsl serve diagram.tldsl.jsx    # opens a browser tab, reloads on every save
```

Run it in the background before you write the first `<Box>`, on a new file or an
existing one. It creates the file's viewer tab and then rebuilds on save, so
every edit you make is on screen within a second. Do not stop it between edits
and do not restart it per change - one server per file, running until the work is
done. `--no-open` suppresses the tab; use it only when the user already has one.

```bash
tldsl check  diagram.tldsl.jsx          # parse + validate. Fast, no browser.
tldsl render diagram.tldsl.jsx out.png  # export, cropped to content
```

- **`check`, then render and look.** `check` catches parse and validation
  errors - every diagnostic carries a code and a source location - but it
  cannot see clipping, overlap, or a label that fell out of its box. A clean
  `check` is not a finished diagram.
- **`render` is your debugging tool, not a deliverable.** A diagram that
  validates can still read badly, and you cannot see the browser tab - so export
  a PNG and Read it when you need to judge the pixels yourself. `--frame <id>`
  exports one region, `--scale`, `--dark`, `--format png|svg|jpeg|webp`.
- **A stale `serve` outlives your edits.** `render` reuses a running server
  for the same file instead of booting its own. If `render` reports an id
  that exists in your source, suspect a reused server before you suspect the
  compiler - restart `serve` and try again.
- **Write those PNGs to a temp dir, never into the repo.** `/tmp/foo.png`, not
  `docs/renders/foo.png`. They are scratch output of your own verification loop
  and committing them bloats the repo with files nobody reads. The only time a
  PNG belongs in the project is when the user explicitly asks for an exported
  image - then put it where they ask.
- **Do not offer the user a screenshot.** They have the live diagram. Describe
  what changed and let them look.

`render` writes a `*.tldsl.overlay.json` sidecar next to the diagram. A stale one
silently changes later renders. Delete sidecars before measuring anything.

In this repo, unbuilt: `npm run dev:cli -- serve diagram.tldsl.jsx`.

## What `check` will reject

1. `ir/missing-id` - every `<Box>` and every container needs an explicit
   `id`. Reported against `<frame>` whichever container alias you wrote.
2. `ir/anchor-not-supported` - a `.` in an edge endpoint.
3. `ir/duplicate-id` - usually a component instantiated twice without `ns`.
4. `ir/unknown-prop` - there is no `className`, `style` or `variant`. The message
   lists what is allowed.
5. `ir/invalid-style-value` - a colour or `geo` outside the sets above.
