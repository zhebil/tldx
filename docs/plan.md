# tldsl layout plan

The ordered worklist for the layout loop. **This file is the only state that
survives between sessions.**

Work the topmost unchecked task. Do not pick. Do not reorder. Do not invent a
task that is not written here - if you think of one, append it to **Discovered
work** at the bottom and carry on with the top item.

There is no A/B judge. Every task below carries an acceptance criterion that a
tool can check. If a task's criterion cannot be measured, that is a defect in
the task, not a licence to guess: write the problem into the task and stop.

Branch: `ralph/jsx-layout`. Never work on `main`.

---

## Why this file replaced the old one

The previous regime ran 45 wakes of self-generated hypotheses, each judged by a
blind A/B model. It produced six kept changes, three of which were the same idea
tuned three times, and the rendered output barely moved between wake 12 and wake
45. Two whole lines of enquiry were declared closed as dead ends.

The reason was not the loop. It was that every measurement it took was taken
against broken geometry. `estimatedBoxSize` assumed 9px per character where the
real value is 14, and reserved 48px of padding where tldraw's own label padding
is exactly 32. Boxes were roughly 40% too narrow, so nearly every short label
wrapped mid-word - `OrdersRepo` rendered as `OrdersR/epo`, `Worker 1` as
`Worker/1`. Twenty wakes went into tuning the gaps between rows of boxes whose
labels were broken in half.

That is fixed (commit `2484ffa`). The consequences for the record:

- **Every arrow-crossing count in `docs/layout-hypotheses.md` is stale.** They
  describe geometry that no longer exists.
- **`docs/baselines/wake-*` and `docs/layout-champion.md` are stale** for the
  same reason. Do not read them as current. They are kept only as history.
- **The two "closed" lines are re-opened**, not because their reasoning was
  wrong but because their evidence was. See T17 and T18.

`docs/layout-hypotheses.md` stays as an archive of negative results. It is worth
reading before proposing anything new, so the same wall is not walked into
twice. **Do not append to it.** This file is the record now.

---

## The arrow problem, diagnosed

Every remaining visible defect in the corpus is an arrow drawn through a shape
it does not connect to. The mechanism is uniform, and it is worth stating
precisely because it determines which fixes can possibly work.

1. Layout places N nodes on a line - a `row`, a `col`, or one row of a `grid`.
2. An edge between two nodes that are **not adjacent on that line** is a chord
   of the line.
3. `bend` is hardcoded to `0` in `src/contracts/builders.ts:226`, so every arrow
   is a straight segment.
4. A straight chord passes through every node between its endpoints. Always.

Call this a **same-axis skip edge**. Examples in the current corpus:

| File | Edge | Crosses |
|---|---|---|
| `wide-fanout` | `dispatcher → worker-5` | workers 1, 2, 3, 4 |
| `multi-region` | `use1-api → use1-db` | Worker pool, Redis cache |
| `long-labels` | `api → rate-limiter` | the auth box |

This is a **routing** failure, not a placement failure. No arrangement of nodes
on a line avoids it, because the nodes are correctly adjacent and the edge
correctly skips them. Widening the gaps *between rows* - which is what the
kept B25/B32/B33 family does - cannot touch a chord that runs *along* a row.

Two levers can:

- **Curvature.** tldraw's arc arrows take a `bend: number` that bows the path
  off the straight line. It has never been tried. Not once in 45 wakes, not as
  a hypothesis, not as a backlog entry. It is hardcoded to zero.
- **Exit point.** `normalizedAnchor` moves where the arrow leaves and enters a
  shape.

Eight hypotheses changed the exit point and all eight failed (B3, B4a, B13,
B14, B15, B24, B27, B31). **That is explained by the diagnosis above**: moving
the exit point from centre to side changes where a straight line starts, not
where it goes. A side-anchored straight chord still crosses everything between
its endpoints - it just crosses at a slightly different angle. The exit point is
only useful in combination with a route that leaves the axis.

