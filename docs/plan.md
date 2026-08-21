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
- **`docs/layout-champion.md` is stale** for the same reason. Do not read it as
  current; it is kept only as history. The `docs/baselines/wake-*` epochs were
  deleted outright - every number in them described the old geometry, and git
  history holds them if anyone ever needs them back.
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
| `npx tsx tools/screenshot.mts <file> <out.png> [--frame <id>]` | real render through the viewer, cropped to content |
| `npx tsx tools/arrow-truth.mts <file...>` | arrow vertices tldraw actually drew, and which shapes they cross |
| `npx tsx tools/text-metrics.mts <file>` | rendered label widths and heights |
| `npx tsx tools/layout-report.mts <file>` | geometry report from the scene JSON |
| `npm run check` | typecheck + lint + dep-lint + vitest |

Two traps, both paid for already:

- **Do not use the playwright MCP browser tools.** They report success and write
  no file. Use `tools/screenshot.mts`.
- **`screenshot.mts` exports through `editor.toImage`, not the viewport.** The
  PNG is built from shape records and cropped to content, so it never contains
  empty grid or tldraw UI, and its size does not depend on the browser window.
  `--frame <id>` narrows it to one region - note that tldraw draws that frame's
  *contents*, not its own border or name label.
- **The geometry report is not the render.** tldraw resizes stickies and wraps
  label text on its own. `layout-report.mts` can say `overlapping shape pairs:
  0` about a diagram whose note visibly covers three shapes. When the report and
  the pixels disagree, the pixels are right.

---

## Tasks

### Phase 0 - sizing, before anything measures anything

- [x] **T0. Container-aware box sizing. Do this first.**
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

  **Done.** `BOX_MAX_W` and `BOX_MIN_H` are gone; `fitBoxWidth` picks each
  label's aspect-bounded natural width and `applyContainerBoxSizing` in
  `stack.ts` gives a `col`/`grid` one shared width and a `row` one shared
  height. Verified over all eight fixtures: 17 flow containers, every one
  uniform to the pixel, no box past the aspect target, and `text-metrics.mts`
  confirms no label wraps more lines than the engine predicted (i.e. no
  mid-word wrap). `hexagonal`'s Driven-ports column went from 172/158/200/228/
  144/214/120 to a flush 228; `long-labels` went from ten 320px ribbons to a
  uniform 4-wide grid and lost one of its two long diagonals.

  Two things the task did not anticipate, both settled by measurement:

  - **`BOX_CHAR_PX = 14` was documented as an upper bound on glyph advance and
    is not one.** Measuring every printable ASCII glyph through
    `tools/text-metrics.mts` gives `#` 21.40, `M` 21.25, `%` 21.14, `W` 21.14,
    `w` 20.85. That is why `Gateway` rendered as `Gatewa`/`y` in
    `deep-nesting` both before this task and after its first pass - a 7-char
    label got exactly 7x14 = 98px of content width and needed more. The
    acceptance criterion here is unmeetable with a flat per-char constant, so
    pass 1 ("unwrapped text width *from the measured metrics*") is now
    literally that: `src/domain/layout/glyph-metrics.ts` holds the measured
    advance table and `textWidth()`, and wrapping happens in pixels rather
    than a character budget. Summing advances predicts real `labelW` within
    5px over 41 corpus labels (worst under-prediction 1.58px, covered by a 4px
    slack). Most boxes got *narrower*, not wider: `PasswordHasher` 228 -> 201.
  - **The aspect target is 6, not the 4 the task suggested starting at.**
    Tuned from renders as instructed. Only `sequence` is sensitive to the
    value at all - the other seven fixtures render identically at 4, 5 and 6.
    At 4 every one of its fourteen step labels is forced onto two lines
    (215x1808); at 6 they all fit on one and the diagram is 23% shorter
    (361x1388). 5 is strictly worse than both (310x1808: wider boxes, same
    line count).

  Free choice taken, per "change less": the shared width/height applies to
  `box` children only. Notes cannot carry a width at all (`emitNote` emits a
  fixed-width sticky and only sets `growY`; notes are T7), and stretching
  boxes to a sibling frame's width would blow the aspect target outright -
  `deep-nesting`'s `l3` column would hand `Handler` the ~500px width of the
  `l4` frame beside it, an 8:1 box. So "a `col`'s children share a width" is
  verified as "a `col`'s *box* children share a width".

  `docs/renders/` and `docs/baseline.md` were deliberately not written: they
  do not exist yet and creating them is T1's entire job.

### Phase 1 - stop arrows crossing shapes

- [x] **T1. Regenerate the baseline.**
  Every crossing count in the repo predates commit `2484ffa` and describes
  geometry that no longer exists. Run `arrow-truth` and `screenshot` over all
  eight corpus files. Write `docs/baseline.md`: one table of per-file crossing
  counts, canvas dimensions and shape counts, plus the commit it was taken at.
  Save the PNGs to `docs/renders/`.
  Mark `docs/layout-champion.md` as historical at the top; do not delete it.
  **Acceptance:** `docs/baseline.md` exists, one PNG per file in
  `docs/renders/`, and a second run of `arrow-truth` reproduces the table
  exactly.

  **Done at `148e306`.** `docs/baseline.md` now holds the per-file table
  (canvas, shapes, frames, arrows, crossings, PNG size) and eight PNGs sit in
  `docs/renders/`. Two consecutive `arrow-truth` runs over the whole corpus were
  byte-identical, vertices included, so the table reproduces exactly.
  The numbers: **60 crossings over 118 arrows and 154 shapes**, but they are not
  spread evenly - `wide-fanout` alone contributes 29 (a dispatcher fanning out
  to eighteen workers over four rows), `sequence` and `sparse-graph` are at
  zero, and the other five sit between 5 and 9. Eyeballing the renders confirms
  the T0 sizing held: no label wraps mid-word anywhere in the corpus, so every
  remaining defect visible in the PNGs is an arrow or a note, not text.
  `docs/layout-champion.md` got a HISTORICAL banner at the top pointing at
  `docs/baseline.md`; it was not deleted.

