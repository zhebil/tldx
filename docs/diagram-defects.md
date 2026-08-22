# Diagram defects

What broke when tldsl was pointed at diagrams it was not designed around
(Phase 9). Authoring tasks fill this file; fix tasks drain it. An authoring wake
logs what it hit and moves on - it does not fix anything, and it does not
reshape the diagram to avoid the defect.

## Triage (T34)

Twenty-one entries, six diagrams, eight distinct mechanisms. Grouped below and
ordered by severity first, then by how many of the six Phase-9 diagrams each
group damages. This is not a papercut ledger: three entries are blockers and
four are `wrong`, and the top group touches every diagram in the corpus.

The four fix wakes T35-T38 take the top four rows. Everything below row 4 stays
open; nothing is struck, because nothing here turned out to be a design
decision.

| # | Group | Entries | Severity | Diagrams | Consumed by |
|---|---|---|---|---|---|
| 1 | **An edge is a straight segment between two shape centres, and that is the whole path model** | D1, D5, D14 (+ D21, D8 routing half) | blocker | 6 / 6 | **T35** - D1 and D5 fixed, D14 half fixed in `729f3bd` |
| 2 | **`layout="auto"` reaches ELK with none of its inputs** | D7 | blocker | 1 / 6 | **T36** - fixed |
| 3 | **An edge label is stamped at the geometric midpoint and nothing reserves room for it** | D13, D11, D8 (label half), D9 (clearance half) | wrong | 5 / 6 | **T37** - D13 and D11 fixed, D8's label half fixed; D9's clearance half open |
| 4 | **Arrow label text is measured and wrapped by a different path than box label text** | D6, D9 (wrap half) | wrong | 3 / 6 | **T38** - both fixed; D9's skip-edge clearance open |
| 5 | **A shape is sized by its own contents and the documented cap does not hold** | D3, D16, D20 | wrong | 3 / 6 | open |
| 6 | **The primitive set cannot say what the notation requires** | D17, D18, D2, D4 | ugly | 4 / 6 | open |
| 7 | **Sibling tiers are each sized to their own contents, so a layered stack is ragged** | D10 | ugly | 1 / 6 | open |
| 8 | **The toolchain is silent, and its diagnostics name elements the author did not write** | D15, D12, D19 | papercut | 6 / 6 | open |

### 1. The path model - D1, D5, D14, and half of D21 and D8 → T35

The single mechanism behind two blockers and a `wrong`. An edge resolves to one
straight segment between two shapes and nothing else is consulted - not the
other edges on the same pair, not the endpoints being the same shape, not what
lies between. Each entry is that one fact seen from a different angle:

- **D1** - *n* edges on the same pair produce *n* identical segments, so seven of
  eight TCP messages vanish and three labels smear into `SYNKACK`.
- **D5** - an edge to itself is a zero-length segment, so the self-transition
  every state machine has draws nothing and drops its label on the frame border.