The two together are how a person draws this by hand: leave the side of the
box, bow out past the stack, come back in on the side of the target. That is
T3 and T4 below, and T4 is the reason T3 comes first rather than being skipped.

---

## Do we fix the diagrams or fix the layout?

Both, and the order matters. The honest split:

**Fix the routing (T2-T5).** Most crossings are same-axis skips, and those are
the tool's fault under any corpus. A user who writes a `col` of four services
and an edge that skips one has written something reasonable and should get a
readable diagram.

**Fix the placement (T6-T8), and the look (T9-T12).** Some crossings *are* the tool's placement
choice. `wide-fanout` puts eighteen targets of a single source into
reading-order grid rows, so one node fires eighteen chords across the whole
canvas. No amount of curvature rescues that; a fan wants to be laid out as a
fan. Notes and whitespace are the same category - nothing is crossing, the
arrangement is just wrong.

**Fix the corpus (T13), but not to win.** The current corpus is stress fixtures
being used as taste samples. `wide-fanout` is eighteen identical `Worker N`
boxes; `long-labels` is six paragraph-length sentences. Nobody draws those.
They are excellent for measuring - they exaggerate exactly the defects we care
about - and useless for answering "does this look good". Keep them as gates.
Add diagrams that look like what people actually draw, and use *those* to judge
whether output is good.

**Never edit an existing corpus fixture to make a task pass.** That is the one
change that silently invalidates every measurement downstream of it. Adding new
fixtures is fine and is T13; changing old ones is not.

---

## How a wake works

1. Read this file. Read `AGENTS.md` and `CONTEXT.md`.
2. Take the topmost unchecked task.
3. Build it. Delegate the code to a sonnet subagent; review the diff yourself.
4. Check the acceptance criterion with the tool the task names. If it fails,
   the task is not done - either fix it or record why it cannot be met and
   leave the box unchecked.
5. `npm run check` green.
6. Re-render `docs/renders/` and update `docs/baseline.md` if geometry moved.
7. Tick the box, write two or three sentences under the task saying what was
   built and what the numbers did. Append anything you noticed to **Discovered
   work**.
8. Commit. Stop.

If a task turns out to be a no-op or a bad idea once you are inside it, say so
in writing under the task, tick it as **struck**, and stop. Do not silently
substitute a different task.

### Tools

| Command | What it gives you |
|---|---|
| `npx tsx tools/screenshot.mts <file> <out.png>` | real render through the viewer, headless chromium |
| `npx tsx tools/arrow-truth.mts <file...>` | arrow vertices tldraw actually drew, and which shapes they cross |
| `npx tsx tools/text-metrics.mts <file>` | rendered label widths and heights |
| `npx tsx tools/layout-report.mts <file>` | geometry report from the scene JSON |
| `npm run check` | typecheck + lint + dep-lint + vitest |

Two traps, both paid for already:

- **Do not use the playwright MCP browser tools.** They report success and write
  no file. Use `tools/screenshot.mts`.
- **The geometry report is not the render.** tldraw resizes stickies and wraps
  label text on its own. `layout-report.mts` can say `overlapping shape pairs:
  0` about a diagram whose note visibly covers three shapes. When the report and
  the pixels disagree, the pixels are right.

---

## Tasks

### Phase 0 - sizing, before anything measures anything