- [x] **T2. Classify every crossing.**
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

  **Done at `796085d` + this commit.** New `tools/crossing-classify.mts` joins
  `arrow-truth`'s rendered geometry to the positioned IR's container tree and
  buckets every `(arrow, crossed shape)` pair; `crossingPairs` was factored out
  of `arrow-truth` and shared, so the two tools cannot drift on what counts as a
  crossing. All 60 crossings classify and the buckets sum:
  **same-axis skip 33, cross-container 15, fan 10, other 2 = 60.**
  **Same-axis skip is the largest bucket**, so the T3-T5 assumption holds and
  the plan stands. The split is lopsided per file, though: `wide-fanout`'s 29
  is 19 skips plus 10 genuine diagonal fan chords, while `deep-nesting` (9) and
  `hexagonal` (6) are 100% cross-container - a quarter of the corpus that all of
  Phase 1 as written will not touch. Two free choices, both recorded in
  `docs/baseline.md`: the axis is derived geometrically rather than from the
  declared `row`/`col`/`grid` mode (so one grid row counts), and the buckets are
  applied in the order the task lists them. The T1 open question about ancestor
  frames is settled by measurement - it is 0 across the whole corpus, so no
  decision was needed. Geometry did not move, so `docs/renders/` and the T1
  table are unchanged.

- [x] **T3. Bend on same-axis skip edges.**
  `bend: 0` is hardcoded at `src/contracts/builders.ts:226`. Give an edge
  classified as a same-axis skip a non-zero `bend`, magnitude scaled by how far
  it skips (a chord over four boxes needs more clearance than one over one),
  signed so the bow goes to the emptier side of the axis. Leave adjacent edges
  at `bend: 0` - a bowed short hop looks broken.
  **Acceptance:** total crossings strictly lower than T1, and **no file gains a
  crossing**. Also eyeball the PNGs: a bend large enough to clear the boxes but
  small enough that the arrow still reads as connecting its two endpoints.

  **Done.** New pure `src/domain/layout/routing.ts` exports
  `computeEdgeBends(ir)`; `emit()` calls it once and threads a per-edge `bend`
  into `arrowShape` (which gained an optional `bend`, still defaulting to 0).
  An edge bends only when both endpoints share a container, share an axis
  geometrically, and have at least one box/note strictly between them - so
  adjacent hops and cross-container edges stay dead straight. The magnitude is
  derived, not tuned: for each crossed shape take the clearance from the chord
  to its far edge plus a 12px margin, divide by the arc's deviation factor
  `4t(1-t)` at that shape's position along the span, and take the max. The
  sign follows the emptier side - each side's gap to the nearest other shape
  is measured, and a side is only used if the gap is at least the required
  sag; if neither side has room the edge stays straight rather than bow into a
  neighbour.
  **The numbers: 60 crossings -> 38, and no file gained one.**
  wide-fanout 29->16, release-pipeline 5->0, multi-region 6->2; deep-nesting 9,
  hexagonal 6, long-labels 5 unchanged. By bucket, same-axis skip 33->11 with
  cross-container (15), fan (10) and other (2) all untouched, so the change hit
  exactly the bucket it aimed at. Verified twice with `arrow-truth` and
  `crossing-classify` independently; `npm run check` green (40 files, 345
  tests); `docs/renders/` re-rendered and `docs/baseline.md` has a T3 table.
  Looked at all four changed PNGs: the bows read as hand-drawn, they clear the
  boxes, and they still obviously connect their endpoints -
  `release-pipeline`'s Security scan -> Notify Slack sweeping around Manual
  approval is the best single example.
  The eleven surviving skips are one residue: the arc clears the middle of the
  span but still clips the box next to an endpoint, because both terminals
  still attach at centres. That is precisely T4's job, and it is the direct
  evidence for why T4 follows T3 rather than replacing it.
  Free choice recorded: frames are excluded from the "crossed" set (only boxes
  and notes), matching what `arrow-truth` actually counts as a crossing.

- [x] **T4. Side anchors together with bend.**
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

  **Done.** `computeEdgeBends` became `computeEdgeRoutes`, returning
  `{ bend, startAnchor, endAnchor }` per routed edge; `emitEdge` threads the
  anchors onto both `arrowBinding`s. Only edges that already qualified for a
  bend get anchors - fan edges and cross-container edges keep centre binding,
  which is what separates this from B4a/B13/B14, where side anchors were applied
  to *every* terminal and coarsened tldraw's continuous perimeter clipping.
  Three pieces of geometry moved with the anchors: the chord (and so `u` and
  the sag) is now measured between the anchor points rather than the centres;
  the clearance test became signed, because with an edge anchor a crossed shape
  can sit entirely on the far side of the chord and `Math.abs` demanded a bow it
  did not need; and the viability test now compares the free gap against how far
  the arc actually pokes past the swept band (`sag - (bandEdge - midPerp)`)
  rather than against the raw sag.
  **The numbers: 38 crossings -> 27, and no file gained one.**
  wide-fanout 16->10, long-labels 5->2, multi-region 2->0; deep-nesting 9 and
  hexagonal 6 unchanged. By bucket, **same-axis skip 11 -> 0** with
  cross-container (15), fan (10) and other (2) untouched. Phase 1's target
  bucket is empty.
  **The render caught a fake win.** The first pass also measured 27, but four of
  `multi-region`'s six skip edges were not drawn: with `isPrecise: true` and an
  anchor sitting exactly on the outline, tldraw's arc-vs-outline clipping is
  degenerate for one of the two bend signs, and `MIN_ARROW_LENGTH` left a 10px
  stub (`arrow-truth` showed `euw1-api-to-cache` as `(340,325) -> (337.1,334.6)`).
  Zero crossings bought by deleting the arrow. `isExact: true` on both terminals
  of a routed edge skips that clipping entirely; the terminal stays on the
  anchor, which is already on the outline, so nothing is lost. Total stayed at
  27 and two more collapsed arrows in `wide-fanout` came back. A path-length
  sweep over the corpus now finds no arrow under 15px.
  Free choice recorded: the viability test was made geometrically correct
  (compare the gap against the overshoot past the band, not the whole sag)
  rather than left as-is, because the anchored chord changes what the old test
  was approximating.

