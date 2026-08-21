# Diagram defects

What broke when tldsl was pointed at diagrams it was not designed around
(Phase 9). Authoring tasks fill this file; fix tasks drain it. An authoring wake
logs what it hit and moves on - it does not fix anything, and it does not
reshape the diagram to avoid the defect.

## Schema

One `###` section per defect, numbered in the order they were found. Numbers are
never reused, even after a defect is fixed.

```
### D<n>. <one-line subject>

- **Diagram:** the file that provoked it, e.g. `examples/tcp-lifecycle.tldsl.jsx`
- **Severity:** blocker | wrong | ugly | papercut
- **Attempted:** what the author wrote, in one or two sentences.
- **Happened:** what the tool did instead - the error text, or what the PNG
  showed. Point at the render if there is one.
- **Repro:** `examples/repro/<name>.tldsl.jsx` - the smallest file that shows
  it. A repro that needs a whole realistic diagram is not a repro yet.
- **Status:** open | fixed in T<n> | struck (with the reason)
```

## Severity

Severity describes what the defect does to the **diagram**, not how hard the fix
looks. A one-line fix to something that makes a diagram unreadable is still a
blocker.

- **blocker** - the diagram cannot be expressed at all. No arrangement of
  existing primitives says the thing the subject requires.
- **wrong** - it renders, and what it renders is false: an arrow pointing the
  wrong way, a label on the wrong shape, an ordering the reader will misread.
- **ugly** - it renders and it is true, but it reads badly: overlaps, crossings
  a human would not draw, wasted space, a shape three times the size of its
  neighbours.
- **papercut** - the diagram came out right, but getting there cost the author
  something it should not have: a prop the skill does not mention, a workaround,
  a value that had to be guessed and tuned.

## Entries

### D1. Repeated arrows between the same pair of shapes collapse onto one path

- **Diagram:** `examples/tcp-lifecycle.tldsl.jsx`
- **Severity:** blocker
- **Attempted:** The sequence archetype: two participants, one box each, and the
  eight TCP segments as eight separately-labelled arrows between them in order.
- **Happened:** All the arrows are routed identically, so they stack on top of
  each other - one arrow is visible, the arrowheads at both ends cancel out
  visually, and the labels overprint into an unreadable smear (`SYN`, `SYN-ACK`
  and `ACK` render as `SYNKACK`). Nothing carries the ordering either: an arrow
  has no rank, so even separated they would not read 1..8. `check` is clean, so
  there is no warning that seven of the eight messages have vanished.
  The workaround the shipped diagram uses is to duplicate every participant's
  state into one row per message - ten rows, twenty-two boxes - purely so each
  arrow gets a row of its own to sit in.
- **Repro:** `examples/repro/d1-repeated-edges.tldsl.jsx`
- **Status:** open

### D2. An unnamed `<Row>` / `<Col>` / `<Grid>` draws a border and captions itself "Frame"

- **Diagram:** `examples/tcp-lifecycle.tldsl.jsx`
- **Severity:** ugly
- **Attempted:** Two lanes side by side - `<Row id="ladder">` holding two
  `<Col>` lanes - with no `name` on any of them, because none of the three is a
  thing the reader should see.
- **Happened:** All three rendered a visible border *and* the literal word
  "Frame" as a title, so the PNG carried three captions the author never wrote.
  The skill introduces `<Row> <Col> <Grid>` as the layout primitives and says
  they are "`<Frame>` with `layout` preset"; it does not say an unnamed one is
  captioned, and it mentions chrome-free containers only under `<Group>`, three
  rows further down the table. Switching all three to
  `<Group layout="row">` / `<Group layout="col">` fixes it, which is what the
  shipped diagram does - but a placeholder name should not be invented for a
  container whose author declined to name it.
- **Repro:** `examples/repro/d2-unnamed-frame-caption.tldsl.jsx`
- **Status:** open
- **Also seen:** T29 - `<Graph>` does it too, and `<Graph>` has no chrome-free
  alternative the way `<Row>`/`<Col>` have `<Group>`, so
  `examples/tcp-states.tldsl.jsx` ships with a stray "Frame" caption.

### D3. An attached `<Note>` covers the shapes and arrows to its right

- **Diagram:** `examples/tcp-lifecycle.tldsl.jsx`
- **Severity:** wrong
- **Attempted:** `<Note on="client-ack2">` to explain the 2 MSL wait next to the
  `TIME_WAIT` box it is about.
- **Happened:** The note is parked immediately to the right of its anchor and is
  wide enough to span the gap between the lanes, so in the render it covers the
  `ACK` arrow, that arrow's label, and the server lane's `CLOSED` box
  completely. A reader of the PNG cannot see that the server ever reaches
  `CLOSED`. The skill warns that an attached note is out of layout and "can land
  on top of something", but there is no way to say which side it should take, no
  way to cap its width, and `check` reports nothing. The failure mode is not
  cosmetic: the diagram silently omits a state.
- **Repro:** `examples/repro/d3-note-covers-shape.tldsl.jsx`
- **Status:** open

### D4. `layout="grid"` has one `gap` for both axes