- [ ] **T0. Container-aware box sizing. Do this first.**
  `estimatedBoxSize(label)` is a pure function of one string. It cannot see a
  box's siblings, so it has to guess both dimensions from text alone, and
  `BOX_MAX_W` is the workaround: with no other information available, a constant
  is the only thing that stops a 94-character label becoming a 1348x62 ribbon.

  The cap is not a design decision, it is a symptom. The measured consequence is
  ragged containers - `hexagonal`'s "Driven ports" column is seven boxes stacked
  vertically with seven different widths: 172, 158, 200, 228, 144, 214, 120.
  Every column in the corpus has uneven edges on both sides.

  Replace the single-string estimate with three passes:
  1. **Natural width** per label - unwrapped text width from the measured
     metrics, no cap.
  2. **The container picks one shared content width.** A `col` gives every child
     the same width; a `row` gives every child the same height. The shared width
     is the widest natural width in the container, bounded by an **aspect
     target** rather than a pixel constant - if the widest child would exceed the
     target ratio (start at 4:1 w:h and tune from renders), wrap it instead.
  3. **Wrap each label to the shared width**, compute per-child height, take the
     container maximum.

  Delete `BOX_MAX_W`. The only constant left is a ratio, and a ratio is
  scale-invariant - there is no 320-vs-480-vs-640 conversation to have again.

  Fold in two loose ends while here:
  - **`BOX_MIN_H` is dead.** It is 60, but the height formula is
    `lines * 30 + 32`, which is 62 for a single line, so the minimum can never
    bind. Delete it or set it to something deliberate.
  - **Author intent must still win.** `w` and `h` are already in
    `ALLOWED_PROPS` for `box` and have to override all of the above. Add `maxW`
    for a per-box wrap point.

  This has to be finished before T1, because T1 locks a baseline and every
  number in it depends on box geometry. Changing sizing after the baseline is
  exactly the mistake that wasted the previous 45 wakes.

  **Acceptance:** in every corpus file, a `col`'s children share a width to the
  pixel and a `row`'s children share a height; no label wraps mid-word,
  verified against a real render with `text-metrics.mts`; no box exceeds the
  aspect target unless the author pinned `w`. Look at the PNGs - this changes
  every file, including the two the cap never touched.

### Phase 1 - stop arrows crossing shapes

- [ ] **T1. Regenerate the baseline.**
  Every crossing count in the repo predates commit `2484ffa` and describes
  geometry that no longer exists. Run `arrow-truth` and `screenshot` over all
  eight corpus files. Write `docs/baseline.md`: one table of per-file crossing
  counts, canvas dimensions and shape counts, plus the commit it was taken at.
  Save the PNGs to `docs/renders/`.
  Mark `docs/layout-champion.md` and `docs/baselines/` as historical at the top
  of each; do not delete them.
  **Acceptance:** `docs/baseline.md` exists, one PNG per file in
  `docs/renders/`, and a second run of `arrow-truth` reproduces the table
  exactly.

- [ ] **T2. Classify every crossing.**
  Do not build a fix before knowing what is being fixed. Extend `arrow-truth`
  (or add a small tool) to label each crossing as one of:
  **same-axis skip** (both endpoints and the crossed shape share a container
  and a layout axis, with the crossed shape between them in order);
  **cross-container** (the endpoints are in different containers);
  **fan** (the source has out-degree >= 4 within its container);
  **other**.
  Print the breakdown per file and in total.
  **Acceptance:** every crossing in the T1 baseline is classified, the four
  buckets sum to the total, and the result is written into `docs/baseline.md`.
  **If "same-axis skip" is not the largest bucket, stop and write that finding
  prominently** - T3 through T5 are built on the assumption that it is, and the
  plan needs revisiting before they are worth building.

- [ ] **T3. Bend on same-axis skip edges.**
  `bend: 0` is hardcoded at `src/contracts/builders.ts:226`. Give an edge
  classified as a same-axis skip a non-zero `bend`, magnitude scaled by how far
  it skips (a chord over four boxes needs more clearance than one over one),
  signed so the bow goes to the emptier side of the axis. Leave adjacent edges
  at `bend: 0` - a bowed short hop looks broken.
  **Acceptance:** total crossings strictly lower than T1, and **no file gains a
  crossing**. Also eyeball the PNGs: a bend large enough to clear the boxes but
  small enough that the arrow still reads as connecting its two endpoints.