- [>] **T5. Lanes for parallel skips.** *Deferred to T6b - skip it, do not take
  it as the top task. Its mechanism shipped; its box is re-checked when T6b
  lands.*
  Once skips bow, two skips over overlapping spans bow into each other and
  become one thick illegible stroke. Assign each a distinct bend magnitude,
  ordered by span length so the longest chord takes the outermost lane.
  **Acceptance:** no two arrow paths in any corpus file come within 8px of each
  other over more than a third of their length. Add that check to
  `arrow-truth`.

  **Built and shipped, but the box stays unchecked: the criterion is not met,
  and it is not reachable by the mechanism this task describes.** Do not
  rebuild lanes - they exist and they work. Read this note before touching T5
  again.

  What was built: `computeEdgeRoutes` in `src/domain/layout/routing.ts` is now
  two phases. Phase 1 (`computeCandidate`, the old `computeRoute` stopping one
  step short) yields a candidate carrying the chosen side, base sag, and the
  two numbers the viability test needs. Phase 2 groups candidates by
  `(parentId, axis, side)`, sorts each group by chord span ascending, and gives
  each a lane `rank` = 1 + the highest rank among already-assigned siblings
  whose axis-span overlaps it. Final sag = `baseSag + rank * LANE_STEP`
  (`LANE_STEP = 20`), stepped back down one rank at a time while the extra sag
  would bow the arc into a neighbouring shape. Longest chord therefore ends up
  outermost, and an edge with no overlapping sibling keeps rank 0 and a
  byte-identical bend to T4. `arrow-truth` gained `crowdedPairs` /
  `crowdedFraction` (1px sampling, `CROWD_PX = 8`, `CROWD_FRACTION = 1/3`), so
  the check the task asks for now runs on every invocation and prints the
  offending pairs by id.

  The numbers: **crowded pairs 20 -> 6. Crossings unchanged at 27**, per file
  and in total, confirmed by `crossing-classify` as well. Every crowded pair
  that involved a routed edge is gone: `wide-fanout` 12 -> 2, `multi-region`
  3 -> 0, `release-pipeline` 1 -> 0. Looked at all four changed PNGs - the four
  `Dispatcher -> Worker 2..5` arcs are four separate lanes now instead of one
  stroke with four arrowheads, and the same for `Scheduler -> Task 2..4` and
  `long-labels` row 1. `npm run check` green (40 files, 351 tests).

  Why it stops at 6, and why lanes cannot go further: **all six survivors are
  pairs of straight, unrouted arrows that are collinear because of where the
  boxes sit.** There is no bend on them to assign a lane to. Four are
  `deep-nesting`'s vertical chain at x=297, every one of which is
  cross-container and so is declined by `computeEdgeRoutes` at the
  `from.parentId !== to.parentId` gate. Two are `wide-fanout`'s
  `hub -> leaf-7` / `hub -> leaf-14` and `hub -> leaf-8` / `hub -> leaf-16`,
  where the near leaf sits exactly on the ray to the far one, so one arrow is a
  geometric prefix of the other; both are diagonal, so `deriveAxis` returns
  null and no route is computed either. The task's acceptance was written
  assuming all crowding comes from bowed skips over overlapping spans - it
  does not, and the six that do not are exactly the six arrows that still
  register as crossings in the `fan` and `cross-container` buckets. T6 removes
  the `wide-fanout` two as a side effect of placement. Nothing in the current
  task list owns `deep-nesting`'s four.

  **Second wake, independent verification.** The claim above was re-checked
  from the coordinates rather than taken on trust, and it holds - but the
  reason is sharper than "there is no bend to lane".

  `deep-nesting`'s four are cross-container *and* invisible to the crossed-shape
  filter. `e-validator-config` runs (297.5,538) -> (297.5,209.5) and fully
  contains both `e-metrics-config` (297.1,340 -> 297.4,209.5) and
  `e-router-handler` (297.1,326 -> 297.4,450.5), so they are exactly the
  overlapping-span case T5 describes. They are declined twice over: once at
  `from.parentId !== to.parentId` in `computeCandidate`, and again at the
  `s.parentId === from.parentId` filter that builds `crossed`, which would
  return empty even if the first gate were removed. Reaching them means routing
  cross-container edges at all - widening T3's trigger, already sitting in
  Discovered work - not assigning lanes. That is a T3-scale change to the
  routing module with a crossings-based acceptance, and inventing it here would
  be exactly the improvised substitute the plan forbids.

  `wide-fanout`'s two are a placement coincidence. `hub -> leaf-7`
  (106.6,62 -> 240.4,211.9) and `hub -> leaf-14` (106.6,62 -> 438.4,433.9)
  share an origin and have slopes 1.120 and 1.121; the short arrow is a strict
  geometric prefix of the long one, so they are 100% crowded by construction.
  No bend mechanism applies (diagonal, so `deriveAxis` returns null) and no lane
  separates two segments of the same ray. Only moving the leaves helps, which is
  T6.

  So no in-scope work ticks this box, and the next wake would produce this same
  paragraph again. Three ways out were offered to the human.

  **Decided: option 3, with the ordering changed.** Cross-container routing is
  promoted into the task list as **T6b**, placed *after* T6 rather than ahead of
  T5. Rationale, recorded so it is not relitigated:

  - Lanes work and must not be rebuilt. Putting the new task ahead of T5 would
    have meant re-doing a task that already shipped its mechanism correctly.
  - T6 removes the two `wide-fanout` survivors as a side effect of placement,
    so it has to land first for T5's re-check to be meaningful.
  - The two rejected options were rejected on the pixels, not the numbers.
    `deep-nesting`'s four crowded pairs are the single vertical stroke running
    through Config, Router, Metrics, Handler and Validator - the worst-looking
    file in the corpus, and the original complaint that started this plan.
    Option 1 ticks the box and leaves that picture unchanged. Option 2 narrows
    the metric until it agrees with the code, which moves the goalposts without
    moving a single arrow.

  **T5's box stays unchecked until T6b lands**, then is re-checked. It is not
  blocked in the meantime: T6 is the next task and does not depend on it.

  Free choice recorded: `LANE_STEP = 20`. It is the smallest round step that
  cleared every routed pair in the corpus on the first try; not tuned further,
  because the check is a threshold and the margin is already comfortable.

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

  Note from T5's evidence: **collinearity is its own crowding source.** A fan
  block that is a clean column or row places targets at proportional distances
  along the same ray from the source, which is exactly what makes
  `hub -> leaf-7` a 100% crowded prefix of `hub -> leaf-14`. Placement that
  fixes crossings and reintroduces collinear overlap has not fixed anything.