- **D14** - the one separation rule that does exist scales with nothing useful:
  ~165px of bow on a 413px-apart pair (out of its frame and across a neighbour's),
  and none at all on a 130px-apart pair, which is D1's collapse again.
- **D21** and **D8**'s routing half are the obstacle-aware face of the same gap -
  a 1,100px chord through two frame borders and a box. Bigger job; stays open
  after T35.

**T35 takes D1, D5 and D14** - separation between edges on a shared pair, and a
loop for a self-edge. Those three are one mechanism and one wake. D21 and D8's
routing half remain open.

### 2. `layout="auto"` - D7 → T36

The only blocker not in group 1, and the narrowest: one diagram, one adapter.
None of the three inputs reaches placement - `a -> b -> c -> d` packs as a 2x2
block, `gap="40"` and `gap="400"` render byte-identical at ELK's 20px default,
and `direction` is inert. Ranked second on severity despite touching one
diagram, because the primitive advertised for "graph-shaped things with no
natural reading order" currently does aspect-fitted grid packing.

### 3. Edge-label placement - D13, D11, D8's label half, D9's clearance half → T37

The largest cluster by breadth and the one four separate authoring wakes each
rediscovered. The placement is unconditional: midpoint of the segment,
regardless of occupancy.

- **D11** - the label lands on a foreign shape. Three labels on one box in
  `c4-container`; `origin pull` across `app-3`; `rejected` on `Deploy to
  production`.
- **D13** - eight fan labels land in one 33px band and collide with *each other*,
  which no tool counts. `publishOrderPlacPaymenpublishPaymentCaptured`.
- **D9**'s clearance half - a row *does* widen its gap for an edge between
  adjacent children (`labelClearanceGap`), but the span it reserves is ~50px
  short, and it reserves nothing at all for an edge that skips a sibling.
- **D8**'s label half - an auto container has no `labelClearanceGap` equivalent
  at all.

The asymmetry is the finding: clearance exists for the easy case and is absent
for every other. **T37 should take D13 first** - it is the `wrong` one, and
labels colliding with each other is invisible to both `layout-report` and
`arrow-truth`.

**T37 took D13, D11 and D8's label half** with one `placeLabels` pass and gave
`arrow-truth` the missing counter. It moved the label rather than reserving
room for it, so D9's clearance half - a sizing question, in the container, not
in the router - is untouched and stays open.

### 4. Arrow-label text - D6, D9's wrap half → T38

The only group where the render shows a string the author did not write, which
is why it outranks group 5 at equal breadth. Spaces draw at ~zero width
(`recv FIN / send ACK` → `recvFIN/sendACK`) and single words break mid-word
(`dequeue` → `dequeu`/`e`). Both are the failure T0 fixed for box labels, in a
code path T0 never reached; the same string on a `<Box>` in the same font is
correct. T32 killed the `font="sans"` workaround - the loss survives it, and is
uneven *within* one label, which is what justification with no word-spacing
budget looks like.

**T38 fixed both, and they were two unrelated mechanisms.** The vanishing
spaces are an export race, not a layout bug: a box label exports as HTML inside
a `<foreignObject>` and the browser lays it out, but an arrow label exports as
a `<text>` of absolutely-positioned `<tspan>`s whose `x` values tldraw measures
in the DOM at export time (`SvgTextLabel` → `measureTextSpans`). `tldsl render`
called `editor.toImage` as soon as a shape existed, before the webfont had
loaded, so every `x` was a fallback-`sans-serif` advance while the SVG embedded
and drew the real `tldraw_draw` - words placed on narrow-font slots and drawn in
a wide font overprint each other. The mid-word wrap is the clearance shortfall
D9 describes, measured exactly. Neither touches the wrap logic itself, which
was always correct.

### 5-8. Open after T38

- **5. Sizing caps (D3, D16, D20).** `wrong`, because D3 deletes a state from the
  render. One prop failing three ways: `maxW` rejected on `<Note>`/`<Sticky>`
  though documented there, `maxW` accepted and ignored on a diamond that is a row
  child (492px against a 200px cap), and the only cap that works is `w`, a
  hand-tuned coordinate the skill tells authors never to write.
- **6. Notation gaps (D17, D18, D2, D4).** Four independent missing props, each
  small and each blocking a standard notation: no `dash` on `<Frame>` (so a C4
  boundary is a hairline while the external systems are boldly dashed), no
  `person` or `cylinder` in `geo` (but `heart` and `star` are there), an unnamed
  container captioning itself "Frame", one `gap` for both grid axes.
- **7. Stretch (D10).** `align="stretch"` is rejected, so four tiers of a layered
  architecture come out 540/520/1569/616px wide and the horizontal bands that
  carry the reading are destroyed.
- **8. The toolchain (D15, D12, D19).** `check` validates the IR, not the
  diagram: it printed nothing on a render that had lost three of its four topics.
  Not one of these 21 defects was found by `check` - every one was found by
  looking at a PNG. Alongside it, diagnostics name `<frame>` and `<note>` for
  elements written as `<Group>` and `<Sticky>`, and a `\n` in a label attribute
  renders as two literal characters with no diagnostic.


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
- **Also seen in:** `examples/event-driven.tldsl.jsx` (T31). The collapse is not
  limited to a stack of same-direction arrows: `t-orders -> payments` and
  `payments -> t-orders` are antiparallel and adjacent, and `arrow-truth` puts
  them `97% within 8px` of each other. See D14 - the separation mechanism that
  should have caught this fires far too hard on distant pairs and not at all on
  near ones.
- **Status:** fixed in `729f3bd` (T35). Edges sharing an unordered endpoint pair
  that get no obstacle route are fanned into distinct perpendicular lanes.
  `arrow-truth` on the repro: crowded arrow pairs 3 -> 0, and the three labels
  render as `SYN` / `SYN-ACK` / `ACK` instead of one `SSYNACK` smear. The same
  fan takes `event-driven`'s `t-orders` / `payments` pair from `97% within 8px`
  to crowded pairs 0.
  **Not fixed:** ordering. An arrow still has no rank, so the fan reads 1..n
  only by geometry.

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
- **Also seen in:** `examples/event-driven.tldsl.jsx` (T31), worse. The note is
  attached to the leftmost of four topic boxes in a row and its text is one
  sentence, but it renders 549px wide - it covers `t-payments` and
  `t-inventory` entirely and clips `t-shipments`. Three of the diagram's four
  topics are gone from the PNG, and `layout-report` counts this as three of its
  four `overlapping shape pairs` while `check` says nothing (D15). One
  correction to the entry above: there **is** a width cap - `w` is in `<note>`'s
  allowed prop set and `w="200"` does narrow it. It is not a fix. It is a
  hand-tuned coordinate, the thing the skill says you never write, and it only
  rotates the problem: the same sentence at `w="200"` becomes 242px tall and
  covers its neighbour vertically instead of horizontally, still 3 overlapping
  pairs. The documented cap, `maxW`, is rejected outright - see D16.
- **Status:** fixed (T43) - two changes, neither a hand-tuned coordinate. A
  default measure: a plain `<Note>`'s own width now wraps to a fixed 260px
  reading measure instead of the same unbounded, aspect-6 box-fitting used for
  shape labels in a shared-width row/column (`NOTE_MEASURE_PX` in
  `layout/defaults.ts`). A placement rule: `attach.ts`'s side-picker now
  slides ("pushes") a candidate further along its chosen side past whichever
  obstacle is still in its way, instead of rejecting the whole side on the
  first thing it touches - a note beside a tightly-wrapped row now clears the
  row's own frame, not just its immediate neighbour. `d3-note-covers-shape`
  and `event-driven` both drop to 0 `layout/shape-overlap` and
  `layout/label-overlap` warnings; `tcp-lifecycle`'s render shows the server
  reaching `CLOSED`.

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
- **Status:** fixed in `729f3bd` (T35). `from === to` now routes to a loop over
  the shape's top edge - precise anchors at `0.75/0` and `0.25/0`, bend scaled
  off the shape width - so the repro draws a real arch with its arrowhead landing
  back on the box, and the label sits above the shape instead of across its own
  text. tldraw honours `normalizedAnchor` on both terminals of a double-bound
  arrow, so no new primitive was needed. The loop always goes above the shape and
  nothing reserves room for it; in `tcp-states` it lands in the pile D7 makes of
  that diagram.

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
- **Also seen in:** `examples/c4-container.tldsl.jsx` (T32), which **corrects
  the font claim above**. Every edge in that file carries `font="sans"` and the
  spaces still go: `Reads from and writes to [JDBC]` renders `Reads from` /
  `and writesto`, `Visits bigbank.com/ib using [HTTPS]` renders
  `bigbank.com/ibusing`, `Sends e-mail using [SMTP]` renders `Sends e-mailusing`.
  Verified at native resolution, not on a downscaled export. `sans` is not a
  workaround, it only makes the loss less frequent - and the loss is uneven
  within one label, some gaps widened and others closed, which is what a
  justification pass with no word-spacing budget looks like. See also D9, which
  saw the same thing in `streaming replication`.
- **Status:** fixed in T38. Not a font bug and not a measurement bug - an export
  race. A `<Box>` label leaves `editor.toImage` as HTML in a `<foreignObject>`,
  so the browser lays it out and the spaces are whatever the font says. An arrow
  label leaves as a `<text>` whose `<tspan>`s each carry an absolute `x`, and
  those `x` values come from `SvgTextLabel` calling `measureTextSpans` on a
  hidden DOM node **at export time**. `tldsl render` fired `toImage` as soon as
  the first shape was attached, before `tldraw_draw` finished loading, so the
  spans were measured in the fallback `sans-serif` (`one`=33.37, space=5.56)
  and then drawn in `tldraw_draw` (`one`=37.20, space=6.86) which the SVG
  embeds - every word starts ~11% too far left of where its glyphs need to be,
  and each word overruns into the next. That explains the two things the font
  story could not: why `font="sans"` only *reduced* the loss (`tldraw_sans` is
  closer to the fallback than `tldraw_draw` is, not immune to it), and why the
  loss is uneven within one label (the error is cumulative per word, not per
  space). `exportImage` now awaits `editor.fonts.loadRequiredFontsForCurrentPage()`
  and `document.fonts.ready` before `toImage`. Every corpus and example render
  with a multi-word arrow label reads correctly after it - `examples/tcp-states`
  is now `recv SYN / SYN+ACK` throughout.

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
- **Status:** fixed in T36. One cause behind all three symptoms: the auto
  container collected edges only from its **own subtree**, and in every
  `layout="auto"` file that renders badly the `<Edge>` elements are siblings of
  the `<Graph>`, not children of it. ELK therefore received a graph with zero
  edges, and `layered` with no edges degenerates to component packing - which
  reads `elk.spacing.componentComponent` (default 20) instead of
  `elk.spacing.nodeNode`, and has no direction to honour. The auto branch of
  `layoutContainer` now resolves owners against the document-wide edge list that
  was already threaded down for label clearance, and the adapter sets
  `componentComponent` to the requested gap as well. `tcp-states` goes from 13
  crossings / 5 crowded pairs / 31 label overlaps to 5 / 1 / 4 and reads as a
  layered state machine. What is left in that diagram is labels, not placement -
  D8 and D13 still stand.

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
- **Status:** label half fixed in T37 (repro 2 label-over-shape pairs -> 1,
  `examples/tcp-states` 4 -> 2 and its 2 label-label collisions -> 0). An auto
  container still reserves no space for a label; what changed is that the label
  moves to where the space already is. The routing half - the adapter discards
  ELK's routed geometry, so a transition still crosses whatever is between its
  endpoints - stays open with D21.

### D9. An edge label wraps mid-word, and the row's label clearance is short by ~50px

- **Diagram:** `examples/web-architecture.tldsl.jsx`
- **Severity:** ugly
- **Attempted:** `<Edge from="queue" to="worker" label="dequeue" />` between two
  boxes sitting next to each other in a `<Row gap="96">` - the plainest possible
  labelled arrow.
- **Happened:** The label renders as `dequeu` over `e`. A single seven-letter
  word is broken across two lines mid-word, which is exactly the failure T0
  fixed for box labels (`Gatewa`/`y`); it never reached arrow labels. The same
  arrow between the same two boxes with `gap` removed entirely renders
  identically, and so do `gap="120"` and `gap="144"` - it only comes right
  between 144 and 160. So the `labelClearanceGap` D8 describes is real but too
  small: it reserves a span the label does not fit in, and the author's only
  recourse is to guess a wider `gap` and re-render until the word stops
  breaking. A second symptom of the same crushing: `streaming replication` on
  the primary-to-replica arrow renders `streamingreplication`, space collapsed,
  in `font="sans"` (D6 is the `draw`-font version and has a font workaround;
  this one does not - `sans` is already the workaround).
- **Repro:** `examples/repro/d9-arrow-label-mid-word-wrap.tldsl.jsx`
- **Status:** wrap half and adjacent-pair clearance fixed in T38; skip-edge
  clearance still open. tldraw squishes a horizontal arrow's label to
  `max(min(w, 64), min(bodyWidth - 64, w))` and re-measures at that width, so
  the label wraps unless the arrow **body** is at least `w + 64` long
  (`arrowLabel.ts`). `labelClearanceGap` reserved exactly `labelWidth + 64` on
  the *gap*, but the body is shorter than the gap: `straight-arrow.ts` pulls the
  end terminal back by `BOUND_ARROW_OFFSET` (10) plus half the arrow's stroke
  and half the bound shape's (1.75 each at size `m`). `dequeue` needed a 136.2px
  body and got 127.4 - the ~50px in the title above was an eyeball, the real
  shortfall was 8.8px of body. `ARROW_LABEL_MARGIN` is now `64 + 13.5` and the
  repro renders `dequeue` on one line, as does `streaming replication` in
  `web-architecture`. The second half of this entry - a row reserves *nothing*
  for an edge that skips a sibling - is untouched: `labelClearanceGap` still
  bails on `Math.abs(from - to) !== 1`.

### D10. Sibling tiers in a column are each sized to their own contents, so a layered stack is ragged

- **Diagram:** `examples/web-architecture.tldsl.jsx`
- **Severity:** ugly
- **Attempted:** The everyday layered picture - `Edge`, `App tier`, `Data`,
  `Async` as four named frames stacked in a column inside one system boundary.
- **Happened:** Each frame is sized to its own children and then centred, so the
  four tiers come out 540px, 520px, 1569px and 616px wide inside a 1633px
  boundary, with nothing lined up on either side. A layered architecture diagram is read by its horizontal
  bands; ragged bands of three different widths destroy that reading, and the
  widest tier silently sets the system boundary's width while the others float
  inside it. `align="stretch"` on the parent is the obvious fix and is rejected:
  `error[ir/bad-align]: 'align' must be one of start, center, end`. Neither
  `<Layers>` nor `<Swimlanes>` is documented as changing this, and the skill has
  no other lever - `maxW` caps a label, not a frame.
- **Repro:** `examples/repro/d10-tiers-not-stretched.tldsl.jsx`
- **Status:** open

### D11. A cross-tier edge's label is stamped at the midpoint, on top of whatever is there

- **Diagram:** `examples/web-architecture.tldsl.jsx`
- **Severity:** ugly
- **Attempted:** `cdn -> objects` ("origin pull"), an ordinary edge that skips
  the app tier, plus `app-tier -> queue` ("enqueue") which skips the data tier.
- **Happened:** The label goes at the geometric midpoint of the arrow with no
  regard for what occupies that point. `origin pull` lands across `app-3`'s
  label in the shipped render (across `app-1` and `app-2` in the repro, which is
  narrower), and `enqueue` lands on the `Postgres primary` ellipse. Both pairs
  of words overprint and neither is readable. This is D8's second half seen
  outside an auto container: the placement is unconditional, so any edge long
  enough to cross a tier will do it.
- **Repro:** `examples/repro/d11-edge-label-over-shape.tldsl.jsx`
- **Also seen in:** `examples/c4-container.tldsl.jsx` (T32), where the same
  unconditional placement puts **three** labels on one box. `arrow-truth`:
  `label-overlap: c030096a-0 over mobile-app`, `c99fd976-0 over mobile-app`,
  `d5654050-0 over mobile-app` - the SPA's API call, the staff member's mainframe
  access and the e-mail back to the customer all have their midpoint inside
  `Mobile App`, so its own three-line label is under three foreign ones. Note
  the asymmetry with D9: a row *does* widen its gap to clear the label of an
  edge between two **adjacent** children, and reserves nothing at all for an
  edge that skips one.
- **Status:** fixed in T37, by the same `placeLabels` pass as D13. The repro
  goes 2 label-over-shape pairs -> 0 and `c4-container` 3 -> 1; in
  `web-architecture` `origin pull` comes off `app-3` but lands a line above
  `charge`, so that file's counters hold at 1 while reading better. Sliding
  along the arrow cannot help when the whole arrow is inside the shape's span,
  which is what `c4-container`'s remaining `Mobile App` pile is.

### D12. `<Group>` requires an `id`, the skill does not say so, and the error names `<frame>`

- **Diagram:** `examples/web-architecture.tldsl.jsx`
- **Severity:** papercut
- **Attempted:** `<Group layout="row" gap="160">` to hold the browser and the
  external payment API side by side outside the system boundary - `<Group>` is
  the documented way to get a row with no chrome (it is the workaround D2 names).
- **Happened:** `error[ir/missing-id]: '<frame>' is addressable and requires an
  explicit 'id'`. Two things cost time here. The skill's component table writes
  `<Frame id name>` and `<Box id label>` with their required props but `<Group>`
  with none, and the prose says a `<Group>` is the one container nothing may
  point an edge at - so an id looks pointless. And the diagnostic names
  `<frame>`, a component that does not appear anywhere in the file, so the
  reported location is the only way to tell which element it means.
- **Repro:** `examples/repro/d12-group-requires-id.tldsl.jsx` (compiles, as every
  repro here does; the comment in it says which line to delete to get the error)
- **Status:** diagnostic half fixed in `ee8ec31` (T44) - `ir/missing-id` now
  names the JSX tag the author wrote (`<Group>`, `<Row>`, ..., all eight
  aliases plus plain `<Frame>`) instead of `<frame>`. The skill half was
  already fixed in T39; see "Also seen" below.
- **Also seen:** T39 - the rule is not `<Group>`'s, it is every container's. All
  eight aliases (`<Row> <Col> <Grid> <Group> <Pipeline> <Layers> <Swimlanes>
  <Graph>`) reject a missing `id` with the identical `<frame>` message, and the
  component table carried required props on `<Frame>` and `<Box>` only. This is
  what failed T39's blind re-test: an agent given nothing but the skill and the
  sentence "draw the OSI seven-layer model with an example protocol at each
  layer" wrote a clean seven-tier `<Layers>` stack and `check` rejected it on
  line 6 for the one prop the skill never asked for. Adding `id="osi"` - one
  attribute, no other change - makes it compile clean and render legibly. The
  severity is worth restating on that evidence: as a papercut it costs a known
  author a minute, but it is the sole thing standing between a first-time author
  and a working diagram, and the diagnostic names an element they did not write.
  Fixed in the **skill** in T39 (a non-negotiable rule plus `id` in every table
  row); the diagnostic naming `<frame>` is untouched and this entry stays open
  for it.

### D13. Parallel edge labels are stamped at their own midpoints and overprint each other

- **Diagram:** `examples/event-driven.tldsl.jsx`
- **Severity:** wrong
- **Attempted:** The ordinary event-bus idiom: a row of four services above a
  row of four topics, with eight edges between them carrying the event names -
  `publish OrderPlaced`, `subscribe`, `PaymentRefunded`, and so on.
- **Happened:** Every label goes at its own edge's midpoint, and because all
  eight edges span the same gap between the two rows, all eight labels land in
  one 33px-tall band at y 143-155. `arrow-truth` gives their boxes: `publish
  OrderPlaced` at x 79.5-256.5, `PaymentRefunded` at 224.7-386, `subscribe` at
  252.7-341.6, `publish PaymentCaptured` at 291.3-514.3, `subscribe` at
  346-434.9, `subscribe` at 394.5-483.4, `ShipmentFailed` at 504.6-642.6,
  `publish StockReserved` at 561.1-758.5, `subscribe` at 639.6-728.5. Seven of
  the nine overlap a neighbour. The render is a single run of glyphs -
  `publishOrderPlacPaymenpublishPaymentCaptured` and `subscsubscribe` - so the
  reader reads strings that are not any of the labels. This is not D11: nothing
  is behind these labels, they collide with **each other**, and no tool counts
  that. `layout-report`'s `overlapping shape pairs` ignores label boxes and
  `arrow-truth` only checks label-versus-shape, so the diagram measures clean
  on both while being unreadable.
- **Repro:** `examples/repro/d13-fan-labels-collide.tldsl.jsx`
- **Status:** fixed in T37. `computeEdgeRoutes` ends in a `placeLabels` pass
  that slides each label along its own arrow to the nearest-to-midpoint spot
  clear of every other label and of any non-endpoint box or note, via tldraw's
  `labelPosition`. `arrow-truth` gained the counter this defect needed
  (`arrow labels overlapping another label`): the repro goes 2 -> 0 and
  `examples/event-driven` 12 -> 4.

### D14. Antiparallel edges are separated by a bow that is huge when it should be small and absent when it should be there

- **Diagram:** `examples/event-driven.tldsl.jsx`
- **Severity:** ugly
- **Attempted:** Two antiparallel pairs, both natural in an event topology.
  `t-payments -> dlq` ("3 failed retries") with `dlq -> t-payments` ("redrive")
  is the dead-letter loop; `t-orders -> payments` ("subscribe") with
  `payments -> t-orders` ("PaymentRefunded") is a service reading a topic and
  compensating back onto it.
- **Happened:** The same mechanism mis-fires in both directions. The
  dead-letter pair is 413px apart and nearly vertical, and both arcs bow ~165px
  **left** of the straight line - out of the bus frame, across the `Derived
  consumers` frame, and back - so their two labels land at (105.3,447.6) and
  (116.4,445.9), overlapping each other and sitting on top of `Notification
  service` (`arrow-truth`: `arrow labels overlapping a non-endpoint shape: 2`).
  The adjacent pair gets the opposite treatment: `arrow-truth` reports
  `ca51e353-0 / f256ec69-0 (97% within 8px)` - no separation at all, the two
  arrows are one line for 97% of their length, which is D1's collapse on a pair
  that is 130px apart. So separation exists but scales with nothing useful:
  distant pairs are flung into a neighbour's frame, adjacent pairs get nothing.
- **Repro:** `examples/repro/d14-antiparallel-bow.tldsl.jsx` (both cases in one
  file)
- **Status:** half fixed in `729f3bd` (T35). The adjacent case (`c` / `d`) is
  fixed: the shared-pair fan gives it two visibly separate arcs, crowded pairs
  1 -> 0 on the repro. **The distant case (`a` / `b`) is unchanged** - both arcs
  still bow ~165px out of the frame, because that bow is the obstacle-clearance
  requirement of a box wider than its own frame, not a separation artefact. The
  fan only fires for edges the obstacle pass declined, so it never sees that
  pair. That half belongs to D21.

### D15. `check` is clean on a diagram that has lost three of its shapes

- **Diagram:** `examples/event-driven.tldsl.jsx`
- **Severity:** papercut
- **Attempted:** `tldsl check`, then claiming the diagram was done - the skill
  says "`check` before you claim it is done", and the only other instruction is
  to look at the PNG.
- **Happened:** `check` printed nothing at all on a diagram where a `<Note>`
  549px wide covers `t-payments` and `t-inventory` completely and clips
  `t-shipments`, eight arrow labels overprint each other, 11 of 17 arrow paths
  cross a shape they do not connect, and there are 14 edge-edge crossings. The
  information exists - `layout-report` says `overlapping shape pairs: 4` and
  `arrow-truth` says `arrow paths crossing a non-endpoint shape: 11` - but
  neither is `check`, neither runs in the workflow the skill documents, and
  neither is mentioned in the skill. Every other defect in this ledger was found
  by rendering a PNG and reading it with human eyes; `check` has never once
  been the thing that caught one. It validates the IR, not the diagram.
- **Repro:** `examples/repro/d15-check-silent-on-occlusion.tldsl.jsx`
- **Status:** fixed in `380823a` (T41). `check` now runs two scene-JSON-computable
  occlusion checks after layout and reports them as warnings (exit code
  unchanged): a shape's rect covering another shape's, and a labelled edge's
  placed label rect covering a shape it doesn't connect to. `check
  examples/event-driven.tldsl.jsx` now names all four overlapping pairs (the
  saga note over `bus`, `t-payments`, `t-inventory`, `t-shipments`) that
  `layout-report`'s `overlapping shape pairs: 4` already knew about. The arrow
  counters (`arrow-truth`, needs a real browser render) stay out of `check` -
  the `8 arrow labels overprint each other` / `11 of 17 arrow paths cross a
  shape` numbers are unchanged.

### D16. `maxW` is documented on `<Note>` and `<Sticky>` and rejected by `check`

- **Diagram:** `examples/event-driven.tldsl.jsx`
- **Severity:** papercut
- **Attempted:** `<Note on="t-orders" maxW="160">` to stop the saga note
  spreading across the whole bus (D3). The skill's Style section heads its list
  "On `<Box>` / `<Note>` / `<Sticky>`" and `maxW - caps how wide a label may run
  before wrapping` is the last item in it, so this is the documented lever and
  the obviously right one.
- **Happened:** `error[ir/unknown-prop]: 'maxW' is not supported on '<note>'
  (allowed: id, on, x, y, w, h, color, textAlign, verticalAlign, labelColor,
  font, size)`. Identical for `<Sticky>`, which also reports itself as
  `<note>` - the same "the diagnostic names an element that is not in the file"
  confusion as D12. The allowed set does contain `w`, so the capability exists
  under a different name; the skill documents the one prop that does not work
  and does not mention the one that does. Either the prop or the sentence is
  wrong, and an author cannot tell which without running `check`.
- **Repro:** `examples/repro/d16-note-maxw-rejected.tldsl.jsx` (compiles, with
  the comment naming the prop to add back)
- **Status:** open. The naming half is fixed in `ee8ec31` (T44) - the
  `ir/unknown-prop` message now says `<Note>` or `<Sticky>` (whichever the
  author wrote) instead of `<note>`; whether `maxW` should be accepted at all
  is untouched and stays open for T45.

### D17. A `<Frame>` cannot be a C4 boundary: no `dash`, and its name is the smallest text on the canvas

- **Diagram:** `examples/c4-container.tldsl.jsx`
- **Severity:** ugly
- **Attempted:** `<Frame id="ibs" name="Internet Banking System" dash="dashed">`
  around the five containers. The dashed boundary is not decoration in C4 - it
  is the notation that says "this is the system we are talking about, everything
  outside it is somebody else's", and it is the one line every C4 diagram has.
- **Happened:** `error[ir/unknown-prop]: 'dash' is not supported on '<frame>'
  (allowed: id, name, direction, layout, gap, pad, cols, align, x, y, w, h,
  color)`. `color` is the only style a frame takes, so there is no way to draw
  the boundary differently from any other container. What ships is worse than
  neutral: a `<Box dash="dashed">` **is** allowed, so in the render the two
  external systems are boldly dashed while the boundary is a hairline solid
  rectangle - C4's emphasis exactly inverted. The name is drawn in small system
  text above the top-left corner, ~30px tall on a 5824x2820 export, which makes
  the most important string in the diagram the smallest one on it.
- **Repro:** `examples/repro/d17-frame-boundary-undashed.tldsl.jsx` (compiles;
  the comment says which prop to add to get the error, and rendering it shows
  the dashed external box beside the hairline boundary)
- **Status:** open

### D18. `geo` has no `person` and no `cylinder`, the two shapes C4 mandates

- **Diagram:** `examples/c4-container.tldsl.jsx`
- **Severity:** ugly
- **Attempted:** `geo="person"` on the two actors and `geo="cylinder"` on the
  database. C4 identifies elements by shape before you read a word of them: a
  person is a stick figure or a head-and-shoulders box, a datastore is a
  cylinder.
- **Happened:** Both rejected with `error[ir/invalid-style-value]: 'geo' must be
  one of arrow-down, arrow-left, arrow-right, arrow-up, check-box, cloud,
  diamond, ellipse, heart, hexagon, octagon, oval, pentagon, rectangle,
  rhombus-2, rhombus, star, trapezoid, triangle, x-box`. The set is tldraw's geo
  shapes verbatim, and it contains `heart` and `star` but neither of the two
  shapes the most widely used architecture notation is built on. Both fell back
  to `geo="ellipse"` plus a colour, so in the render a person and a database are
  the same shape as each other, distinguished only by blue versus green.
- **Repro:** `examples/repro/d18-no-person-or-cylinder-geo.tldsl.jsx`
- **Status:** open

### D19. A `\n` in a label attribute renders as the characters `\n`, and multiline labels are undocumented

- **Diagram:** `examples/c4-container.tldsl.jsx`
- **Severity:** papercut
- **Attempted:** A C4 element is three lines - name, bracketed type, one-line
  description - so every box wanted a multiline label. The obvious thing to
  write is `label="Web Application\n[Container: Java, Spring MVC]\nDelivers the
  SPA."`.
- **Happened:** `check` accepts it with no diagnostic and the box renders the
  two literal characters `\` and `n` in the middle of its text. That is JSX
  behaviour - a string *attribute* does not process escapes - but the tool sees
  a label containing a backslash and an `n` and says nothing about it, and the
  render is the first place anyone finds out. The working form is
  `label={"a\nb"}` and it wraps correctly on three lines; `maxW` on a `<Box>`
  is accepted and wraps within each line (unlike on `<Note>`/`<Sticky>`, D16).
  Neither multiline labels nor the expression form appears anywhere in
  `skills/tldsl/SKILL.md`, which shows `maxW` only as "caps how wide a label may
  run before wrapping" - so the one prop the author needs to write a C4 box is
  found by experiment.
- **Repro:** `examples/repro/d19-literal-newline-in-label.tldsl.jsx` (both forms
  side by side; both pass `check`, only one is a label)
- **Status:** open

### D20. `maxW` holds on a rectangle and is ignored on a diamond

- **Diagram:** `examples/cicd-pipeline.tldsl.jsx`
- **Severity:** ugly
- **Attempted:** The two decision points in a pipeline are diamonds, and like
  every other box in the file they were given `maxW="200"` so the row would not
  stretch into one long line (the lever T32 found).
- **Happened:** The rectangles obeyed - 159 to 195px wide. The two diamonds did
  not: `quality-gate` came out 369px and `health-gate` **492px**, 2.5x its own
  cap, with `error rate < 1% for 10 min` on a single unwrapped line. Isolated in
  the repro: the identical label with the identical `maxW="200"` renders 188x152
  as a rectangle and **492x320** as a diamond. It is not the inscribed-rectangle
  factor - a diamond alone in a `<Doc layout="col">` with the same label and cap
  renders 200 wide, so the width survives until the box is a row child. The
  knock-on is the row height: the oversized diamond drags every sibling in its
  row from 152 to 320px tall, which is why `Commit` is a 310px-tall rectangle
  holding four words.
- **Repro:** `examples/repro/d20-maxw-ignored-on-diamond.tldsl.jsx`
- **Status:** open

### D21. A cross-container edge is a straight chord, and a backwards one is the worst case

- **Diagram:** `examples/cicd-pipeline.tldsl.jsx`
- **Severity:** wrong
- **Attempted:** The two paths that make a pipeline a pipeline rather than a
  list: `notify -> commit` ("fix and re-push") returning from the off-ramp row
  to the first stage, and `rollback -> deploy-prod` re-entering the delivery row
  from below. Also the three converging failure edges into `notify`.
- **Happened:** Every edge whose endpoints sit in different containers is drawn
  as a straight line between the two shapes and nothing else is consulted.
  `notify -> commit` is a 1,100px chord from (476,1449) to (227,354): it enters
  the `cd` frame through its bottom border, passes through `Staging smoke
  tests`, leaves through the top border and enters the `ci` frame the same way.
  `quality-gate -> notify` and `approval -> notify` cut the same frame
  diagonally, and `approval -> notify` parks the word `rejected` on top of
  `Deploy to production` - `layout-report` counts 3 edges crossing a frame
  boundary they do not belong to and `arrow-truth` 6 paths crossing a
  non-endpoint shape. There is no routing prop, no waypoint syntax and no
  orthogonal option in the skill, so an author has exactly one lever: move the
  boxes.
  **The prediction in the task did not hold, and the correction matters for the
  fix.** The short backwards edge was expected to be the disaster and is fine -
  `rollback -> deploy-prod` is 159px, goes up and in cleanly, and the render is
  the better for it. What breaks is *length*, not direction: a chord is
  survivable while it runs with the layout axis over a short span, and a
  backwards edge is simply the reliable way to produce a long one.
- **Repro:** `examples/repro/d21-backward-edge-is-a-chord.tldsl.jsx`
- **Status:** open
