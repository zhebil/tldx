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