- [ ] **T6b. Route cross-container edges.**
  `computeEdgeRoutes` declines any edge whose endpoints sit in different
  containers, at the `from.parentId !== to.parentId` gate in `computeCandidate`.
  That gate is why T3's bow, T4's anchors and T5's lanes all skip the 15
  cross-container crossings - `deep-nesting` 9 and `hexagonal` 6 - and why
  `deep-nesting`'s vertical chain is four bare collinear segments piercing five
  boxes.

  **Widen the trigger; do not invent a second mechanism.** The bow, the anchor
  choice and the lane assignment already do the right thing once an edge is
  allowed through. There is a second gate to deal with: the `crossed` set is
  built with an `s.parentId === from.parentId` filter, so it returns empty for
  cross-container edges even if the first gate is removed. Both have to widen
  together or the change is a no-op - two wakes have already confirmed that
  removing only the first does nothing.

  Sag viability against shapes in *other* containers is the real work: an arc
  that clears its own container may bow into a sibling frame or its contents.
  The existing step-down loop is the place for it.

  **Acceptance:** the `cross-container` bucket in `crossing-classify` down from
  15 to at most 5; `deep-nesting`'s four crowded pairs gone; no file regresses
  on either crossings or crowded pairs. Then re-check T5's criterion and tick
  its box if it now holds.

- [ ] **T7. Notes: shape, and attachment.**
  Two changes, shipped together because the second is only worth having once
  the first makes a note readable.

  **Shape.** A tldraw sticky is 200px wide and cannot be widened - `scale`
  scales the text too, so the aspect never changes. That turns a two-sentence
  annotation into twenty stacked fragments, and in most corpus renders the note
  is the worst-looking element on the canvas. Emit `<Note>` as a geo shape with
  a warm fill instead, so it sizes like a box and inherits T0's
  container-aware width, word wrap and aspect target. Keep `<Sticky>` emitting
  the real sticky for when that look is wanted - `noteShape` in
  `src/contracts/builders.ts` already exists.
  B9 (a kept hypothesis that exists solely to make layout reserve the space
  tldraw actually draws for a sticky) becomes dead for `<Note>` and should be
  scoped down to `<Sticky>` or removed.

  **Attachment.** Annotating a specific node or edge is the common case and
  there is no way to express it - a note is a flow participant, which is why
  `multi-region`'s note sits alone in a large empty region and `long-labels`
  gets two columns in dead space.
  Add `on`: `<Note on="api-gateway">`, `<Note on="edge-7">`. An attached note is
  **placed relative to its target after the target is placed, and does not
  participate in layout** - it must not push siblings around, but it must count
  toward canvas bounds and overlap checks.
  - **Default adjacent, not overlapping.** Covering the thing being annotated
    obscures it. Place on whichever side of the target has the most free space.
    If a literal on-top placement is wanted later, that is a separate prop, not
    the default.
  - **Overlap checks must whitelist an attached pair**, or a deliberate design
    fires a gate.
  - **Z-order is already handled** - `builders.ts` assigns per-type indices, so
    a note renders above a box.
  - Attaching to an edge needs the edge's midpoint, which after T3-T5 is on a
    curve rather than a straight line. Attaching to a `flow()` edge is awkward
    because its id is synthesized; say what happens.
  - An unattached note keeps a placement heuristic: adjacent to the content it
    follows in source order, or in a gutter column. Explicit attachment beats
    inference, so this is the fallback, not the mechanism.

  **Acceptance:** an attached note's bounding box touches or sits within 40px of
  its target and nothing else; an attached note never changes the position of
  any other shape; no unattached note is further than 120px from the shape
  preceding it in source order; total canvas area drops on `multi-region` and
  `long-labels`; and a note's text wraps to a readable width rather than a
  200px column.

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
  **Defaults are neutral except frames**, which get a very light fill so
  containment reads without the author styling anything. No `variant` prop -
  `docs/jsx-pivot.md` decision 9's variant clause is superseded by userland
  components (T16b), and that supersession should be recorded in that file.
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