- **Diagram:** `examples/tcp-lifecycle.tldsl.jsx`
- **Severity:** papercut
- **Attempted:** A two-column ladder needs its columns far apart (so the message
  labels have room) and its rows close together (so the ladder reads as one
  sequence). `<Grid cols="2" gap="200" rowGap="16">`.
- **Happened:** `error[ir/unknown-prop]: 'rowGap' is not supported on '<frame>'
  (allowed: id, name, direction, layout, gap, pad, cols, align, x, y, w, h,
  color)`. There is no `colGap` either, so the 200px chosen for the columns
  became 200px between every row and the first render was 7193px tall for ten
  rows - roughly 160px of dead space per row. The fix is to abandon `<Grid>` and
  nest two `<Col>`s inside a `<Row>`, which gets an independent gap per axis
  because they are two containers; the shipped diagram does that. It works, but
  it means the grid primitive is unusable for any grid whose two axes want
  different spacing.
- **Repro:** `examples/repro/d4-single-axis-gap.tldsl.jsx`
- **Status:** open

### D5. An edge from a shape to itself draws no loop

- **Diagram:** `examples/tcp-states.tldsl.jsx`
- **Severity:** blocker
- **Attempted:** `<Edge from="established" to="established" label="recv data / ACK" />`
  - the self-transition every state machine has, and the one thing the corpus
  has never asked for.
- **Happened:** `check` is clean and nothing is rejected, but no loop is drawn.
  The arrow is zero-length, and its label is stamped across the box's own label
  (`recv data / ACK` printed straight over `ESTABLISHED`); in the full diagram
  the label ends up detached at the top-left corner of the frame, sitting on the
  frame border with no arrow anywhere near it. A reader sees a caption floating
  over the drawing, not a transition. There is no `bend`, `loop` or anchor prop
  in the skill that would let an author draw one by hand either.
- **Repro:** `examples/repro/d5-self-transition.tldsl.jsx`
- **Status:** open

### D6. Arrow labels lose their spaces in the default `draw` font

- **Diagram:** `examples/tcp-states.tldsl.jsx`
- **Severity:** wrong
- **Attempted:** Transitions labelled in the standard `event / action` notation:
  `<Edge from="a" to="b" label="recv FIN / send ACK" />`.
- **Happened:** The label renders as `recvFIN/sendACK`. The spaces are drawn at
  roughly zero width, so the words run together and in `one two three` the
  letters of adjacent words actually collide. It is specific to arrows and to
  the default font: the identical string on a `<Box>` in the same `draw` font is
  spaced correctly, and `font="sans"` on the arrow renders `recv FIN / send ACK`
  properly. So the two-part `event / action` convention - the entire notation of
  a state diagram - is unreadable at default settings, and what the reader sees
  is not the string the author wrote. The shipped diagram passes `font="sans"`
  on every edge, which is a documented prop, and keeps the evidence here.
- **Repro:** `examples/repro/d6-arrow-label-spaces.tldsl.jsx`
- **Status:** open

### D7. `layout="auto"` does not lay the graph out

- **Diagram:** `examples/tcp-states.tldsl.jsx`
- **Severity:** blocker
- **Attempted:** `<Graph id="machine" direction="DOWN" gap="120">` around the
  eleven TCP states, with the twenty transitions as edges - exactly what the
  skill says `<Graph>` is for ("graph-shaped things with no natural reading
  order").
- **Happened:** None of the three inputs reaches the placement. A straight chain
  `a -> b -> c -> d` comes out as a 2x2 block rather than a line, so the edge
  topology is not used; rendering the same file with `gap="40"` and `gap="400"`
  produces byte-identical PNGs, and the boxes sit 20px apart either way (ELK's
  own default, which is what you get when the requested spacing never arrives);
  `direction="RIGHT"` and `direction="DOWN"` are likewise indistinguishable. The
  result looks like aspect-fitted grid packing, not a layered graph. Confirmed
  through `tldsl render`, not just the screenshot tool, so it is the product and
  not the harness. Consequence for the diagram: eleven states packed 20px apart
  with twenty labelled arrows between them, which is the illegible render this
  example ships.
- **Repro:** `examples/repro/d7-auto-ignores-graph.tldsl.jsx`
- **Status:** open

### D8. An auto container reserves no room for edge labels and routes arrows over its nodes

- **Diagram:** `examples/tcp-states.tldsl.jsx`
- **Severity:** ugly
- **Attempted:** Twenty labelled transitions inside the `<Graph>`.
- **Happened:** Arrows are drawn as direct lines between the two shapes - the
  adapter discards the routed geometry it asks ELK for - so a transition between
  non-adjacent states crosses whatever is in between, and its label lands at the
  midpoint on top of a box. Nothing reserves space for the label either: the
  same edge inside a `<Row>` widens the row's gap until the label fits
  (`labelClearanceGap`), and an auto container has no equivalent, so labels wrap
  into 2-3 character stacks and overprint each other and the states. In the
  shipped render `SYN / SYN+ACK` is broken across three fragments sitting on top
  of `SYN_RCVD`.
  Distinct from D7: fixing the node placement would shorten the chords but would
  still leave labels unaccounted for.
- **Repro:** `examples/repro/d8-auto-edges-cross-nodes.tldsl.jsx`
- **Status:** open