- [ ] **T4. Side anchors together with bend.**
  T3 bows the arrow but it still leaves and enters at shape centres, so the
  first and last stretch of the path still runs through the neighbouring box.
  Set `normalizedAnchor` on both terminals of a same-axis skip so the arrow
  exits the *side* of the source perpendicular to the layout axis and enters
  the matching side of the target - out the right of a `col`, over the top of a
  `row` - and let T3's bend carry it around the outside.
  This is the combination the eight failed attachment hypotheses were missing:
  they moved the exit point without changing the route, and a side-anchored
  straight line crosses just as much as a centre-anchored one.
  **Acceptance:** crossings lower than T3. Ship anchors and bend as one change;
  they are known to fail separately.

- [ ] **T5. Lanes for parallel skips.**
  Once skips bow, two skips over overlapping spans bow into each other and
  become one thick illegible stroke. Assign each a distinct bend magnitude,
  ordered by span length so the longest chord takes the outermost lane.
  **Acceptance:** no two arrow paths in any corpus file come within 8px of each
  other over more than a third of their length. Add that check to
  `arrow-truth`.

### Phase 2 - placement that does not create the problem

- [ ] **T6. Fan-out placement.**
  `wide-fanout` lays eighteen targets of one source into reading-order grid
  rows, so `dispatcher` fires eighteen chords across the entire canvas. When a
  node's out-degree within a container is >= 4 and its targets are otherwise
  unconnected leaves, place those targets as a block adjacent to the source -
  a column beside it, or rows that start at its edge - rather than in flow
  order among unrelated nodes.
  **Acceptance:** `wide-fanout` crossings down by at least half against the
  post-T5 number, and no other file regresses.

- [ ] **T7. Note placement.**
  A tldraw sticky is 200px wide and that is a tldraw fact, not something layout
  can override - stop trying to make notes wide. The fixable part is *where*
  they land. Right now a note is a peer in the main flow, so `multi-region`'s
  note sits alone in a large empty region below the diagram and `long-labels`
  gets two tall columns in dead space.
  Place a note adjacent to the content it follows in source order, or in a
  gutter column beside the diagram, rather than as a flow participant.
  **Acceptance:** no note's bounding box is further than 120px from the
  bounding box of the shape that precedes it in source order, and total canvas
  area drops on `multi-region` and `long-labels`.

- [ ] **T8. Reclaim dead whitespace.**
  Frames carry large empty margins - `hexagonal`'s outer frame has roughly
  110px of empty canvas above its first child and 50px below its last. Measure
  what tldraw's frame chrome actually needs (a title is 14px tall by
  `text-metrics`; `FRAME_TITLE_PX` is set to 32 and `FRAME_PAD_INNER` to 32)
  and set the constants from the measurement.
  **Acceptance:** canvas area drops on at least four files, with zero new
  overlaps and no label or title clipped in the renders.

### Phase 3 - styling

Diagrams currently render as identical black-on-white rectangles, which is why
every one of them reads as a wireframe no matter how good the layout is. Colour,
fill and arrowheads are where a diagram gets its legibility - grouping by hue
does more for comprehension than another 40px of row gap.

tldraw already supports all of this and the pipeline exposes none of it. Per
`docs/jsx-pivot.md` decision 9 the design is settled: **raw tldraw enums,
pass-through, rejected at `lower.ts` if unknown.** No CSS, no theme layer.

Split by whether the prop moves geometry, because the layout-affecting ones have
to come after Phase 1.

- [ ] **T9. Pass-through style props that do not affect layout.**
  On boxes and frames: `color`, `fill` (`none|semi|solid|pattern`), `dash`
  (`draw|solid|dashed|dotted`). On edges: `color`, `dash`, `arrowheadStart`,
  `arrowheadEnd` (`none|arrow|triangle|square|dot|pipe|diamond|inverted|bar`).
  On notes: `color`.
  Add each to `ALLOWED_PROPS` in `src/domain/ir/lower.ts` with value validation
  - an unknown enum value must be a diagnostic with a source span, not a
  silently dropped prop.
  **Acceptance:** a new fixture exercising every enum value compiles and
  renders; a bad value produces a spanned diagnostic; crossing counts and canvas
  dimensions are byte-identical to T8 across the whole corpus (these props must
  not move anything).