- [ ] **T15. `geo` as a prop. No named shape aliases in the library.**
  tldraw's geo shape already supports `rectangle`, `ellipse`, `diamond`,
  `hexagon`, `cloud`, `oval`, `triangle`, `star`, `x-box`, `check-box` and more,
  all free. Expose it as `<Box geo="diamond">`.
  **There is no cylinder in tldraw**, so the conventional database shape is not
  available. Use `oval` or accept the gap - do not build a composite shape to
  fake it.
  Named aliases (`Decision`, `Actor`, `External`, `Terminal`) do **not** go in
  the library. They are userland - see T16b. The library ships the capability,
  not the vocabulary.
  **Acceptance:** each geo value emits correctly, and sizing accounts for the
  geometry. It currently will not: a diamond's usable inner width is roughly
  half its bounding box, so a diamond sized like a rectangle clips its label.
  Measure per geo with `text-metrics.mts` and feed the result into T0's sizing.

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

- [ ] **T16b. A userland component library, as the composability test.**
  Tier 1 primitives ship in `tldsl`. Domain vocabularies deliberately do not.
  Prove that split is right by building one *outside* the library: a
  fixture-side module defining a small set - C4-ish (`Person`, `System`,
  `Container`) or flowchart-ish (`Decision`, `Terminal`, `Process`) - written
  purely as components over `Box`, `geo` and the tier 1 containers, plus a
  diagram that imports and uses it.

  **This is an architectural test, not a demo.** If a domain vocabulary cannot
  be expressed in userland, the primitives are missing something, and that
  finding matters more than the fixture does. Write down anything that forced a
  library change.

  It also exercises a path nothing has ever tested: **multi-file diagrams.**
  Every fixture today is a single file. esbuild bundling and the
  metafile-driven watch set were built for imports (`docs/jsx-pivot.md`
  decision 12) but nothing in the repo imports anything.

  **Acceptance:** the component module compiles; the diagram importing it
  renders; editing the *imported* file triggers a reload in `serve`; and a
  deliberate error inside the imported file produces a diagnostic whose span
  points at that file's path and line, not the importing file's.

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

### Phase 8 - ship it as a Claude Code plugin

tldsl was built to be agent-agnostic and stays that way: the DSL, the CLI, the
layout engine and the viewer know nothing about any model. What changes is the
**delivery mechanism**. The way this gets used is as a Claude Code plugin - a
skill that teaches the vocabulary, hooks that react to diagram edits, and a
command that drives the round-trip.

#### The rule that keeps the core honest

> **The plugin is a delivery mechanism, not a layer.** Everything a hook, skill
> or command does is a plain `tldsl` CLI invocation. Delete the plugin directory
> and the tool still works, just less conveniently.

If validation logic, sync logic or overlay parsing ends up living *inside* a
hook, "the core is agent-agnostic" becomes a claim nobody can check. As a rule
it has a test: **every plugin file is either prose or a shell-out.** A hook that
computes something is a bug.

#### What the plugin needs from the core

| Command | State |
|---|---|
| `tldsl check <file>` | exists |
| `tldsl serve <file>` | exists |
| `tldsl render <file> <out.png>` | **missing** - lives in `tools/screenshot.mts` |
| `tldsl overlay show <file>` | **missing** - Phase 7 |
| `tldsl verify <file>` | **missing** - Phase 7, T21 |

`tools/` scripts are development-only: not in `bin`, not built by
`tsconfig.build.json`, run through `tsx`. A hook cannot call them.

#### Confirmed plugin mechanics

Checked against the Claude Code docs, not assumed. The constraints that shape
the design:

- **Layout.** Only `plugin.json` goes in `.claude-plugin/`. `skills/`,
  `hooks/hooks.json` and `commands/` sit at the plugin root.
- **Hooks cannot see skill state.** There is no field exposing which skills are
  loaded. The gate is the file path: a `matcher` on `Edit|Write` plus the `if`
  field with a glob, so the hook only spawns for a matching path. That serves the
  real intent - silence in sessions that have nothing to do with diagrams.
- **`PostToolUse` fires after the tool ran**, so it observes and injects; it
  cannot block. `tool_input.file_path` is present uniformly for Write, Edit and
  MultiEdit.
- **Context injection** is `hookSpecificOutput.additionalContext` (or plain
  stdout on `SessionStart` / `UserPromptSubmit`).
- **A hook cannot attach an image.** It can only emit a path; the agent then
  Reads it if it wants. That is exactly the intended shape - the render is
  offered, not forced into context.
- **`async: true` fires and forgets and cannot inject context.** This is the
  constraint that decides the render design, below.
- **Commands are namespaced by plugin name**, so `/tldsl:sync` comes for free.

### Tasks

