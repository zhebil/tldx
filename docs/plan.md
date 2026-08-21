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
  back-edge is a same-axis skip that runs backwards).
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

The hard one, and the only place in this plan where the first task is to think
rather than build.

The difficulty is structural: **the JSX is a program, not a document.** Given

```jsx
{TIERS.map((t) => <Box id={`${ns}-${t.key}`} label={t.label} />)}
```

there is no unique answer to "the user deleted one of these on the canvas".
Remove an entry from `TIERS`, and it disappears from all three regions. Add a
filter, and the source now encodes a UI gesture. This is the general problem of
editing a program by editing its output, and it has no general solution - so the
design question is not *how* to round-trip but *what subset* to round-trip, such
that recompiling reproduces the canvas exactly.

- [ ] **T19. Design spike. Write the doc, do not write code.**
  Produce `docs/round-trip.md` covering at minimum these three, with what each
  can and cannot carry, and a recommendation:
  - **Positions only, as a sidecar.** The canvas writes a `.positions.json`
    keyed by shape id; layout reads it as a per-shape override; the JSX is never
    rewritten. Drift is impossible because there is nothing to drift. Covers the
    common wish ("that box should be over there") and nothing else. This is
    ADR-13 territory - read it first.
  - **Structural edits to literal elements only.** `jsxDEV` already stamps every
    element with `{fileName, lineNumber, columnNumber}` (jsx-pivot decision 7,
    currently used for diagnostics), so an element written literally in source
    can be located and edited textually. An element produced by a `.map` is
    refused with a diagnostic that says why. Partial, but it degrades
    predictably instead of guessing.
  - **Full projection.** The canvas edits an AST and the JSX is regenerated by a
    printer. Guarantees no drift, and destroys the program: loops, components and
    variables all flatten to literals. This gives up what the JSX pivot was for.
  Settle two sub-questions in the same doc:
  - **Ids are the join key.** Round-trip only works where a shape's id survives
    recompile, which means it must be written literally in source. Ids from
    `flow()` and from `.map` data are not. Is "has a source-literal id" the
    precondition for an element being round-trippable?
  - **Cascades.** Deleting a box today leaves `<Edge from="x">` dangling, which
    is a compile error (`ir/unknown-ref`). Does sync delete dependent edges, or
    refuse the delete?
  **Acceptance:** the doc exists with a clear recommendation and an explicit
  list of what is out of scope. **No code.** Stop after it and leave the
  decision to the human.

- [ ] **T20. Round-trip fidelity harness.** *Blocked on the T19 decision.*
  Whatever mechanism is chosen, "no round-trip differences" has to be a test
  rather than a hope. Build the harness before the sync it verifies:
  compile → scene → apply a canvas mutation → sync back to JSX → recompile →
  assert the resulting scene equals the mutated scene.
  **Acceptance:** the harness runs over the whole corpus with a no-op mutation
  and passes, and fails loudly when fed a deliberately lossy sync.

---

## Open questions for the human

Do not act on these. They are the discussion surface; they get resolved into
tasks above by the human, not by the loop.

1. **`BOX_MAX_W = 320` is arbitrary.** It is the cap that turns a
   paragraph-length label into a block instead of a 1300px ribbon. At 320,
   `long-labels`' sentences wrap to about five lines. Wider means fewer lines
   and a wider canvas. Nobody has looked at 480 or 560.

2. **Should `layout="auto"` (ELK) come back for graph-shaped input?** ELK solves
   same-axis skips by construction - it assigns layers and routes between them.
   It was set aside because it scrambles source order, which matters for nested
   containers. But `sparse-graph` and a state machine are genuinely
   graph-shaped, and source order means little there. The cost is two layout
   engines to maintain.

3. **Are stickies the right shape for notes at all?** 200px fixed width makes any
   real sentence a twenty-line column. A geo shape with a warm fill would look
   like a note and size like a box. This changes what `<Note>` emits.

4. **Should `BOX_MIN_H` exist?** It is 60, but the height formula is
   `lines * 30 + 32`, which is 62 for a single line, so the minimum never binds.
   Either it is dead and should go, or the intent was a taller minimum.

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

7. **Round-trip scope.** T19 asks the loop to lay out the options, but the
   scoping call is a product decision, not a technical one: is the goal "nudge
   things and keep them", which the positions sidecar solves completely and
   cheaply, or "edit the diagram on the canvas and keep the code", which is a
   much larger project and forces a choice between keeping the program and
   guaranteeing fidelity?

8. **Does an edited canvas ever win over source?** If a position sidecar exists
   and the JSX changes so a shape no longer needs that position, does the
   override persist, expire, or become a diagnostic? Stale overrides are how
   this class of feature usually rots.

## Discovered work

Append here. Do not act on these during the wake that finds them; they get
promoted into the task list by the human.

- Anchor syntax `id.anchor` collides with dotted namespaced ids, so a component
  cannot prefix its children with `${ns}.` - filed as a bd bug (P1). Blocks any
  task that wants author-specified anchors.
- `flow()` edges carry no source span; diagnostics report them at `.:0:0`
  (bd bug, P2).