- [ ] **T10. Text alignment and label colour.**
  `textAlign` (`start|middle|end`), `verticalAlign`, `labelColor`.
  **Name collision:** `align` is already taken - B1 added it as the container
  cross-axis alignment. Do not shadow it. Use `textAlign` on leaf shapes and
  write the decision down here, or rename the container prop and migrate the
  corpus in the same change.
  **Acceptance:** renders match the requested alignment; no prop name resolves
  to two different meanings depending on which component reads it.

- [ ] **T11. Font and size, with a per-(font, size) metric table.**
  **This task invalidates the box-sizing fix if done naively.** `BOX_CHAR_PX =
  14` and `BOX_LINE_H = 30` in `src/domain/layout/defaults.ts` were measured for
  exactly one combination: `font: draw`, `size: m`. Exposing `font`
  (`draw|sans|serif|mono`) and `size` (`s|m|l|xl`) makes both metrics a function
  of the pair, and sizing every box as if it were `draw`/`m` puts mid-word
  wrapping straight back.
  Measure all sixteen combinations with `tools/text-metrics.mts`, store the
  table, and key `estimatedBoxSize` off it.
  **Acceptance:** for every (font, size), a label of known length renders on one
  line. Add a test that fails if a combination is missing from the table, so the
  next enum value cannot be added without measuring it.

- [ ] **T12. Arrow labels.**
  tldraw arrow shapes already carry a `text` prop; nothing exposes it. A diagram
  where the edges say *"publishes"* and *"on failure"* communicates more than
  any layout change in this plan.
  **Layout-affecting**, which is why it comes last in this phase: a label sits
  at the arrow's midpoint and needs clearance, and after T3-T5 that midpoint is
  on a curve rather than a straight line.
  **Acceptance:** no arrow label's bounding box overlaps a shape the arrow does
  not connect. Add that check to `arrow-truth` and record the numbers in
  `docs/baseline.md`.

### Phase 4 - a corpus worth judging

- [ ] **T13. Add three realistic diagrams.**
  Comes after Phase 3 deliberately: adding realistic fixtures before styling
  exists means adding three more black-and-white wireframes and restyling them
  later.
  Keep every existing fixture; they are the gates. Add three that resemble what
  someone would actually draw, each under 40 shapes, each using colour, fill and
  arrow labels:
  a service architecture with 3-4 containers and traffic between them;
  a request lifecycle as a single flow with two branches;
  a state machine with a cycle in it (**nothing in the corpus has a cycle**, and
  a cycle is the case every routing rule in Phase 1 is least prepared for - a
  back-edge is a same-axis skip that runs backwards). **Give the state machine
  `layout="auto"`** - a cycle has no source order that means anything, so it is
  the case ELK should win, and `auto` is currently exercised on exactly one
  fixture out of eight, which is thin evidence for a whole layout path.
  These become the files to look at when asking "is this good". The stress
  fixtures stay the files to measure.
  **Acceptance:** all three compile with zero diagnostics, render, and are added
  to `docs/baseline.md`.

### Phase 5 - primitives

The author currently has five primitives - `Doc`, `Frame`, `Box`, `Edge`,
`Note` - plus `flow()`. That is a graph vocabulary, and every diagram gets built
from scratch out of it.

The payoff is not only convenience. **A higher-level primitive tells the layout
engine what the author meant**, and every constraint it adds is a case the
router stops having to guess at. A `<Pipeline>` connects its children in
sequence by construction, so it can never emit a same-axis skip edge - the exact
defect Phase 1 exists to route around. Semantics beat heuristics.

- [ ] **T14. Layout shorthands: `Row`, `Col`, `Grid`, `Group`.**
  `<Frame layout="row" gap="40">` is the overwhelmingly common case and it reads
  badly. `Group` is the one that is not pure sugar: an invisible container that
  participates in layout but draws no frame chrome and reserves no title space.
  There is currently no way to group without drawing a box around the group.
  Pure lowering; no layout engine change.
  **Acceptance:** a test proves that for every existing corpus fixture, the
  shorthand form and the `<Frame layout=...>` form produce byte-identical scene
  JSON. **Do not rewrite the fixtures** - write the test against both forms.