- [ ] **T23. `tldsl render` - a real CLI command, cropped to content.**
  `tools/screenshot.mts` becomes `tldsl render`, built and shipped like `check`
  and `serve`. But do not port it as-is: the current approach is wrong.

  **Stop screenshotting the viewport.** Today's tool sizes a 1600x1200 window,
  presses `Shift+1` to zoom-to-fit, injects
  `.tlui-layout { display: none }` to hide tldraw's own UI, then captures the
  page. The output is viewport-shaped, so a diagram that is not 4:3 gets bands
  of empty grid, and the whole thing depends on a zoom keystroke and a CSS hack
  landing correctly.

  tldraw exposes the right primitive directly:

  ```ts
  editor.toImage(shapes: TLShape[] | TLShapeId[], opts): Promise<{blob, width, height}>
  ```

  with `bounds`, `padding` (default 32), `scale`, `pixelRatio`, `background`,
  `darkMode` and `format`. It crops to the requested shapes by construction - no
  UI, no grid, no zoom-to-fit, no CSS injection, no viewport dependency.

  **Surface:**
  ```
  tldsl render <file> <out.png> [options]
    (default)        every shape on the page, tightly cropped
    --frame <id>     one frame (confirm whether tldraw includes its children;
                     if not, resolve descendants before calling)
    --shapes <ids>   comma-separated shape ids
    --padding <px>   default 32
    --scale <n>
    --format png|svg|jpeg|webp
    --dark
    --no-background
  ```
  **Pin `pixelRatio`.** It defaults to 2 for bitmap exports, and this plan
  compares PNGs across revisions - an unpinned default makes output depend on a
  library default that can change.

  Getting the blob to Node: `toImage` returns a `Blob` in page context, so
  transfer it out of `page.evaluate` as base64 or an array buffer and write it
  from the CLI.

  Two constraints that survive from the old approach:
  - **Reuse a running `serve` if there is one.** Load-bearing, not an
    optimisation - see T25. A browser still has to be running for tldraw to
    render at all; against a warm `serve` this is one `evaluate` call. Discovery
    is part of the task: a pidfile or a well-known port record, not guessing.
  - **playwright is a `devDependency`** and pulls browser binaries. Make it
    optional and fail with an actionable `npx playwright install chromium`
    message rather than making every install heavy.

  Keep `tools/screenshot.mts` working, or reduce it to a thin wrapper - this
  plan's own tasks depend on it.

  **Acceptance:** the default crop is the content bounding box plus padding,
  with zero empty grid and no tldraw UI in the image; `--frame` exports one
  frame and its children and nothing else; output is byte-identical across two
  runs of the same input. **And verify once that the export path agrees with
  what the screen actually shows** - tldraw builds the export from shape records
  rather than the mounted DOM, so compare a `toImage` result against an
  old-style viewport screenshot on one fixture before trusting it. This plan
  says "when the report and the pixels disagree, the pixels are right", and that
  rule is only sound if the exported pixels are the screen's pixels.

- [ ] **T24. The skill.**
  Teaches the vocabulary: the Phase 5 primitives, the Phase 3 styling props, the
  `on` attachment from T7, and the workflow - `serve` while iterating, `check`
  before claiming done, `render` to actually look at it.
  **The skill is prose, not logic**, and it should be short enough to actually
  get read. A long skill nobody loads is worse than none, because it implies
  coverage that is not there.
  **Acceptance:** an agent given only this skill and no other context writes a
  non-trivial diagram that compiles clean on the first attempt. Test that; do
  not review the prose and call it done.

- [ ] **T25. The hooks.**
  Three behaviours, gated by the `if` glob on `*.tldsl.jsx`.

  **Validate on edit.** `PostToolUse` on `Edit|Write` runs `tldsl check` and
  injects any diagnostics through `additionalContext`. Fast, no browser.

  **Offer the render - synchronously, against a warm `serve`.** The obvious
  design is a background render, and it does not work: `async: true` hooks
  cannot inject context, so a backgrounded render has no way to tell the agent
  where the PNG went. The two-stage workaround (async writes a file, a later
  `UserPromptSubmit` hook reads it) means the agent sees the previous edit's
  render, which is worse than nothing.
  So: if `serve` is running, render synchronously - it is a screenshot against a
  warm page, fast enough to sit in a hook - and inject the path. If it is not,
  inject a hint to run `tldsl render` and let the agent decide whether it cares.
  **This is why T23's serve-reuse is load-bearing.** Do not block the session
  for a cold chromium start on every edit.

  **Flag unabsorbed canvas changes.** A non-empty `*.tldsl.overlay.json` means
  source and canvas disagree. `UserPromptSubmit` with `additionalContext`, so it
  lands at the start of a turn rather than after some unrelated tool call:
  "N unabsorbed canvas changes in `x.tldsl.jsx` - run `/tldsl:sync`". A glob plus
  a stat, cheap enough to run every turn, and well inside the 30s cap that event
  has.

  **Acceptance:** a session that never touches a `.tldsl.jsx` produces zero hook
  output; a broken diagram surfaces its diagnostic without the agent asking; no
  hook stalls the session longer than `tldsl check` takes; and with `serve` cold,
  editing a diagram produces a hint rather than a ten-second pause.

- [ ] **T26. `/tldsl:sync`.** *Blocked on T19 and T21.*
  Reads `tldsl overlay show`, rewrites the JSX, runs `tldsl verify` until it
  passes, leaves a normal reviewable diff. This is `absorb` from Phase 7,
  delivered as a command rather than a subprocess holding an API key.
  The command is prose driving two CLI calls. If it needs to parse or compute
  anything itself, the missing piece belongs in the CLI.
  **Acceptance:** the canvas-first case from T22 works end to end through the
  command; `tldsl verify` passes afterwards with an empty overlay; the diff is
  reviewable and touches nothing unrelated.

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

3. ~~**Are stickies the right shape for notes at all?**~~ **Answered:**
   `<Note>` becomes a geo shape with a warm fill, so it inherits everything T0
   gives boxes - container-aware width, word wrap, aspect target - instead of
   being a special case layout has to work around. `<Sticky>` stays for when an
   actual sticky is wanted; the code already exists so keeping it costs nothing.
   **Notes also gain attachment**: a note can be bound to a node or an edge
   rather than being a flow participant. Folded into T7.

4. ~~**Should `BOX_MIN_H` exist?**~~ **Answered:** it is dead code - the
   height formula never goes below it. Folded into T0.

5. ~~**Which primitives are actually worth having?**~~ **Answered:** tier 1
   only in the library - `Row`, `Col`, `Grid`, `Group`, `Pipeline`, `Layers`,
   `Swimlanes`, `Graph`. These carry layout semantics and are
   archetype-agnostic. Shape aliases and domain vocabularies (C4, flowchart, ER)
   stay in userland and get built as fixtures instead, which doubles as the test
   that the primitives are composable enough - see T16b.
   **Still open: UML sequence diagrams.** They are the one archetype not
   composable from tier 1 - lifelines are a vertical time axis, messages are
   ordered events, activation bars are a third dimension - so they cannot be a
   userland component either. That makes them a separate decision: a third
   layout engine alongside stack and ELK, or an explicit non-goal. Note that
   `tests/corpus/sequence.tldsl.jsx` is **not** a sequence diagram, it is a
   linear 14-step chain, and the name is a trap for whoever reads the corpus
   next.

6. ~~**Named styling, or raw enums only?**~~ **Answered: raw enums only.** A
   userland component *is* the variant mechanism - if `<System>` is
   `<Box color="blue" fill="semi"/>` in a fixture, the library needs no
   `variant` prop, and a shared palette is a `theme.jsx` exporting constants.
   The "thin `variant`" clause in `docs/jsx-pivot.md` decision 9 is
   **superseded**, not deferred.
   **Library defaults: neutral, with one exception.** A frame gets a very light
   fill, because containment is structural and always true - "these things are
   grouped" is never a guess. Colour on a *box* would be a guess, and a wrong
   colour is worse than none because it implies meaning that is not there. The
   reference for what good styling looks like is T13's realistic fixtures, so it
   is demonstrated rather than imposed.

7. ~~**Round-trip scope.**~~ **Answered:** structural changes must be
   supported, not just positions. Resolved into the overlay-plus-absorb design
   in Phase 7 - the overlay carries adds and deletes as well as moves, and the
   part that needs intent is quarantined into an explicit reviewed step.

8. ~~**Does an edited canvas ever win over source?**~~ **Answered:** yes, by
   definition - the overlay is applied over the compiled scene, so it wins until
   absorbed or reset. Staleness is the remaining risk and T19 has to settle it.

9. ~~**Is `absorb` a CLI command, an agent skill, or both?**~~ **Answered:** a
   plugin command, `/tldsl:sync`. The hard part was never the model call, it is
   the contract - `tldsl overlay show` to read the pending state and
   `tldsl verify` to prove the result. Both are model-free CLI commands, so
   absorb reduces to "read the first, edit the JSX, run the second until it
   passes". tldsl keeps no API key, no network and no model dependency, and the
   diff review happens where the user already reviews diffs. A CLI `absorb` stays
   possible later as a thin wrapper over the same two commands. See Phase 8.

## Discovered work

Append here. Do not act on these during the wake that finds them; they get
promoted into the task list by the human.

- Anchor syntax `id.anchor` collides with dotted namespaced ids, so a component
  cannot prefix its children with `${ns}.` - filed as a bd bug (P1). Blocks any
  task that wants author-specified anchors.
- `flow()` edges carry no source span; diagnostics report them at `.:0:0`
  (bd bug, P2).
- **`tests/corpus/sequence.tldsl.jsx` is misnamed.** It is a linear 14-step
  chain, not a UML sequence diagram - a `<Pipeline>` in disguise. Nothing in the
  corpus is a real sequence diagram. The name is a trap for whoever reads the
  corpus next and should be `linear-chain`, but renaming touches a fixture, so
  it needs to be a deliberate task rather than a drive-by.
- `docs/layout-champion.md` is still in the tree and still describes
  pre-`2484ffa` geometry. T1 marks it historical.
- **`estimatedNoteSize` still uses a flat `NOTE_CHAR_PX = 15`**, the same class
  of bug T0 just removed from box sizing. Notes now have measured glyph metrics
  available (`textWidth` in `domain/layout/glyph-metrics.ts`) but do not use
  them. Left alone because notes are T7's surface.
- The measured glyph table covers printable ASCII only; anything else falls
  back to the widest advance (21.4px), so a CJK or emoji label over-reserves
  badly. Nothing in the corpus exercises it.
- `wrapLineWidths` re-measures the whole candidate line per word and
  `fitBoxWidth` binary-searches over it, so sizing one label is O(words^2 log
  px). Irrelevant at corpus scale; would matter for a very long label.
- Every fixture except `sequence` renders byte-identically at aspect target 4,
  5 and 6, so the corpus barely constrains that knob. Worth re-tuning once T13
  adds diagrams people actually draw.
- `multi-region` and `release-pipeline` both park their `<Note>` in a band of
  empty canvas far below the diagram - visible in the renders, untouched by
  T0, and squarely T7/T8.
- **The corpus crossing total is dominated by one file.** `wide-fanout` is 29 of
  60. A change that only helps fan-out edges would halve the headline number
  while leaving seven of eight diagrams exactly as they are; conversely T3's
  "no file gains a crossing" gate is nearly free to pass while barely moving the
  total. Read the per-file column, not the total.
- **`arrow-truth` counts (arrow, crossed shape) pairs, not arrows.** One chord
  through four boxes scores 4. That is the right metric for T3-T5 but it is not
  comparable to any "arrows that cross something" figure in the historical docs.
- **Frames count as crossable shapes.** In `deep-nesting` the nested
  `System`/`Service`/`Module`/`Unit` frames are geo shapes, so an edge leaving
  its frame is charged once per frame boundary it passes through. Worth deciding
  in T2 whether a frame the arrow's own endpoint lives inside should count.
- `layout-report.mts` prints no shape-kind column, so frame-vs-leaf had to be
  inferred from which ids appear in the `parent` column. A `kind` column would
  make the baseline table trivially re-derivable.
- The root container is absent from the geometry table (children of `sequence`
  list `parent=sequence`, but there is no `sequence` row), so `shapes` in the
  baseline excludes the document frame itself.
- **Phase 1 as written cannot touch 25% of the corpus.** `deep-nesting` (9) and
  `hexagonal` (6) are 100% `cross-container`, so a T3-T5 that triggers on the
  `same-axis skip` bucket leaves 15 of 60 crossings alone by construction. Six
  of `deep-nesting`'s nine are *geometrically* skips - a straight vertical run
  through a stacked neighbour, `Gateway -> Router` clipping `Config` - and only
  miss the bucket because the endpoints sit in different frames. Widening T3's
  trigger from "same container" to "collinear and between, whatever the
  container" would pick them up for free.