- [ ] **T15. Shape vocabulary via tldraw `geo`.**
  tldraw's geo shape already supports `rectangle`, `ellipse`, `diamond`,
  `hexagon`, `cloud`, `oval`, `triangle`, `star`, `x-box`, `check-box` and more,
  all free. Expose `<Box geo="diamond">`, plus named aliases where the name
  carries meaning: `Decision` (diamond), `Actor` (ellipse), `External` (cloud),
  `Terminal` (oval).
  **There is no cylinder in tldraw**, so the conventional database shape is not
  available. Use `oval` or accept the gap - do not build a composite shape to
  fake it.
  **Acceptance:** each alias emits the right `geo`, and `estimatedBoxSize`
  accounts for the geometry. It currently will not: a diamond's usable inner
  width is roughly half its bounding box, so a diamond sized like a rectangle
  will clip its label. Measure with `text-metrics.mts` per geo.

- [ ] **T16. Composite primitives that carry layout semantics.**
  The ones worth having are the ones that constrain structure:
  `<Pipeline>` - a row or col whose children are auto-connected in sequence;
  the author stops writing `flow()` and the container is skip-free by
  construction.
  `<Layers>` - stacked tiers, the block-schema shape, where each tier is a row
  and edges run tier-to-tier only.
  `<Swimlanes>` - a grid with labelled rows, where an element's row is its lane.
  `<Graph>` - relationships with no natural order; this one selects `auto`.
  **The primitive should pick the layout engine**, so the author declares what
  the thing *is* rather than naming an algorithm. `layout="auto"` stays
  available as the escape hatch, but nobody should have to know the string.
  **Acceptance:** a fixture per primitive; each produces zero same-axis skip
  edges by construction, verified with the T2 classifier.

### Phase 6 - re-examine what was decided on stale geometry

- [ ] **T17. Re-test serpentine rows (was B21b).**
  A grid that wraps in reading order makes the last node of one row and the
  first of the next as far apart as possible, which is where `long-labels`' long
  diagonal comes from. Serpentine (alternating row direction) fixes that by
  construction. It was rejected on an arrow-crossing gate measured against boxes
  40% too narrow.
  **Acceptance:** re-measure against the post-T13 baseline. Keep if crossings
  drop and nothing regresses; if it fails again, write down the number so it is
  not tried a third time.

- [ ] **T18. Re-examine the row-gap corridor (B25/B32/B33).**
  Three kept changes widen grid row gaps in proportion to edges crossing them.
  They were tuned against stale geometry, and if T3-T5 route those edges around
  instead of through, the corridor is now paying for clearance nobody needs.
  Try removing it entirely and measure.
  **Acceptance:** if crossings do not rise when it is removed, remove it - that
  is roughly 150 lines and three layers of special case bought back. If
  crossings do rise, record by how much and keep it.

### Phase 7 - round-trip

The hard one. The architecture below is decided; the details are not.

#### Why the obvious approach fails

**The JSX is a program, not a document.** Given

```jsx
{TIERS.map((t) => <Box id={`${ns}-${t.key}`} label={t.label} />)}
```

"the user deleted one of these on the canvas" has no unique answer. Remove the
`TIERS` entry and it vanishes from all three regions. Add a filter and the
source now encodes a UI gesture. Hoist it out of the loop and the diagram is
right but the code is worse.

This is the general problem of editing a program by editing its output, and it
is undecidable **for a compiler**, because resolving it requires knowing what
the author meant. It is entirely tractable for a model that can read the file
and infer intent, or ask.

So do not make sync smart. Quarantine the part that needs intent.

#### The design: overlay plus absorb

Three layers, and one explicit human-invoked step.

1. `x.tldsl.jsx` - the program. Authoritative for everything it declares.
2. `x.tldsl.overlay.json` - the user's canvas edits, keyed by shape id.
3. **Render = `apply(overlay, compile(jsx))`.** Pure, total, deterministic. No
   model involved.
4. `tldsl absorb <file>` - a model rewrites the JSX so that compiling it *alone*
   reproduces the current render, then empties the overlay. Human-invoked,
   human-reviewed, produces a normal diff.

The property you asked for - **round-trip with no differences** - is then
structural rather than aspirational. The canvas state *is* `compile + overlay`.
Reloading recomputes the same function over the same inputs, so it reproduces
exactly. There is no translation step that can be lossy, because nothing is
being translated. Fidelity stops being an algorithm to get right and becomes an
invariant that holds by construction.

Absorb is allowed to be imperfect, because absorb is reviewed. That is the whole
trick: the lossless part is mechanical, the lossy part is supervised.

#### The two use cases this has to serve

- **Nudge, then absorb.** JSX exists; the user drags a box, deletes one, adds a
  new one. The canvas honours it immediately (the overlay), the source catches
  up later (absorb). A nudge that is never absorbed still works forever - it is
  a legitimate resting state, not a pending migration.
- **Canvas-first.** The user draws the diagram by hand against a stub
  `<Doc/>`, then asks for it to be restructured and restyled. Everything lands
  in the overlay's `added` set; absorb turns a flat pile of shapes into
  componentised JSX.
  **This is the demanding case and it is the one that validates the design.** If
  absorb can turn an all-`added` overlay into good JSX, every smaller case is a
  subset of it.

#### Tasks

- [ ] **T19. Design spike. Write the doc, do not write code.**
  The architecture above is settled. Produce `docs/round-trip.md` settling the
  details it leaves open, each with a decision and a reason:
  - **Overlay shape: final-state map, not an event log.** Event logs replay
    ambiguously and rot. Propose a concrete schema - `moved`, `restyled`,
    `relabelled`, `deleted`, `added` - and say what a canvas gesture maps to.
  - **Staleness.** The JSX changes and an overlay entry's id no longer exists.
    A `basedOn` hash of the compiled scene detects it. Apply what still
    resolves and emit a diagnostic listing the orphans - **never silently drop
    an entry**, because silent drops are exactly how this class of feature
    rots. Confirm or overrule that.
  - **Ids for added shapes.** A canvas-added box arrives with a tldraw id
    (`shape:abc123`). It is stable and ugly. Absorb renames it. Anything else
    to decide here?
  - **Precedence and escape hatch.** The overlay wins over layout by
    definition; that is the point. So there must be a way out - `tldsl reset`
    to drop the overlay, and probably a way to drop one entry.
  - **What absorb may not do.** It rewrites source. Name the guardrails: never
    touch a file with uncommitted changes without saying so, always leave a
    reviewable diff, never reformat unrelated code.
  Read `docs/decisions.md` ADR-13 (last-good scene) first - it is the closest
  prior art in the repo.
  **Acceptance:** the doc exists, every bullet above has a decision, and the
  out-of-scope list is explicit. **No code.**

- [ ] **T20. Overlay apply - the deterministic half.**
  Schema plus a pure `apply(overlay, scene)` in `domain/`, the viewer writing
  the overlay on canvas edit, and `serve` reading it. This is the whole
  lossless mechanism and it involves no model.
  **Acceptance:** for every corpus fixture, a synthetic overlay exercising all
  five operation kinds applies cleanly; `apply` is a pure function with unit
  tests; and reloading the served page reproduces the pre-reload scene byte for
  byte.

- [ ] **T21. Fidelity harness.**
  Build this before absorb, not after. compile -> scene -> apply a canvas
  mutation -> reload -> assert the scene equals the mutated scene, over the
  whole corpus.
  **Acceptance:** passes with real mutations, and **fails loudly when fed a
  deliberately lossy apply** - a harness that has never gone red proves
  nothing.