- **The T1 frame question answered itself.** "Crossed shape is an ancestor frame
  of an endpoint" is 0 across all eight files, so the ancestor-frame policy needs
  no decision until a fixture exercises it. `deep-nesting`'s crossed shapes are
  boxes (`Config`, `Router`, `Metrics`), not the `System`/`Service` frames - the
  earlier Discovered-work note guessed otherwise.
- **T3 and T6 overlap on 19 edges.** Every one of `wide-fanout`'s 19 same-axis
  skips has a source with out-degree 18, so it is simultaneously a fan. Whichever
  of T3/T6 lands first takes the credit for those 19 and the second will look
  like it did almost nothing. Measure T3 on the other seven files to isolate it.
- **`wide-fanout` is a `grid`, and its rows are only a layout artefact.** The
  classifier had to derive the skip axis from geometry because the container's
  declared mode is `grid`, which has no single axis. Anything in T3-T6 that
  reads `layout` to decide an axis will silently do nothing on this file.
- **The bend magnitude is derived, not tuned, and it can be very large.**
  Required sag is `clearance / 4t(1-t)`, which blows up for a crossed shape
  near an endpoint (small `t`). `multi-region` wants ~135px of bow over a 228px
  chord - a near-semicircle. Nothing in the corpus hits a pathological value
  because the viability gate stops it, but a wide box crossed near an endpoint
  would ask for an enormous arc. A cap (and falling back to straight above it)
  may be needed once T13 adds real diagrams.
- **The viability gate silently declines to help.** When neither side has room,
  T3 leaves the edge straight, so a crowded diagram gets no improvement and no
  signal that it wanted one. `multi-region`'s middle region is the live case: 2
  of its 6 crossings survive purely because the region frames are 40px apart.
  Widening inter-container gaps (a T8-shaped change) would let those bend.
- **Frames are invisible to the router.** The crossed set is boxes and notes
  only, matching the metric, so a bow may sail straight through a sibling
  frame's border and empty interior. It looks acceptable today only because
  every frame in the corpus is packed with boxes that *are* counted.
- **PNG export size is now a function of arrow curvature.** `long-labels`,
  `release-pipeline` and `wide-fanout` all grew by 20-70px because the export
  crops to content and bows reach past the boxes. Any future test that pins an
  exported image size will be sensitive to routing changes.
- **`isExact` is load-bearing for any anchored terminal, and the metric cannot
  see it.** An anchor on the outline plus tldraw's arc clipping can trim a
  bowed arrow to a 10px stub, and a deleted arrow scores as zero crossings.
  Every future change that moves a terminal needs the path-length sweep
  (`awk` over `arrow-truth` output: flag any path whose endpoints are under
  ~15px apart) run alongside the crossing count. Worth promoting into
  `arrow-truth` itself as a permanent "degenerate arrow" line.
- **T5's premise is now visible in two files.** `wide-fanout`'s four
  `Dispatcher -> Worker 2..5` arcs and `release-pipeline`'s row-1 skips share a
  span and bow to nearly the same magnitude, so they render as one thick stroke
  with four arrowheads. Legible but ugly - exactly the lane problem T5 names.
- **`multi-region`'s viability gate no longer bites.** The 2 crossings T3 left
  there were blamed on the 40px inter-frame gap. With anchored chords the
  required sag dropped below the gap and both bend fine, so the "widen
  inter-container gaps" note from T3 is weaker evidence than it looked.
- **The remaining 27 split cleanly by owner.** 15 cross-container (deep-nesting
  9, hexagonal 6) and 10 fan (all wide-fanout, out of `Dispatcher`) and 2 other
  (long-labels). Nothing left in the corpus is a same-axis skip, so any further
  routing work has to widen its trigger past "both endpoints share a
  container" - the 6 deep-nesting crossings that are geometrically skip-shaped
  are the cheapest target.
- **PROMOTED TO T6b.** `deep-nesting`'s four crowded pairs had no owner. They are
  the vertical chain at x=297: four cross-container arrows drawn as bare
  collinear segments, two of them overlapping 100%. T6 is placement for fans
  and does not reach them; nothing else in T6-T18 claims cross-container
  routing. If the T5 crowding criterion is meant to be reachable, a task that
  widens `computeEdgeRoutes` past the `from.parentId !== to.parentId` gate has
  to exist. That same widening is the cheapest target for the 15 remaining
  cross-container crossings, so it is one task, not two.
- **Collinearity, not just overlap, is a crowding source.** `hub -> leaf-7` and
  `hub -> leaf-14` are 100% crowded because `leaf-7` sits exactly on the ray to
  `leaf-14` - one arrow is a prefix of the other. Grid placement of a fan makes
  this common: any two targets in the same direction from the source at
  proportional distances collide. Worth stating as an explicit constraint in
  T6's placement rule, because a fan block that is a clean column or row
  reproduces it exactly.
- **The lane viability step-down is untested in the corpus.** No candidate in
  any of the eight files had its rank reduced - every lane offset fit on the
  first try. So the `while (rank > 0 && gap < ...)` loop in `finalizeRoute` is
  covered only by construction, not by a fixture. A denser diagram (T13) would
  be the natural place to exercise it.
- **`multi-region`'s outer lane runs within a few px of its region frame's left
  border.** Not a crossing (frames are excluded from the crossed set by design,
  recorded under T3), and it reads fine, but the lane mechanism has no notion of
  the parent frame's own bounds, so a third lane in that column would bow
  straight out of the frame. The gap check only looks at sibling boxes and notes.
- **`arrow-truth` now prints two metrics, and only one is in `docs/baseline.md`'s
  main table.** Crowded pairs are tracked in the "After T5" section instead.
  Whoever next revises the baseline should decide whether crowding earns a
  column of its own alongside crossings, since it is now a standing check.