- [ ] **T22. `tldsl absorb`.** *Blocked on the T19 decisions.*
  The model-driven step. Reads JSX plus overlay, rewrites the JSX, empties the
  overlay, leaves a reviewable diff.
  **Acceptance:** the canvas-first case works end to end - a stub `<Doc/>` plus
  an overlay of hand-added shapes absorbs into JSX that compiles, on its own
  and with an empty overlay, to the same scene the canvas showed. Verified by
  T21's harness, not by inspection.

---

## Open questions for the human

Do not act on these. They are the discussion surface; they get resolved into
tasks above by the human, not by the loop.

1. ~~**`BOX_MAX_W = 320` is arbitrary.**~~ **Answered:** the cap should not
   exist. It is a workaround for sizing being context-free, and the fix is
   container-aware sizing with an aspect target - see T0, which deletes the
   constant outright.

2. ~~**Should `layout="auto"` (ELK) come back for graph-shaped input?**~~
   **Answered, and the question was misframed.** ELK never left and is not an
   alternative engine: `hybridLayout` already delegates per container, so a
   container with `layout="auto"` goes to ELK while its parent and siblings stay
   deterministic. It works - `sparse-graph` renders with zero crossings.
   Decisions: **auto stays opt-in** (source order carries meaning in nested
   containers, and ADR-13's spatial continuity argument still holds); **the
   primitive should imply the engine** rather than the author naming an
   algorithm - see T16; and **it needs testing on more than one fixture** - see
   T13. Note that ELK computes edge routes and we discard them, because tldraw
   arrows cannot take waypoints, so an `auto` container gets ELK placement and
   our arrows. T3-T5 apply there identically.

3. **Are stickies the right shape for notes at all?** 200px fixed width makes any
   real sentence a twenty-line column. A geo shape with a warm fill would look
   like a note and size like a box. This changes what `<Note>` emits.

4. ~~**Should `BOX_MIN_H` exist?**~~ **Answered:** it is dead code - the
   height formula never goes below it. Folded into T0.

5. **Which primitives are actually worth having (T15, T16)?** The list in those
   tasks is a guess. The useful question is which archetypes get drawn often
   enough to deserve a component: block schema, C4 (`Person`, `System`,
   `Container`, `Component`), flowchart (`Decision`, `Terminal`, `Process`),
   sequence diagram (lifelines and messages, which needs a genuinely different
   layout), ER diagram, deployment diagram. Each one added is a vocabulary the
   author has to learn, so the point of the JSX pivot argues for few and
   composable over many and specific.

6. **Named styling, or raw enums only?** jsx-pivot decision 9 settled on raw
   tldraw enums plus "a thin `variant`", and the `variant` half was never built.
   A `variant="danger"` mapping to `color="red" fill="semi"` would make diagrams
   look consistent without the author picking hues, at the cost of a second
   vocabulary over the same props. Raw-only is the simpler answer and the one
   T9-T11 assume.

7. ~~**Round-trip scope.**~~ **Answered:** structural changes must be
   supported, not just positions. Resolved into the overlay-plus-absorb design
   in Phase 7 - the overlay carries adds and deletes as well as moves, and the
   part that needs intent is quarantined into an explicit reviewed step.

8. ~~**Does an edited canvas ever win over source?**~~ **Answered:** yes, by
   definition - the overlay is applied over the compiled scene, so it wins until
   absorbed or reset. Staleness is the remaining risk and T19 has to settle it.

9. **Is `absorb` a CLI command, an agent skill, or both?** It needs a model. A
   `tldsl absorb` subprocess shelling out to an API is self-contained but adds a
   key and a dependency to a tool that currently has neither. A skill the user
   runs from their agent keeps tldsl model-free and puts the diff review where
   the user already is. The second is smaller and I would start there.

## Discovered work

Append here. Do not act on these during the wake that finds them; they get
promoted into the task list by the human.

- Anchor syntax `id.anchor` collides with dotted namespaced ids, so a component
  cannot prefix its children with `${ns}.` - filed as a bd bug (P1). Blocks any
  task that wants author-specified anchors.
- `flow()` edges carry no source span; diagnostics report them at `.:0:0`
  (bd bug, P2).
