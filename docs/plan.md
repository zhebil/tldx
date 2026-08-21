# tldsl layout plan

The ordered worklist for the layout loop. **This file is the only state that
survives between sessions.**

Work the topmost unchecked task. Do not pick. Do not reorder. Do not invent a
task that is not written here - if you think of one, append it to **Discovered
work** at the bottom and carry on with the top item.

There is no A/B judge. Every task below carries an acceptance criterion that a
tool can check. If a criterion turns out unmeasurable or unreachable, that is a
defect in the task, not a licence to guess and not a reason to halt: take the
default that changes least, log the question under
**Questions for the human**, and carry on.

Branch: `ralph/jsx-layout`. Never work on `main`.

---

## Standing decisions from the human

These override any acceptance criterion below that contradicts them.

- **A crossing is not automatically a defect.** Crossing counts are a proxy for
  legibility, not the goal. Some crossings read perfectly well - a short chord
  over a gap between boxes costs nothing, and forcing it to zero can cost more
  in detours and stretched layout than it saves. Where a task's acceptance is a
  crossing count, treat it as a direction of travel, not a contract: if the
  render looks right and the number is short, tick the box, record the number,
  and say the remaining crossings were judged acceptable. **Do not distort a
  layout to reach a number.** The pixels decide.

- **Frame title collisions are acceptable. Do not spend a task on them.** tldraw
  draws frame titles itself, outside the geometry the layout controls, and their
  size changes with zoom - so a title overlapping a neighbouring frame's edge is
  not reliably fixable and not worth reserving space for. T8 already reserves
  clearance where tldraw draws it; that is as far as this goes. Do not open
  follow-up work on title overlap, and do not count it as a regression.

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

- [x] **T5. Lanes for parallel skips.** *Ticked by T6b, which was what it was
  deferred to. The whole corpus now measures **zero** crowded pairs, so the
  acceptance below holds as written. The note further down explains why the box
  sat unchecked for three wakes and is kept as the record.*
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

- [x] **T6. Fan-out placement.**
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

  **Done. `wide-fanout` 10 -> 0 crossings, corpus total 27 -> 17, and its two
  crowded pairs went to 0 as well. No other file moved on either metric.**

  What was built, in `src/domain/layout/stack.ts` only - `routing.ts` is
  untouched. `findFanGroups` (exported, unit-tested) walks a container's flowed
  ids and emits one group per source with >= 4 *distinct* targets whose only
  edge, in or out, is back to that source; parallel edges collapse to one
  neighbour, so `hexagonal`'s seven `core -> driven-ports` edges do not
  register. `collapseFanGroups` replaces each group with one synthetic rect at
  the source's index, `expandFanBlocks` writes the members back once the parent
  flow has placed the block. The block is **a single unwrapped row, source at
  its head** - T6's "rows that start at its edge". Gated on `mayAutoGrid`, the
  same flag the auto-grid uses, so an explicit `layout=`/`cols=` is never
  silently overridden.

  Why that works: it is a placement change that buys a *routing* change for
  free. Every fan edge now shares a y-range with its source, so `deriveAxis`
  resolves to horizontal and T3's bow, T4's side anchors and T5's lanes all
  fire on edges they had been declining. That is the same reason
  `hub -> leaf-1..5` already cost zero crossings in the old grid while
  `hub -> leaf-6..18` cost ten.

  **The column form was built first and measured worse: 10 -> 32.** Recorded so
  it is not retried. Source on the left, targets stacked in a column beside it,
  source vertically centred - the chord from the centred source to a target
  near either end of a 2000px column is steep, so it enters the column's x-band
  far from its target and travels *inside* that band, slicing every rectangle
  on the way up. This task's own note above ("no target sits on the ray to
  another target") is true of that layout and turns out to be irrelevant: it
  constrains where the chords *end*, not the band they pass through. Placement
  alone cannot make a diagonal chord safe. Putting the endpoints on a shared
  axis and letting the existing bow handle it can.

  Looked at the PNG. No arrow touches a box anywhere in the file now; the old
  render had chords drawn straight through Worker 7's and Worker 8's labels.
  The costs are real and both went to Discovered work: the canvas is 3722 x 204
  (was 2453 x 1905), and the 17 nested arcs converge into a solid wedge of ink
  for the first ~15% of their length at `Dispatcher`. `crowdedPairs` scores that
  wedge 0 because the arcs diverge before the one-third-of-length threshold -
  the metric is not wrong, it just does not see convergence at a shared anchor.

  Free choices recorded: fan direction is fixed source-left / targets-right and
  does not read `direction`; the row never wraps, because any second row loses
  the shared axis that makes the whole thing work; `minOutDegree` stays at T6's
  own 4 and was not tuned.

- [x] **T6b. Route cross-container edges.**
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

  **Built as specified. The box stays unchecked: half the criterion is not met,
  and that half is not reachable by the mechanism this task describes.** The
  change itself is a clear win and is shipped - do not revert it, and do not
  rebuild it.

  What was built, exactly the two gates named above, widened together in
  `src/domain/layout/routing.ts`: the `from.parentId !== to.parentId` bail in
  `computeCandidate` is gone, and the `crossed` filter no longer requires
  `s.parentId === from.parentId`. `RouteCandidate.parentId` became the
  **lowest common ancestor** of the two endpoints' parents (new `ancestorChain`
  / `lowestCommonAncestor` helpers), because a cross-container edge has no
  single parent and that field is only the lane-grouping key. Nothing else
  moved - `deriveAxis`, the `others`/`gap` scan and the overshoot viability
  test already ranged over every shape, exactly as this task predicted. Frames
  stay excluded from `crossed`: `tools/arrow-truth.mts` only collects `geo` and
  `note` tldraw shapes, so a frame border is never scored as a crossing.

  **The numbers: 17 -> 11 crossings, cross-container 15 -> 9, crowded pairs
  4 -> 0.** `deep-nesting` 9 -> 3 and its four crowded pairs are gone; no other
  file moved and none regressed on either metric. Arrow counts per file are
  unchanged and no rendered path is under 15px, so nothing was bought by
  deleting an arrow. `npm run check` green (40 files, 360 tests). Only
  `docs/renders/deep-nesting.png` changed. Looked at it against the previous
  render: the vertical chain used to be four collinear segments stacked into
  one stroke, piercing five boxes with four arrowheads on a single line; it is
  now four separate arcs and none of them touches a box.

  **Why cross-container <= 5 was not reached.** All nine survivors are
  genuinely diagonal - neither the x-ranges nor the y-ranges of their endpoints
  overlap, so `deriveAxis` returns `null` and the edge is declined before any
  of the routing machinery runs. They are `hexagonal`'s `usecases ->
  p-notifications` (x2), `usecases -> p-clock` (x2), `usecases ->
  p-orders-repo`, `http -> p-create-session`, and `deep-nesting`'s
  `l3-handler -> l4-parser` and `l4-serializer -> l1-gateway` (x2). Verified
  from the absolute coordinates in `tools/layout-report.mts`, not inferred.

  `deriveAxis` is arguably a third trigger gate rather than a second mechanism,
  so widening it was built and measured before writing this: fall back to the
  dominant axis, `horizontal` when `|dx| > |dy|` else `vertical`. **It is an
  exact no-op on all eight files** - byte-identical route maps, byte-identical
  PNGs. The fallback is reachable only when both perpendicular bands are
  disjoint, and `isCrossing` then demands an obstacle tall (or wide) enough to
  bridge that gap; no box in this corpus is. Reverted, and recorded here so it
  is not tried a fourth time. Bowing a diagonal chord needs a genuinely
  different routing strategy - a detour waypoint, or moving the endpoints -
  which this task's own "do not invent a second mechanism" rules out. That is
  the contradiction, and the plan says report it rather than improvise.

  T5's box **was** re-checked and **is now ticked**: the corpus measures zero
  crowded pairs in every file.

  **Re-verified in a later wake, from the coordinates, not from this write-up.**
  `crossing-classify` still reports cross-container 9 (total 11). The six edges
  behind those nine pairs, with the overlap of their endpoint bands:

  | edge | x overlap | y overlap |
  |---|---|---|
  | `deep-nesting` `e-handler-parser` | -33 | -130 |
  | `deep-nesting` `e-serializer-gateway` | -8 | -538 |
  | `hexagonal` `hx-4` `http -> p-create-session` | -80 | -86 |
  | `hexagonal` `hx-9` `usecases -> p-orders-repo` | -80 | -123 |
  | `hexagonal` `hx-14` `usecases -> p-notifications` | -80 | -123 |
  | `hexagonal` `hx-15` `usecases -> p-clock` | -80 | -197 |

  Every one is negative on both axes. There is no axis-aligned cross-container
  crossing left in the corpus - the bucket name outlived its contents, and what
  survives in it is a different failure mode wearing the same label. The four
  `hexagonal` `usecases -> p-*` rows are one source fanning into a column of
  ports offset from it on both axes; the -80 is the container gutter.

  **Defaulted to option 1 and ticked; question logged for the human.** The
  crowded-pairs and no-regression halves of the criterion are fully met and the
  crossing half is a clear win short of its number. Options 2 and 3 are in
  *Questions for the human*.

  **Three resolutions, for the human:**

  1. **Accept 9 as the floor and tick T6b.** Changes least. The shipped change
     is a clear win on its own terms - 17 -> 11 crossings, `deep-nesting` 9 -> 3,
     all four crowded pairs gone - and the half of the criterion about crowded
     pairs and regressions is fully met.
  2. **Re-word the acceptance** to cover only cross-container edges that are
     axis-aligned. By that reading the bucket went 15 -> 0 and T6b passed
     outright.
  3. **Add a task that owns diagonal edges**, and let T6b's number stand until
     it lands. This is the only option that makes <= 5 true as written. Two
     shapes it could take, both already in Discovered work: a detour waypoint in
     `routing.ts` (needs a real segment-vs-rect test - `segmentHitsRect` in
     `arrow-truth.mts` already is one, and `isCrossing`'s demand for
     perpendicular overlap with *both* endpoints is a second independent reason
     diagonals survive), or placement, which is the trick that has now worked
     twice (T6 took `wide-fanout` 10 -> 0 by moving boxes, not arrows).

- [x] **T7. Notes: shape, and attachment.**
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

  **Done - all five acceptance clauses met.** `<Note>` emits a `geo` rectangle
  (`color: "yellow"`, `fill: "semi"`) sized by T0's `fitBoxWidth` /
  `boxHeightForWidth` instead of a 200px sticky; a new `<Sticky>` component
  keeps the old `noteShape` path, so B9 is alive for `<Sticky>` and dead for
  `<Note>`. `<Note on="id">` leaves its container's flow (reusing the exclusion
  hard-pinned children already get) and `src/domain/layout/attach.ts` places it
  24px off the target on the first clear side of right/below/left/above.
  **The numbers: canvas area -41% on `long-labels` (2064x1066 -> 1538x848),
  -32% on `multi-region` (900x1222 -> 900x832), -9% on `release-pipeline`;
  corpus crossings 11 -> 9; crowded pairs 0; overlapping shape pairs 0
  everywhere.** Attached notes measure exactly 24px from their target and
  overlap nothing; unattached notes measure 40px, 40px and 96px from the shape
  preceding them in source order, all under the 120px bound. `npm run check`
  green (41 files, 380 tests). Only the three note-bearing renders changed.

  Three choices, all recorded because they are the reversible half of this task:

  - **A geo note receives its container's shared box width but never votes on
    it, and never takes the shared height.** Not optional: `release-pipeline`
    is a grid of 62px-tall boxes, and letting a note vote on the shared height
    makes every box in the file ~300px tall. In a container with no flowed
    boxes the note falls back to its own `fitBoxWidth`.
  - **Attached notes are re-parented to the document root** with absolute
    coordinates. tldraw frames clip their children, so a note parented to a
    frame and placed beside that frame is invisible. Growing the frame instead
    would move its siblings, which the acceptance forbids.
  - **The overlap-check whitelist this task asks for was not built.** Every
    candidate placement is separated from its target by a 24px gap, so an
    attached pair can never overlap and there is nothing for a whitelist to
    exempt. See `## Questions for the human`.

  `on` naming an edge resolves to a 1x1 rect at the midpoint of the two
  endpoint *centres*, ignoring the arc bow T3-T5 add. That is enough - the
  note only has to land near the edge. A `flow()` edge has a synthesized id;
  it is addressable like any other, and `ir/note-target-not-found` names the
  id when it does not resolve. The unattached-note fallback needed no code: a
  note already flows in source order directly after the content it follows.

- [x] **T8. Reclaim dead whitespace.**
  Frames carry large empty margins - `hexagonal`'s outer frame has roughly
  110px of empty canvas above its first child and 50px below its last. Measure
  what tldraw's frame chrome actually needs (a title is 14px tall by
  `text-metrics`; `FRAME_TITLE_PX` is set to 32 and `FRAME_PAD_INNER` to 32)
  and set the constants from the measurement.
  **Acceptance:** canvas area drops on at least four files, with zero new
  overlaps and no label or title clipped in the renders.

  **The measurement, from tldraw's source rather than the render.** A frame's
  name heading is drawn entirely *outside* the frame, above its top edge:
  `FrameHeading.js` positions the DOM node with `bottom: 100%`, and
  `FrameShapeUtil.toSvg` draws the heading rect at `y = labelBounds.y - 6` with
  `height = labelBounds.height`, where `getFrameHeadingSize` returns
  `Box(0, -opts.height, w, opts.height)` and `getFrameHeadingOpts` fixes
  `height: 24`. So the heading occupies exactly y in [-30, -6] relative to the
  frame's own top edge, and **zero pixels inside it**. The 32px `FRAME_TITLE_PX`
  that `sizeFrame` added to every frame's top padding was protecting against
  chrome that is not there.

  **What was built.** `FRAME_TITLE_PX` 32 -> **30** (the measured extent), its
  doc comment rewritten to say it is clearance *above* a frame, and `sizeFrame`
  now adds it only when the frame has a frame child - a nested frame's heading
  is the one thing that does intrude into a parent's top padding. A frame whose
  children are all boxes or notes now gets `padTop = pad`, symmetric with its
  other three sides. Three lines of production code; `stack.test.ts` gained a
  test for the nested-frame branch and had the box-only case corrected.

  **The numbers.** Canvas area dropped on **three** files, not four:
  deep-nesting 594x790 -> 594x752 (-4.8%), hexagonal 1354x650 -> 1354x616
  (-5.2%), multi-region 900x832 -> 900x766 (-7.9%). The other five are
  byte-identical, and so are their renders. Overlapping shape pairs 0
  everywhere, crossings unchanged at 9 (deep-nesting 3, hexagonal 6), crowded
  pairs 0. Looked at all three renders: every frame title still sits clear
  above its frame and nothing is clipped; the inner frames of `hexagonal` and
  `deep-nesting`'s `Unit` now hug their contents instead of carrying a 48px top
  margin against a 16px bottom one.

  **Why four files was unreachable.** Only three of the eight corpus files
  contain a `<Frame>` at all - `long-labels`, `release-pipeline`, `sequence`,
  `sparse-graph` and `wide-fanout` have none, so no change to frame chrome can
  move their canvas by a single pixel. Three is the ceiling, and all three were
  taken. Logged under `## Questions for the human`.

  **Not fixed, deliberately.** A nested frame that is *not* the first child in
  a `col` still has its heading drawn into the gap above it, and
  `deep-nesting`'s gaps are 12-16px against the 30px the heading needs. It does
  not read as broken today only because headings are left-aligned and the boxes
  above are centred, so they miss each other horizontally. Reserving that
  clearance properly would *grow* the canvas, which is the opposite of this
  task; filed to Discovered work.

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

- [x] **T9. Pass-through style props that do not affect layout.**
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

  **Built.** `src/domain/ir/styles.ts` (new) holds the four enum tuples copied
  from `@tldraw/tlschema`'s `values` arrays, so `domain/` still imports no
  tldraw. `lower.ts` gained one generic `readEnum<T>()` in the shape of the
  existing `readDirection`/`readAlign`, wired into all four `lower*` functions;
  an unknown value pushes `ir/invalid-style-value` at the attribute's own span
  and drops the field. `builders.ts` turned four hardcoded arrow props and the
  geo `dash` into defaulted inputs, and `emit.ts` spreads the IR fields through.
  Layout needed no change: `stack.ts`, `attach.ts` and the ELK adapter all
  spread `...el`. New fixture `tests/e2e/fixtures/styles.tldsl.jsx` exercises
  all 13 colours, 5 fills, 4 dashes and 9 arrowheads plus frame/note/sticky
  colour, and compiles with zero diagnostics.

  **The numbers.** The whole scene JSON is **byte-identical** across all eight
  corpus files (compared against `HEAD` via a compile-and-dump script, not just
  `layout-report`), which is stronger than the acceptance asked for - no
  crossing count or canvas dimension can have moved, so `docs/renders/` and
  `docs/baseline.md` needed no re-render. `npm run check` green, 41 files /
  ~400 tests. Bad values produce spanned diagnostics:
  `bad.tldsl.jsx:6:7: error[ir/invalid-style-value]: 'color' must be one of
  black, grey, ... (got 'puce')`.

  **Three places the task's text did not match tldraw, resolved as follows.**
  (a) `frameShapeProps` is exactly `{ w, h, name, color }` - a tldraw frame
  shape has **no `fill` and no `dash`**. Frames therefore accept `color` only;
  `fill`/`dash` on a `<Frame>` stay `ir/unknown-prop`. (b) The "frames get a
  very light fill" default needed **no code**: `FrameShapeUtil.toSvg` already
  fills every frame with `theme.black.frame.fill` unconditionally. (c) `fill`
  has **five** tldraw values, not the four the task lists - the fifth is a
  literal `"fill"`. All five are accepted, because decision 9 says *raw tldraw
  enums* and rejecting a value tldraw accepts would be a bug the first author
  to try it hits.

  **Frame `color` compiles and validates but does not yet render.**
  `FrameShapeUtil.options.showColors` is `false` by default, so tldraw draws
  every frame in `theme.black` regardless of `props.color`; turning it on needs
  `FrameShapeUtil.configure({ showColors: true })` in `src/viewer/app.tsx`,
  which also changes the frame heading's fill and x-offset on every existing
  render. Not done here - it is a viewer change, not a lowering change, and it
  risks the byte-identical requirement this task is built around. Logged under
  `## Questions for the human`.

- [x] **T10. Text alignment and label colour.**
  `textAlign` (`start|middle|end`), `verticalAlign`, `labelColor`.
  **Name collision:** `align` is already taken - B1 added it as the container
  cross-axis alignment. Do not shadow it. Use `textAlign` on leaf shapes and
  write the decision down here, or rename the container prop and migrate the
  corpus in the same change.
  **Acceptance:** renders match the requested alignment; no prop name resolves
  to two different meanings depending on which component reads it.

  **Decision: `textAlign`, not `align`.** The container prop keeps its name and
  the corpus was not migrated - that is the change that touches least. On leaf
  shapes the DSL name is `textAlign`, mapped to tldraw's `align` at the
  `boxShape`/`noteShape` boundary in `src/contracts/builders.ts`. `verticalAlign`
  and `labelColor` keep tldraw's names: neither exists on a container, so
  neither can mean two things. `textAlign` + `verticalAlign` is also the CSS
  pairing. No prop name now resolves to two meanings.

  **What was built.** `TEXT_ALIGNS` / `VERTICAL_ALIGNS` added to
  `src/domain/ir/styles.ts` (both `start|middle|end`; tldraw's three `-legacy`
  horizontal values are deliberately not exposed). `textAlign`/`verticalAlign`/
  `labelColor` added to `IRBox` and `IRNote`, read through the existing generic
  `readEnum` in `lowerBox`/`lowerNote`, spread through `emitBox` and both
  branches of `emitNote`. `boxShape`/`noteShape` stopped hardcoding
  `labelColor: "black"`, `align: "middle"`, `verticalAlign: "middle"` and take
  them as defaulted inputs. Zero layout code touched. New fixture
  `tests/e2e/fixtures/text-align.tldsl.jsx`.

  **Scope: `<Box>` and `<Note>`/`<Sticky>` only.** `<Edge>` got no `labelColor` -
  `arrowShape` always emits `text: ""` until T12 adds arrow labels, so it would
  be dead. `<Frame>` got none of the three - `frameShapeProps` is exactly
  `{ w, h, name, color }`.

  **The numbers: the scene JSON is byte-identical across all eight corpus files**
  (compiled before and after via `git stash`, `diff -rq` clean). Every new prop
  is optional and unused by the corpus, so `docs/renders/` and `docs/baseline.md`
  were untouched - nothing moved. `npm run check` green, 403 tests in 41 files.
  `text-metrics.mts` on the new fixture shows no unexpected wrapping.

  Looked at the render: all nine `textAlign` x `verticalAlign` combinations are
  visibly distinct on boxes, and all three on notes and stickies.
  **Known gap:** sticky `labelColor` does not survive PNG export.
  `NoteShapeUtil.toSvg` hardcodes `labelColor: theme[shape.props.color].note.text`
  and ignores `props.labelColor` (its live `component()` honours it at
  `NoteShapeUtil.mjs:251`). Geo boxes and geo-notes are unaffected - their two
  label colours render correctly. The prop is right in the scene JSON; this is a
  tldraw export limitation, logged under Discovered work.

- [x] **T11. Font and size, with a per-(font, size) metric table.**
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

  **The table is four tables, not sixteen, and that is a measured result.**
  All 16 combinations were measured in a real browser (`tools/font-metrics.mts`,
  new - see below). Advance width scales *exactly* linearly with font size:
  predicting any size from that font's size-`m` table times
  `LABEL_FONT_PX[size] / 22` has a **max error of 0.001px** over every glyph of
  every font. So `glyph-metrics.ts` stores one 95-glyph table per font at `m`
  plus a scale factor, and `textWidth(s, ts)` applies it. Sixteen stored tables
  would have been 1500 hand-maintained numbers for no accuracy.

  **Two tldraw facts the task did not state, both verified in `node_modules`.**
  (a) Box *and* note labels use `LABEL_FONT_SIZES` (`s:18 m:22 l:26 xl:32`), not
  `FONT_SIZES` - checked in both `GeoShapeUtil.mjs` and `NoteShapeUtil.mjs`.
  (b) Line height is exactly `fontSizePx * 1.35` (`TEXT_PROPS.lineHeight`);
  measured 24.30 / 29.69 / 35.09 / 43.19. The old `BOX_LINE_H = 30` was
  `ceil(22 * 1.35)` all along, so it became `lineHeightPx(ts)` and the constant
  is gone. `BOX_PAD_Y` and `BOX_LABEL_PAD_X` stay constants - both are tldraw's
  `LABEL_PADDING`, which does not scale with size.

  **What was built.** `FONTS`/`FONT_SIZES` in `src/domain/ir/styles.ts`;
  `DRAW`/`SANS`/`SERIF`/`MONO_ADVANCE` tables, `TextStyle`, `fontScale`,
  `lineHeightPx` and a `(font, size)`-aware `textWidth` in `glyph-metrics.ts`;
  an optional trailing `ts?: TextStyle` threaded through `wrapLineWidths`,
  `boxHeightForWidth`, `fitBoxWidth`, `estimatedBoxSize` and `estimatedNoteSize`
  in `defaults.ts`. `font`/`size` on `IRBox`/`IRNote`, read through T9's generic
  `readEnum`, spread through `emitBox`/`emitNote`, and `boxShape`/`noteShape` in
  `builders.ts` stopped hardcoding `size: "m"` / `font: "draw"`. The layout call
  sites pass the element itself as the `TextStyle` - `IRBox` and `IRNote`
  structurally *are* one - so `stack.ts` and `layout.fake.ts` changed by 9 lines
  total. `<Edge>` was left alone; arrow labels are T12.

  **The `draw` table was deliberately not re-measured into place.** The fresh
  measurement agrees with it on **93 of 95 glyphs to 0.00px** and disagrees only
  on `" "` (7.15 stored vs 7.62) and `"#"` (21.40 vs 21.63), both under-reserved
  and both well inside `TEXT_SLACK_PX = 4`. Correcting them would move geometry
  for a sub-pixel gain, so the table is pinned with a comment saying why.

  **The numbers: scene JSON byte-identical across all eight corpus files**, so
  `docs/renders/` and `docs/baseline.md` were untouched. That was verified
  twice - the first check was worthless, see the tooling note. `npm run check`
  green, 42 files / 428 tests (up from 403).

  **Acceptance, checked.** `glyph-metrics.test.ts` iterates `FONTS x FONT_SIZES`
  (imported, never hand-listed) and asserts `estimatedBoxSize("Gateway", …)` has
  height exactly `lineHeightPx(ts) + 32` - one line - for all 16, plus a
  coverage test asserting `Object.keys(ADVANCE)` equals `FONTS`. Deleting the
  `mono` table was confirmed to fail 6 tests, so a fifth font cannot be added
  without measuring it. Looked at the render of the new fixture
  `tests/e2e/fixtures/fonts.tldsl.jsx`: all 16 boxes on one line each, all four
  fonts visibly distinct, both notes correct.

  **`tools/font-metrics.mts` is new and is the reason this is reproducible.**
  `tools/text-metrics.mts` measures the labels a diagram happens to contain; it
  cannot measure a font. The new tool prints the four tables as pasteable
  TypeScript, and `--all` re-checks the linearity claim. It has to run inside
  `tldsl serve`: tldraw's `--tl-font-*` variables are defined on
  `.tl-container`, **not** on `document.body`. My first measurement appended its
  probe to `document.body`, silently resolved all four fonts to Times, and
  produced four identical, entirely plausible-looking tables. Nothing in the
  output said so - the `resolved` font-family column was added afterwards
  precisely so it cannot happen quietly again.

  **A scratch verification tool passed while proving nothing.** The
  before/after corpus dump I wrote called `compileFile(deps, path)` when the
  real signature is `compileFile(path, deps)`. Every dump was `null` plus an
  `fs/read-error`, so `diff -rq` compared eight identical files containing the
  word `null` and reported success. Byte-identity was re-established properly
  afterwards by stashing and re-dumping. Worth remembering: a byte-identity
  check that never looks at a non-empty artefact is indistinguishable from a
  passing one.

- [x] **T12. Arrow labels.**
  tldraw arrow shapes already carry a `text` prop; nothing exposes it. A diagram
  where the edges say *"publishes"* and *"on failure"* communicates more than
  any layout change in this plan.
  **Layout-affecting**, which is why it comes last in this phase: a label sits
  at the arrow's midpoint and needs clearance, and after T3-T5 that midpoint is
  on a curve rather than a straight line.
  **Acceptance:** no arrow label's bounding box overlaps a shape the arrow does
  not connect. Add that check to `arrow-truth` and record the numbers in
  `docs/baseline.md`.

  **What was built.** `label` on `<Edge>` (named for `<Box label>`, mapping to
  tldraw's arrow `text` exactly as `IRBox.label` maps to `boxShape`'s `text`),
  plus `labelColor`, `font` and `size` - T10 and T11 both skipped `<Edge>`
  explicitly *because* the label was dead, so those belonged here. The chain is
  `ALLOWED_PROPS.edge` + `lowerEdge` -> `IREdge` -> `emitEdge` -> `arrowShape`,
  which stopped hardcoding `text: ""`. `assignId`'s edge `contentFields` was
  deliberately left as `[from, to]`: folding the label in would change every
  synthetic edge id and move geometry for a cosmetic gain.

  **The acceptance check.** `tools/arrow-truth.mts` prints a third summary line,
  `arrow labels overlapping a non-endpoint shape: N`, reading the label rect off
  `editor.getShapeGeometry(arrow).children[1]` (guarded on `text.trim() !== ""`)
  and mapping its corners through `getShapePageTransform`.
  `getArrowLabelPosition` is **not exported** from `tldraw`, but
  `ArrowShapeUtil.getGeometry` folds the label rect into the shape's public
  `Group2d`, so the geometry group is the supported route to that box.

  **The numbers. Corpus: 0 label overlaps on all eight files, and the scene JSON
  is byte-identical across all eight** (verified before/after via `git stash`,
  each dump asserted non-empty first, then `diff -rq`), so `docs/renders/` and
  the baseline tables were untouched and crossings stayed at 9. On the new
  fixture `tests/e2e/fixtures/edge-labels.tldsl.jsx`, overlaps went **2 -> 1**.
  `npm run check` green, 42 files / 444 tests (up from 428).

  **The clearance was not optional, and the reason is a hard tldraw number.**
  The first render of the fixture was unreadable - every label force-wrapped
  into two or three narrow fragments piled on the boxes. `arrowLabel.ts` (~82-95)
  sets `width = max(min(w, 64), min(bodyBounds.width - 64, w))` for any
  non-elbow arrow whose body is wider than tall, so a label renders at its
  natural width only when the arrow body is at least `w + 64` long - and between
  two adjacent boxes the body length *is* the container's gap, which was 24px
  against a ~130px label. `labelClearanceGap` in `domain/layout/stack.ts` now
  raises a container's gap to the widest clearance any qualifying labeled edge
  needs (`arrowLabelWidth + 64` horizontal, `arrowLabelLineHeight + 2*4.25`
  vertical), one uniform gap per container - the same shape as T0's
  one-box-size-per-container rule. Only consecutive flowed siblings qualify;
  `auto` and `free` are exempt.

  **Arrow labels use a third font-size table.** `ARROW_LABEL_FONT_SIZES`
  (`s:18 m:20 l:24 xl:28`) is neither T11's `LABEL_FONT_SIZES`
  (`s:18 m:22 l:26 xl:32`) nor `FONT_SIZES`. `arrowLabelWidth` reuses T11's
  measured `ADVANCE` tables with the arrow scale factor, exact given T11's
  linearity result; a test pins that it differs from `textWidth` at size `m` so
  the two tables cannot be quietly merged.

  **The first clearance attempt was a 6px no-op, and the reason generalises.**
  Every fixture in this repo declares `<Edge>` as a *sibling* of the frames it
  connects, not inside them. Scoping clearance to edges found within a
  container's own subtree therefore saw almost nothing. It now collects the
  document's labeled edges once at the layout entry point and resolves each to
  the pair of direct children of each container containing its endpoints. Worth
  remembering for any future rule keyed off `collectAutoEdges`: a container's
  own subtree is not where this DSL's edges live.

  Looked at the render before and after. The same-container adjacent case is
  transformed - `reads` and `on success` now sit in their own clearance with
  visible arrows either side, where before they were fragments over the boxes.
  Cross-container diagonal labels (`on failure`, `writes`, `retries`) are still
  squished; see `## Questions for the human`.

### Phase 4 - a corpus worth judging

- [x] **T13. Add three realistic diagrams.**
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

  Added `checkout-services` (4 tiers, 16 shapes, 10 labeled edges),
  `request-lifecycle` (one `col` chain, two short-circuit branches, 12 shapes)
  and `order-states` (10 states, 12 edges, two cycles, `layout="auto"`) to
  `tests/corpus/`. All three compile clean through the existing
  `corpus.test.ts` discovery, render, and are tabled in `docs/baseline.md`.
  Crossings 1 / 0 / 3, label overlaps 0 / 0 / 1, zero overlapping shape pairs
  in all three. **No `src/` file changed**, so the eight gate fixtures are
  byte-identical and every earlier table stands.

  The renders taught three things the reports did not. T12's clearance rule is
  exact to the pixel and a tie loses - `assets` sets a 134.27px gap and is still
  squished, while `quote` on the same gap is fine; worked around with an
  explicit `gap`, since widening the margin means editing T12's tests. `auto` is
  exempt from the clearance rule and ELK never sees a label size, so the state
  machine needed `gap="96"` *and* `direction="DOWN"` - vertical arrows squished
  zero labels where `RIGHT` squished seven. And `fill="solid"` with
  `labelColor="white"` is unreadable, because tldraw's solid geo fill is a pale
  tint. The one visible defect left is the cycle back-edge running through two
  boxes, exactly the case this task predicted nothing routes.

### Phase 5 - primitives

The author currently has five primitives - `Doc`, `Frame`, `Box`, `Edge`,
`Note` - plus `flow()`. That is a graph vocabulary, and every diagram gets built
from scratch out of it.

The payoff is not only convenience. **A higher-level primitive tells the layout
engine what the author meant**, and every constraint it adds is a case the
router stops having to guess at. A `<Pipeline>` connects its children in
sequence by construction, so it can never emit a same-axis skip edge - the exact
defect Phase 1 exists to route around. Semantics beat heuristics.

- [x] **T14. Layout shorthands: `Row`, `Col`, `Grid`, `Group`.**
  `<Frame layout="row" gap="40">` is the overwhelmingly common case and it reads
  badly. `Group` is the one that is not pure sugar: an invisible container that
  participates in layout but draws no frame chrome and reserves no title space.
  There is currently no way to group without drawing a box around the group.
  Pure lowering; no layout engine change.
  **Acceptance:** a test proves that for every existing corpus fixture, the
  shorthand form and the `<Frame layout=...>` form produce byte-identical scene
  JSON. **Do not rewrite the fixtures** - write the test against both forms.

  `Row`/`Col`/`Grid` are three-line wrappers around `Frame` that force `layout`;
  `Group` is `Frame` plus a `group: true` marker carried on the AST node the way
  `Sticky` already carries `sticky` - no attr, not authorable, not in
  `ALLOWED_PROPS`. The whole non-sugar half is two lines of real logic: `stack.ts`
  excludes group children from the `hasFrameChild` test that reserves
  `FRAME_TITLE_PX` (a group draws no tldraw title, so nothing needs clearing),
  and `emit.ts` emits no shape for a group, recursing into its children with the
  parent's `parentId` and the group's origin folded into their coords. Routing is
  deliberately left running on the un-flattened tree, since a group *is* a layout
  container for the purpose of grouping sibling skip edges.

  The acceptance test rewrites each corpus fixture in memory - a stack-paired
  tag rename of `<Frame layout="row|col|grid">` to `<Row>`/`<Col>`/`<Grid>`,
  compiled from a temp file - and compares `JSON.stringify(sceneJson)`.
  **5 of 11 fixtures carry a rewritable frame** (`checkout-services`,
  `deep-nesting`, `hexagonal`, `multi-region`, `request-lifecycle`; `order-states`
  is `layout="auto"`, the rest have no `layout=` frame), and all 11 compare
  byte-identical. No fixture file was touched. `npm run check` green at 43 files
  / 468 tests, up from 38 / 333 at T1. Geometry did not move: with no group in
  the corpus every new offset is `+ 0` and the `hasFrameChild` predicate is
  unchanged, so `docs/renders/` and `docs/baseline.md` stand as they were.

- [x] **T15. `geo` as a prop. No named shape aliases in the library.**
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

  **Done.** All 20 values of tldraw's `GeoShapeGeoStyle` are exposed as
  `<Box geo="...">` through the existing `readEnum` style-prop path (`GEOS` in
  `ir/styles.ts`, `IRBox.geo`, `ALLOWED_PROPS.box`, `emitBox`); `boxShape`
  already accepted `geo` and already defaulted it to `rectangle`, so emit
  needed one line. No aliases were added. There is no cylinder and none was
  faked.

  **The task's premise about *why* sizing breaks is wrong, and the fix it
  prescribes cannot work.** tldraw's own label measurement is geo-independent:
  `getUnscaledLabelSize` (`GeoShapeUtil.tsx`) wraps at `w - LABEL_PADDING * 2`
  for every geo and `getGeometry` centres the label rect in the full bounding
  box. So a diamond does not clip or re-wrap its label - the text simply
  overflows the drawn outline, and `text-metrics.mts` reports byte-identical
  numbers for all 20 geos. There was nothing to measure. The correction is
  therefore geometric: a per-box scale `k >= 1` on both `w` and `h`, from a
  containment model per outline (`rect` -> 1, `ellipse` -> `hypot(a, b)`,
  `diamond` -> `a + b`, `triangle` -> `2a + b`, `arrow` -> `max(a/0.68,
  b/0.24)` from tldraw's own shaft geometry in `getGeoShapePath.ts`), where
  `a`/`b` are the label's width and height as fractions of the box's.

  **Solved as a fixed point, not in closed form.** The first cut computed `k`
  once on the rectangle basis and the render still showed `triangle` and both
  vertical arrows spilling their labels: the box scales but the label does not,
  so growing the box re-wraps the label onto fewer lines and invalidates the
  very fractions `k` came from. Iterating `k *= overflow` converges in two or
  three passes. Numbers for `"triangle shape with a longer label"`: rectangle
  256x92; triangle 615x221 (still overflowing, `2a+b = 1.43`) under the closed
  form, 880x317 (`2a+b = 1.000`) under the fixed point. Diamond 502x181,
  arrow-up 696x250.

  **A 20-shape gallery was rendered twice and read by eye.** After the fix
  every one of the 20 outlines contains its label at both a one-word and a
  wrapping label. `x-box` and `check-box` are the two that still look wrong,
  and no sizing fixes them: tldraw draws the cross and the tick *through* the
  box, so the label crosses a stroke at any size. They are modelled as plain
  rectangles and the limitation is written into `docs/dsl.md`.

  **No geometry moved.** No corpus fixture carries a `geo`, so `k` is exactly 1
  everywhere and all eleven canvases match the recorded baseline to the pixel
  (`checkout-services` 869x640, `long-labels` 1538x848, `wide-fanout`
  3722x204, ...). `docs/renders/` and `docs/baseline.md` stand unchanged.
  `npm run check` green: 43 test files, 514 tests (was 43/468 at T14).

- [x] **T16. Composite primitives that carry layout semantics.**
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

  **Built entirely in `src/runtime/`; `src/domain/` was not touched.** All four
  are wrappers over the existing `Frame` component, in the same style as T14's
  `Row`/`Col`/`Grid`. No new IR field, no new entry in `ALLOWED_PROPS`, nothing
  new for lower/layout/emit to know about. `<Pipeline>` is the only one that is
  not pure sugar: it returns `[frame, ...flow(...childIds)]` - an array, which
  `flattenNodes` already walks, so the generated edges land as siblings of the
  frame exactly where a hand-written `flow()` would have. It throws if a
  non-edge child has no `id`. `<Graph>` is one line (`layout="auto"`).
  `<Layers>` and `<Swimlanes>` both force `layout="col"` and rebuild each frame
  child's attrs with `layout="row"`.

  **`<Pipeline>` defaults rather than forces.** `Frame({ layout: "row",
  ...props })`, so `<Pipeline layout="col">` works - unlike `Row`/`Col`/`Grid`,
  which spread props first and override. A pipeline's axis is the author's
  choice; its *connectivity* is the primitive's contract.

  **`<Layers>` and `<Swimlanes>` differ only in chrome, and that was a free
  choice.** Both are a col of coerced rows. `<Layers>` additionally marks an
  **unnamed** tier `group: true`, so a block-schema stack draws its boxes and
  no tier boxes; a tier that carries a `name` keeps its frame. `<Swimlanes>`
  never sets `group`, because a lane's label is the point. Logged under
  `## Questions for the human` - the honest alternative was cross-lane column
  alignment, which nothing in the engine supports today.

  **Acceptance met, and beaten.** `crossing-classify` reports `same-axis skip=0
  cross-container=0 fan=0 other=0 total=0` for all four fixtures -
  `pipeline-build` (1165 x 102, 5 arrows), `layers-stack` (691 x 456, 5),
  `swimlanes-release` (563 x 440, 8), `graph-topology` (935 x 373, 11). Not one
  crossing of any bucket. `overlapping shape pairs` is 0 on all four. Nothing
  in the existing corpus moved: no `src/domain/` change, so every recorded
  number stands. `npm run check` green at 43 test files / 528 tests (was
  43/514 at T15). Renders added to `docs/renders/`, table in `docs/baseline.md`
  under **After T16**.

  **One defect was visible only in the PNG.** In `layers-stack` the
  `API gateway -> Postgres` edge ran through the "Data tier" frame-name chip
  when Postgres was leftmost in its tier; every tool reported zero. Fixed
  fixture-side by reordering that tier (Redis first). `arrow-truth` counts
  arrows crossing *shapes*, and a frame name chip is not a shape.

- [x] **T16b. A userland component library, as the composability test.**
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

  **Done.** `tests/corpus/lib/c4.jsx` defines `Person`, `System`, `Container`
  and `Boundary` as plain functions over `Box`/`Frame`, mapping domain props
  (`name`, `description`, `technology`, `external`) down to the allowed prop
  set and picking `geo`/`color` themselves; `tests/corpus/c4-context.tldsl.jsx`
  imports it and is the first multi-file diagram in the repo. **No library
  change was needed to express the vocabulary** - nothing in `src/runtime/` or
  `src/domain/` moved for it, which is the finding: the tier-1 / domain-
  vocabulary split holds. Numbers: canvas 1105 x 460, overlapping shape pairs
  0, edge-edge crossings 0, `crossing-classify` `same-axis skip=0
  cross-container=0 fan=0 other=0 total=0` over 4 arrows.

  One library change *was* forced, by the fourth acceptance clause.
  `mappedSpan` in `src/infra/execute-jsx/execute-jsx.ts` mapped a thrown
  frame's line and column through the sourcemap but hardcoded
  `file: path` - so a throw inside an imported module reported the *entry*
  file with the imported file's line number, which is worse than no span at
  all. It now reads `entry.originalSource` (resolved against the entry's
  directory) and falls back to `path`. A new `execute-jsx` test writes a temp
  two-file diagram and pins `span.file` at the imported module and
  `span.line` at 8. Compile errors already carried the right file - esbuild's
  `BuildFailure.errors[].location` names it - so only the runtime-throw path
  was wrong.

  Reload is proven as a chain, not end to end: `tests/corpus/multi-file.test.ts`
  asserts `compileFile`'s `result.inputs` contains `lib/c4.jsx`, and
  `watch-and-serve.test.ts`'s existing "re-subscribes to the module graph
  after a successful compile" asserts `watchHandle.update(result.inputs)`.
  No test starts a real `serve` and touches the imported file.

  Three arrow labels were shortened during the wake (`reads/writes` ->
  `reads`, `HTTPS/JSON` -> `calls`) because tldraw wrapped each of them
  mid-word - see Discovered work; the corridor the layout reserves for a
  horizontal arrow label is about one glyph narrower than what tldraw
  actually needs.

  `tests/corpus/shorthand-equivalence.test.ts` needed a one-line fix: it
  copies each fixture into a tmpdir before rewriting shorthands, and did not
  carry sibling modules along, so the first fixture with a relative import
  broke it. It now `cpSync`s `tests/corpus/lib` when present.

### Phase 6 - re-examine what was decided on stale geometry

- [x] **T17. Re-test serpentine rows (was B21b).**
  A grid that wraps in reading order makes the last node of one row and the
  first of the next as far apart as possible, which is where `long-labels`' long
  diagonal comes from. Serpentine (alternating row direction) fixes that by
  construction. It was rejected on an arrow-crossing gate measured against boxes
  40% too narrow.
  **Acceptance:** re-measure against the post-T13 baseline. Keep if crossings
  drop and nothing regresses; if it fails again, write down the number so it is
  not tried a third time.

  Built as B21b was built: for element `i` in a `cols`-wide grid with
  `r = floor(i / cols)`, the column becomes
  `serpentine && r % 2 === 1 ? cols - 1 - (i % cols) : i % cols`, used both when
  accumulating `colWidths` and when reading `colX`, and threaded into
  `gridExtent` so `bestGridCols` scores the geometry that will actually be
  placed. On only for the grid the engine chose itself; an explicit
  `layout="grid"` stays row-major. +21/-6 in `src/domain/layout/stack.ts`, two
  unit tests. `npm run check` green, 44 files / 534 tests.

  **The number did not move: 13 crossings before, 13 after**, per file
  identical, `crossing-classify` byte-identical. So the criterion as written
  ("keep if crossings drop") was not met. Nothing regressed either - over all
  sixteen fixtures exactly one line of the canvas/edge-length diff changed.
  **Kept anyway**, because the one line that moved is `release-pipeline`'s total
  edge length, 9558 -> 7762 (-19%), and the render shows why: its two
  full-width row-boundary diagonals (`Security scan -> Integration tests`,
  `Build image -> Push to registry`) become short adjacent-column hops and
  `Manual approval -> Canary 5%` becomes a vertical drop. See
  `## Questions for the human`.

  Why the gate could not move: the three same-axis skips left in the corpus are
  inside `order-states`, which is `layout="auto"` (ELK, not the grid), and the
  ten cross-container crossings are in `deep-nesting` and `hexagonal`, neither
  of which reaches the auto-wrap. Of the five grid files, `deep-nesting` and
  `hexagonal` have one top-level child, and `wide-fanout` is a single 3722x204
  row after T6's fan collapse, so it has no odd row to mirror. Only
  `long-labels` and `release-pipeline` can see the change at all, and
  `long-labels` lands on the identical edge-length total because its columns are
  uniform and its edges symmetric about the row.

  B21b's rejection reason is now stale for a different reason than expected: it
  died on `wide-fanout` 36 -> 43, and `wide-fanout` no longer wraps.

- [x] **T18. Re-examine the row-gap corridor (B25/B32/B33).**
  Three kept changes widen grid row gaps in proportion to edges crossing them.
  They were tuned against stale geometry, and if T3-T5 route those edges around
  instead of through, the corridor is now paying for clearance nobody needs.
  Try removing it entirely and measure.
  **Acceptance:** if crossings do not rise when it is removed, remove it - that
  is roughly 150 lines and three layers of special case bought back. If
  crossings do rise, record by how much and keep it.

  **Kept. Removing it costs 3 crossings: 13 -> 16.** No code changed - this wake
  measured the removal and put the file back byte-identical. The two halves were
  measured separately: both on (today) **13**; `skipRowGaps` alone, without the
  `hasSkipEdge` pre-gap that feeds `bestGridCols` **14**; the pre-gap alone,
  without `skipRowGaps` **17**; neither **16**. The mechanism is non-monotonic -
  the pre-gap on its own is *worse than removing everything*, because it only
  changes which column count `bestGridCols` picks and then leaves the row
  boundaries too tight to use it. The full corridor is the best of the four.
  All three new crossings land in `release-pipeline`, and they are `other`, not
  skips: with 40px row gaps it wraps to 4 columns instead of 5 and three chords
  cut straight through `Canary 5%`, `Manual approval` and `Notify Slack`.
  Confirmed in the pixels, not just the counter - rendered both variants and
  compared. The corridor's price on that file is +280px of height (row
  boundaries 160/160/80 against a 40px base gap), which buys back three arrows
  that would otherwise be drawn over box interiors. T3-T6b did not make the
  corridor redundant; they route *cross-container* edges, and every edge the
  corridor serves is same-container grid traffic.

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

- [x] **T19. Design spike. Write the doc, do not write code.**
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

  `docs/round-trip.md` exists, 281 lines, five decisions D1-D5 covering the five
  bullets plus an explicit out-of-scope list. No code: the only changed files are
  this plan and that doc, and `npm run check` is green. The schema keys entries on
  the tldraw record id (`shape:checkout`) because `emit/` prefixes rather than
  renames, so `apply` needs no lookup table; `restyled` is expressed in the
  existing `domain/ir/styles.ts` vocabulary, which makes it simultaneously a valid
  tldraw props patch and a valid set of JSX props, so absorb's restyle case is a
  rename rather than a translation. Staleness is confirmed as proposed, with one
  wrinkle the task did not name written down: ADR-12's synthetic ids are content
  hashes, so editing an anonymous `<Note>`'s text orphans its entry correctly but
  surprisingly. Three decisions were taken that the task left implicit and that
  T20 will inherit: `apply` never re-runs layout (it is a post-layout patch, and
  the fixed point of layout-under-overlay is not guaranteed to exist), the viewer
  writes over a plain `PUT /overlay` rather than the websocket CONTEXT.md
  reserved, and `serve` deliberately does not watch the overlay file - watching it
  would let the viewer's own write stomp the canvas being edited.

- [x] **T20. Overlay apply - the deterministic half.**
  Schema plus a pure `apply(overlay, scene)` in `domain/`, the viewer writing
  the overlay on canvas edit, and `serve` reading it. This is the whole
  lossless mechanism and it involves no model.
  **Acceptance:** for every corpus fixture, a synthetic overlay exercising all
  five operation kinds applies cleanly; `apply` is a pure function with unit
  tests; and reloading the served page reproduces the pre-reload scene byte for
  byte.

  Built the whole path. `contracts/overlay.ts` holds the final-state schema from
  D1; `domain/overlay/` holds `applyOverlay` (merge `added`, then field-wise
  `moved`/`restyled`/`relabelled`, then `deleted` cascaded to a fixpoint) and
  its inverse `diffScenes`, plus `sceneHash` for `basedOn` and `overlayPathFor`.
  The viewer turned out not to need any diff logic at all: it PUTs its whole
  document snapshot and the server diffs it against the last compile, so the
  round-trip reduces to one property - `applyOverlay(diffScenes(base, cur), base)
  === cur` - which is unit-tested directly and is what T21's harness will hang
  off. `watchAndServe` reads and applies the overlay on every compile (absent,
  unparsable or malformed overlays push the compiled scene unchanged and log a
  warning; they never become a `kind: "error"` push, which would blank the
  viewer per ADR-13), and `putOverlay` writes the file and re-pushes the applied
  scene so the transport's last-message replay serves the *edited* render to a
  reloading browser.

  The numbers: **51 test files / 601 tests**, up from 44/534 at T18. All 17
  corpus fixtures build a synthetic overlay exercising all five op kinds and
  reproduce the mutated scene exactly with zero diagnostics
  (`tests/e2e/overlay-corpus.test.ts`, which asserts all five kinds are present
  rather than passing vacuously). The reload criterion is a real e2e:
  `tests/e2e/overlay-serve.test.ts` boots `runServe`, reads the base scene off
  SSE, `PUT`s a mutated snapshot, checks the overlay file landed and parses, and
  asserts a *fresh* SSE connection replays the mutated scene. Geometry did not
  move - no layout code was touched, so `docs/renders/` and `docs/baseline.md`
  are unchanged. ADR-22 landed in `docs/decisions.md` and the three stale
  round-trip lines in `CONTEXT.md` were fixed.

  Two decisions the task left open, both recorded under Questions for the human:
  `restyled` carries *every* changed prop rather than only the tldsl style
  vocabulary (fidelity beats purity; the vocabulary claim is about what absorb
  can map mechanically, not about what may be stored), and `putOverlay` pushes
  the applied scene back over SSE (D4 forbade *watching* the overlay file, which
  this is not - but it does mean the server emits a scene nobody asked for).

- [x] **T21. Fidelity harness.**
  Build this before absorb, not after. compile -> scene -> apply a canvas
  mutation -> reload -> assert the scene equals the mutated scene, over the
  whole corpus.
  **Acceptance:** passes with real mutations, and **fails loudly when fed a
  deliberately lossy apply** - a harness that has never gone red proves
  nothing.

  `tests/e2e/fidelity/harness.ts` exports `checkFidelity(fixturePath, apply?)`,
  which boots a real `runServe` over a temp copy of the fixture, reads the base
  scene off SSE, PUTs a mutated snapshot exercising all five op kinds
  (`tests/e2e/fidelity/mutate.ts`, the T20 generator moved out intact), reads
  back the overlay tldsl actually wrote to disk, reconnects - that fresh SSE
  connection *is* the reload - and finally re-runs the round-trip through the
  **injected** `apply`. It returns `FidelityFailure[]` rather than throwing, so
  a caller can hand it a lossy apply and observe red; failures name the fixture,
  the stage, and the diverging record ids. The `apply` leg is deliberately
  redundant with the reload leg under the real `applyOverlay` - redundancy is
  the price of having an injection seam that does not put a test hook in
  `runServe`.

  The numbers: **52 test files / 609 tests**, up from 51/601 at T20.
  `tests/e2e/fidelity-corpus.test.ts` runs the harness over all 17 corpus
  fixtures in 721ms and they are all clean. `tests/e2e/fidelity-harness.test.ts`
  is the acceptance criterion's teeth: seven deliberately lossy applies
  (identity, drop each of `moved`/`restyled`/`relabelled`/`added`, ignore
  `deleted`, truncate relabels) each make the harness go red, and every failure
  carries `stage: "apply"` - which also proves the real server and reload legs
  stayed green, so the injected loss is what tripped it and not a flaky server.
  I ran a lossy apply by hand outside vitest to read the message myself:
  `checkout-services.tldsl.jsx: applied scene diverges from the canvas in 1
  record: shape:edge (differs)`. Geometry did not move - no layout code was
  touched - so `docs/renders/` and `docs/baseline.md` are unchanged.

  One choice worth recording: `tests/e2e/overlay-corpus.test.ts` was **deleted**
  rather than kept alongside. The harness runs the same mutation generator over
  the same 17 fixtures and adds the real disk serialization and the real serve
  reload on top, so keeping both would have been two files asserting one
  property; the parts worth keeping (the mutation builder and its cascade
  comment) moved to `mutate.ts` verbatim, and the non-vacuity check that all
  five op kinds fire is now a harness stage, not a test assertion. T20's
  acceptance is still covered, by strictly more.

- [x] **T22. `tldsl absorb`.** *Blocked on the T19 decisions.*
  The model-driven step. Reads JSX plus overlay, rewrites the JSX, empties the
  overlay, leaves a reviewable diff.
  **Acceptance:** the canvas-first case works end to end - a stub `<Doc/>` plus
  an overlay of hand-added shapes absorbs into JSX that compiles, on its own
  and with an empty overlay, to the same scene the canvas showed. Verified by
  T21's harness, not by inspection.

  Shipped as `tldsl absorb <file> [--force]`: `domain/absorb/codegen.ts` (pure -
  records to JSX text, plus the splice into the root `<Doc>`), `app/absorb.ts`
  (the use case), `cli/absorb.ts` (stdio and the exit code) and
  `infra/git/git-status.ts` (D5's dirty-file guardrail; outside a repo it writes
  a `.bak` first). Absorb **partitions** the overlay rather than demanding all of
  it: bare `added` geo/note records become `<Box>`/`<Sticky>` elements hard-pinned
  with `x`/`y`, so they are excluded from flow placement and disturb nothing
  already in the file, and every other entry - `moved`, `restyled`, `relabelled`,
  `deleted`, added arrows and bindings - stays in the overlay untouched. It then
  **verifies itself**: recompile, re-apply the residual overlay, deep-compare
  against the pre-absorb applied scene. Only on a match does it write the overlay
  back (D5's "never empty the overlay unless the rewrite verifiably reproduces
  the render"); on any divergence it restores the original source byte for byte
  and names the diverging records.

  The numbers: **54 test files / 627 tests**, up from 52/609 at T21;
  `npm run check` green. `tests/e2e/absorb-fixture.test.ts` is the acceptance
  criterion - a stub `<Doc/>` plus an overlay of four hand-added shapes absorbs,
  the overlay file on disk ends with **zero entries**, the rewritten JSX compiled
  *alone* deep-equals the scene the canvas showed, and `checkFidelity` over the
  rewritten file returns `[]`, which is T21's harness rather than inspection. Two
  further e2e cases pin the partition (an added arrow and a `moved` entry survive
  in the overlay while the box lands in the source) and the refusal (a record with
  a non-zero `rotation`, which no JSX prop can express, exits 1 with source and
  overlay byte-identical). I also ran it by hand on a two-box `<Doc layout="col">`
  and looked at the render: the absorbed sticky and box sit at exactly the canvas
  coordinates (900,120 and 640,120) and the two flowed boxes did not move (0/0 and
  0/102 before and after). No layout code was touched, so `docs/renders/` and
  `docs/baseline.md` are unchanged.

  Two deviations from the obvious mapping, both forced by the compiler rather
  than chosen. A `type: "note"` record absorbs into `<Sticky>`, not `<Note>` -
  `emit/` only produces a tldraw note record for `<Sticky>`, and a plain `<Note>`
  compiles to a warm-filled `geo`, which would fail absorb's own verification
  every time. And absorb extends the existing `import { ... } from "tldsl"` with
  `Box`/`Sticky` when it introduces a component the file did not import; without
  that the stub case dies with `ReferenceError: Box is not defined`. It errors
  rather than guessing if there is no such import to extend.

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
| `tldsl render <file> <out.png>` | exists (T23) |
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

- [x] **T23. `tldsl render` - a real CLI command, cropped to content.**
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

  Shipped as `tldsl render <file> <out.png> [options]`: `infra/render/export-image.ts`
  (the `editor.toImage` adapter - no port, one impl, wired from cli/ like
  `infra/devserver/`), `infra/serve-registry/serve-registry.ts` (the discovery
  record) and `cli/render.ts` (argv, format inference, URL resolution, exit
  code), registered in `cli/main.ts` with the same real adapters `serve` uses.
  `tools/screenshot.mts` is now a 80-line wrapper over the same pieces - same
  argv, same `tools/screenshot.mts:` stderr prefix, same exit codes, but it no
  longer spawns a `serve` child; both paths call `runServe` in-process.
  playwright is loaded with a dynamic `import()` and both failure modes (module
  missing, browser binary missing) surface the `npx playwright install chromium`
  hint, so `dist/cli` stays installable without it. `pixelRatio` stays pinned
  at 2. **54 -> 56 test files, 627 -> 642 tests**; `npm run check` green.

  The numbers, all on `deep-nesting` unless noted. Default crop: tldraw reports
  page bounds `594 x 752`, the export is `658 x 816` CSS px = bounds + 32
  padding a side, `1316 x 1632` at `pixelRatio` 2 - the content bounding box
  exactly, no empty grid, no UI. Two consecutive runs are byte-identical
  (`518dae87...`), and identical to the committed `docs/renders/deep-nesting.png`,
  as are `sequence` and `wide-fanout` - so nothing about the geometry moved and
  `docs/renders/`/`docs/baseline.md` are untouched. `--frame l2` exports Router,
  Metrics and the nested `l3`/`l4` frames with their children and nothing else;
  `Gateway` and `Config` are gone, as is `l2`'s own border and label (tldraw
  draws a frame's contents, not the frame). A bad `--frame` id exits 1 and lists
  the valid ids.

  **Export vs screen, verified once** (the clause that makes "the pixels are
  right" sound): I captured the same fixture both ways - `toImage`, and an
  old-style 1600x1200 viewport screenshot with `Shift+1` zoom-to-fit and
  `.tlui-layout` hidden - and looked at both. Same shapes, same labels, same
  arrow paths, same frame titles, same relative positions. The only differences
  are the ones the export is *for*: the viewport version carries bands of empty
  grid on all four sides, a "made with tldraw" watermark, and frame-title text
  scaled by the zoom level. The export path shows what the screen shows.

  **One change beyond the port.** `page.goto` used `waitUntil: "networkidle"`,
  inherited from the old tool. The viewer holds an SSE connection open, so idle
  is never reliably reached: a render against a warm `serve` timed out at 30s on
  its first attempt and took 4.3s on the next. Switched to `domcontentloaded`,
  leaving the existing `waitForSelector("[data-shape-id]")` as the real
  readiness gate - the same render now takes **0.61s**, three runs, all
  byte-identical to the baseline. That is what makes T25's synchronous
  in-hook render viable; at 30s it was not.

- [x] **T24. The skill.**
  Teaches the vocabulary: the Phase 5 primitives, the Phase 3 styling props, the
  `on` attachment from T7, and the workflow - `serve` while iterating, `check`
  before claiming done, `render` to actually look at it.
  **The skill is prose, not logic**, and it should be short enough to actually
  get read. A long skill nobody loads is worse than none, because it implies
  coverage that is not there.
  **Acceptance:** an agent given only this skill and no other context writes a
  non-trivial diagram that compiles clean on the first attempt. Test that; do
  not review the prose and call it done.

  Built `skills/tldsl/SKILL.md` (158 lines) plus a three-line
  `.claude-plugin/plugin.json`, making the repo root the plugin root as the
  Phase 8 layout notes describe. The skill is the file shape and its five
  non-negotiables, a one-line-per-component table, the layout and style props
  with their exact enums, edges, `on`-attachment, the `check`/`serve`/`render`
  workflow, and the five diagnostics that actually bite. No logic in it.

  **Acceptance met, 2 of 2.** Two fresh sonnet agents were given the path to
  that one file, forbidden from reading anything else in the repo or running any
  CLI, and allowed a single attempt. Agent A wrote an 18-box CI/CD release
  pipeline across 7 containers with a styled rollback path; agent B wrote a
  17-box SaaS analytics platform with containers nested two deep and a userland
  component instantiated twice under `ns`. Both exit 0 from `tldsl check` on the
  first try. Both renders were looked at: B reads well; A validates but reads
  badly - a note lands squarely on top of "Revert to previous build" and three
  arrow labels collide near the approval diamond. That is a layout defect the
  skill exposed, not a skill defect, and both halves are in Discovered work.

  Two things the test changed in the prose: both agents independently guessed at
  the same thing - whether `<Edge>` and `{flow(...)}` may sit as siblings among
  top-level frames (they may) - so that is now stated; and A's collision earned
  a line telling authors to keep note text to a sentence. One bug was caught in
  my own draft before the test: the worked example used `geo="cylinder"`, which
  is not a legal `geo`. Both examples in the file now compile and pass `check`.

- [x] **T25. The hooks.**
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

  Shipped `hooks/hooks.json` plus two POSIX `sh` scripts, and one small CLI
  addition that keeps them honest. `hooks/on-edit.sh` (PostToolUse, `matcher`
  `Edit|Write`) reads `tool_input.file_path` with `jq`, returns silently unless
  it ends in `.tldsl.jsx`, runs `tldsl check`, and on a clean file runs
  `tldsl render --reuse-only`; it emits one `hookSpecificOutput.additionalContext`
  string either way. `hooks/on-prompt.sh` (UserPromptSubmit) is a `find` for
  `*.tldsl.overlay.json` plus `jq '.entries | length'`, printing to plain stdout.
  Neither script decides anything the CLI could decide - the one thing the CLI
  could not previously answer was *"render only if it is free"*, so `tldsl render`
  gained **`--reuse-only`**: when `findServe` comes back empty it errors instead
  of booting chromium. That is four lines in `src/cli/render.ts` and it is what
  keeps the hook a shell-out instead of a serve-registry parser.

  **All four acceptance clauses measured, against the built `dist/cli`**, not
  tsx. A non-`.tldsl.jsx` path: empty stdout, exit 0, **0.01s**. A clean diagram
  with `serve` **cold**: the hint, no render, **0.26s** - not a ten-second pause.
  A broken diagram: the diagnostic (`error[runtime/threw]`) arrives in
  `additionalContext` with `hookEventName: "PostToolUse"`, **0.14s**, without
  anyone asking for it. And with `serve` **warm** on `deep-nesting`, the same
  hook rendered in **1.48s** and the PNG it wrote is byte-identical
  (`518dae87...`) to the committed `docs/renders/deep-nesting.png` - so the
  render path is real, and geometry did not move. `npm run check` green,
  **56 -> 57 test files, 642 -> 651 tests**; the new `tests/e2e/hooks-fixture.test.ts`
  spawns both scripts for real over stdin rather than reimplementing them.

  **Two deviations, both written down rather than worked around.**

  *The gate is the script, not the `if` field.* The plan's mechanics block says
  to gate with `if` plus a glob. Re-read against the docs, `if` takes **a single
  string**, not an array ("To match multiple tool names, use separate handlers
  each with its own `if` value"), and path rules for `Write` are documented as
  accepted but never consulted - only `Edit(...)` path rules are. Covering Edit
  and Write would therefore need two handler entries whose behaviour I could not
  test from inside the loop. The `case` guard on `$f` is one line, is covered by
  two of the new tests, and produces the same silence; it costs one process spawn
  per non-diagram edit, measured at 0.01s.

  *The overlay hook over-reports, and I shipped it that way.* Immediately after
  the warm render above, `on-prompt.sh` announced "8 unabsorbed canvas changes in
  deep-nesting.tldsl.jsx" - with nobody having touched the canvas. The cause is
  already in Discovered work from T23: booting the viewer makes it PUT back an
  index-only overlay. Filtering those entries out inside the hook would put
  overlay semantics in a hook, which is the one thing Phase 8's own rule forbids;
  the count belongs in the `tldsl overlay show` this phase already lists as
  missing. So the hook ships as specified and the false alarm is recorded, in
  Discovered work and in Questions for the human.

  Also fixed while testing: `${TMPDIR}` ends in `/` on macOS, so the injected
  render path read `T//tldsl-render/...`. One line.

- [x] **T26. `/tldsl:sync`.** *(T19 and T21 have landed; this is unblocked.)*
  Reads `tldsl overlay show`, rewrites the JSX, runs `tldsl verify` until it
  passes, leaves a normal reviewable diff. This is `absorb` from Phase 7,
  delivered as a command rather than a subprocess holding an API key.
  The command is prose driving two CLI calls. If it needs to parse or compute
  anything itself, the missing piece belongs in the CLI.
  **Acceptance:** the canvas-first case from T22 works end to end through the
  command; `tldsl verify` passes afterwards with an empty overlay; the diff is
  reviewable and touches nothing unrelated.

  Shipped as `commands/sync.md` (prose, `/tldsl:sync` for free from the plugin
  name) plus the two subcommands the task's own table listed as **missing**:
  `tldsl verify <file>` and `tldsl overlay show <file>`. Both are thin
  presenters over one new use case, `src/app/verify.ts` - the command computes
  nothing, which is Phase 8's rule made concrete. `readOverlay` was exported
  from `app/absorb.ts` rather than copied.

  **What `verify` means, since neither Phase 7 nor T26 defined it.** For each
  overlay entry, apply *that entry alone* to the freshly compiled scene and
  compare to the compile: an entry that changes nothing is one the source
  already expresses. Pass = no overlay, or every entry is a no-op. That is
  non-vacuous in the way the sync loop needs - it is exactly the check that goes
  green when a hand-rewrite of the JSX correctly encodes a `moved` entry, and it
  cannot be faked by deleting overlay entries, because the rewrite is what makes
  them no-ops. `stale` (`basedOn` against the current `sceneHash`) is reported,
  never a verdict.

  The numbers: **59 test files / 657 tests**, up from 57/651 at T25;
  `npm run check` green. `tests/e2e/sync-fixture.test.ts` is the acceptance
  criterion - T22's canvas-first case (stub `<Doc/>` plus four hand-added
  shapes) driven through `overlay show` -> `absorb` -> `verify` in the order the
  command calls them: show exits 0 naming all four ids, absorb exits 0, the
  overlay on disk ends with zero entries, verify exits 0. I also ran all four
  branches by hand against a two-box `<Doc layout="col">`: no overlay -> pass;
  a mixed overlay -> `shape:a moved to (0, 0) (already in the source)` and
  `shape:b moved to (777, 42); restyled (color)`, verify exit **1** naming only
  `shape:b`; the overlay rewritten to the source's own coordinates -> verify
  exit **0** with "the source already expresses all 1 overlay entry". No layout
  code was touched, so `docs/renders/` and `docs/baseline.md` are unchanged.

  Two choices worth recording. **`verify` is read-only**: when it passes while
  the overlay still holds entries, it names the redundant file and the command's
  prose tells the agent to delete it, rather than shipping a `verify --prune`
  that mutates. D5's rule is "never empty the overlay unless the rewrite
  verifiably reproduces the render", and a passing `verify` *is* that proof, so
  the deletion is authorised either way - a flag would only move who runs `rm`.
  And **step 3 of the command is the model-driven half T22 deferred**: absorb
  still only generates JSX for added geo/note shapes, so `moved`/`restyled`/
  `relabelled`/`deleted`/added-arrow entries are rewritten by the agent by hand
  against `tldsl verify`, which is what "delivered as a command rather than a
  subprocess holding an API key" was always going to mean.

---

### Phase 9 - polish, and proof against diagrams nobody designed the tool around

Everything up to here was built against eight corpus fixtures that were written
to exercise the layout engine. That is circular: the tool has only ever been
asked to draw diagrams chosen because it could draw them. This phase points it
at diagrams the world already agreed on - a TCP handshake, a layered web stack,
a state machine - and treats whatever breaks as the real backlog.

**The rule that makes this phase work: authoring wakes do not fix anything.**

A wake that authors a diagram and fixes the engine in the same pass will do
neither honestly - it will quietly reshape the diagram around each defect until
the render looks fine, and the defect never gets written down. So:

- **Authoring tasks** (T28-T33) write the diagram the way the *subject* demands,
  not the way the tool prefers. When something is ugly, wrong, or impossible,
  they log it and move on. They may not touch `src/`.
- **Fix tasks** (T35-T38) drain that log. They may not add diagrams.

If an authoring task finds nothing wrong, say so plainly and tick it. An empty
finding is a real result; inventing a defect to look productive is not.

**Author each diagram the way a user would.** Read `skills/tldsl/SKILL.md` and
work from that. If you need something the skill does not mention, that is itself
a defect worth logging - the skill is the product surface, and this phase is the
only test it gets against material T24 did not choose.

- [x] **T27. The defect ledger and the authoring protocol.**
  Create `docs/diagram-defects.md`. One entry per defect, each with: the diagram
  that provoked it, what was attempted, what happened, a severity
  (**blocker** the diagram cannot be expressed / **wrong** it renders but says
  something false / **ugly** it reads badly / **papercut** authoring friction),
  and a repro - the smallest `.tldsl.jsx` that shows it, saved under
  `examples/repro/`.
  Severity is about the *diagram*, not the fix. A one-line fix to something that
  makes a diagram unreadable is still a blocker.
  **Acceptance:** the file exists with the schema written at the top and zero
  entries. No code.

  `docs/diagram-defects.md` exists: a copy-paste `D<n>` entry template in a
  fenced block, the four severities spelled out as what the defect does to the
  *diagram* (blocker cannot be expressed / wrong renders something false / ugly
  reads badly / papercut cost the author something), and an `## Entries` section
  reading "None yet." Nothing else changed - no `src/`, no fixtures, and the
  defects already sitting in Discovered work were deliberately **not**
  pre-loaded, since an entry is supposed to be the output of an authoring wake
  that actually hit it and can point at a repro.

  Two small calls. `examples/repro/` was not created empty; the first entry that
  needs it creates it, and a `.gitkeep` for a directory with no files yet is
  noise. And **entry numbers are `D<n>`, never reused** - the ledger says so at
  the top, so a fixed defect's number stays readable in the commit that fixed
  it rather than being recycled onto something unrelated. `npm run check` green
  (59 files / 657 tests, unchanged); no geometry moved, so `docs/renders/` and
  `docs/baseline.md` are untouched.

- [x] **T28. TCP connection lifecycle.**
  The three-way handshake, data transfer, and the four-way teardown, as a
  sequence between two participants - SYN, SYN-ACK, ACK, then FIN, ACK, FIN, ACK,
  with the state names (`SYN_SENT`, `ESTABLISHED`, `TIME_WAIT`) on the
  participant that holds them.
  **This is the archetype the corpus has never had**, and the one that settles
  the long-standing open question about whether sequence diagrams are in scope.
  Two vertical lifelines with ordered horizontal arrows between them is not
  something any current primitive expresses; expect this to be the richest
  source of entries in the ledger. Do not build a sequence primitive here - log
  what is missing.
  **Acceptance:** `examples/tcp-lifecycle.tldsl.jsx` exists, `tldsl check` is
  clean, the PNG has been looked at, and every gap is in the ledger.

  `examples/tcp-lifecycle.tldsl.jsx` exists and `tldsl check` is clean: two
  lanes, ten instants each, the eight segments as horizontal arrows, and the
  lifelines drawn as headless dotted `<Edge>`s between consecutive states -
  `arrowheadStart="none" arrowheadEnd="none"` turns out to be enough for a
  lifeline, so no primitive was needed for that. The PNG was rendered three
  times and read each time; the final one is a correct, legible sequence
  diagram.

  **Four entries, D1-D4, with repros under `examples/repro/`.** D1 is the
  blocker and it is the archetype's whole problem: N arrows between the same
  pair of shapes are routed identically, so eight TCP segments render as one
  arrow with the labels overprinted into a smear (`SYN`/`SYN-ACK`/`ACK` came out
  as `SYNKACK`), and `check` says nothing. The shipped diagram works around it
  by giving every message its own row of duplicated state boxes - ten rows,
  twenty-two boxes - which is why it is 2052px tall for a nine-message exchange.
  D2 (unnamed `<Row>`/`<Col>`/`<Grid>` caption themselves "Frame" - three stray
  captions in the first render), D3 (an attached `<Note>` covers the arrow, its
  label and the server's `CLOSED` box outright, so the PNG omits a state), D4
  (`layout="grid"` has one `gap` for both axes, `rowGap` is `ir/unknown-prop`;
  the first render was 7193px tall from 160px of dead space per row).

  Two authoring choices, both kept inside the "may not touch `src/`" rule. D2
  and D4 were worked around *in the diagram* because each has a documented
  alternative component - `<Group layout="col">` for the chrome, nested
  `<Col>`s in a `<Row>` for the per-axis gap - so the ledger keeps the evidence
  in the repro and the example ships the good diagram. D3 was **not** worked
  around: the note stays where a reader wants it, covering `server-ack2`, so the
  example carries the defect visibly until a fix task drains it. `npm run check`
  green; no `src/` touched, so `docs/renders/` and `docs/baseline.md` are
  unchanged.

- [x] **T29. TCP state machine.**
  The eleven-state diagram - `CLOSED`, `LISTEN`, `SYN_RCVD`, `SYN_SENT`,
  `ESTABLISHED`, `FIN_WAIT_1`, `FIN_WAIT_2`, `CLOSING`, `TIME_WAIT`,
  `CLOSE_WAIT`, `LAST_ACK` - with transitions labelled `event / action`.
  Use `layout="auto"`; this is the graph ELK exists for. **Self-transitions and
  cycles are the thing to watch**: a state machine needs an edge from a node to
  itself, and nothing in the corpus has ever asked for one. If `from === to` is
  rejected, or renders as nothing, that is a blocker entry.
  **Acceptance:** `examples/tcp-states.tldsl.jsx`, check clean, PNG reviewed,
  gaps logged.

  `examples/tcp-states.tldsl.jsx` exists and `tldsl check` is clean: eleven
  states in a `<Graph>` with all twenty RFC 793 transitions labelled
  `event / action`, opening transitions blue and closing ones red. The PNG was
  rendered and read twice, and **it is illegible** - that is the finding.
  Four entries, D5-D8, each with a repro under `examples/repro/`.

  **D5 (blocker) is the one the task predicted:** `from === to` is accepted by
  `check`, draws no loop at all, and stamps the transition's label over the
  box's own label - in the full diagram `recv data / ACK` ends up floating on
  the frame border with no arrow near it. **D7 (blocker) is the bigger one:**
  `layout="auto"` does not lay the graph out. A straight chain `a->b->c->d`
  packs into a 2x2 block, `gap="40"` and `gap="400"` render byte-identical PNGs
  with the nodes 20px apart either way, and `direction` makes no difference -
  confirmed through `tldsl render`, not just the screenshot tool. Eleven states
  20px apart with twenty labelled arrows is why the render looks the way it
  does. D6 (wrong) - an arrow label in the default `draw` font loses its spaces
  (`recv FIN / send ACK` renders `recvFIN/sendACK`), which is arrow-specific and
  font-specific: the same string on a `<Box>` in `draw` is fine. D8 (ugly) - an
  auto container reserves no room for edge labels (a `<Row>` widens its gap
  until the label fits; auto has no equivalent) and draws arrows as direct
  chords across the states in between.

  Two authoring choices. `font="sans"` on every edge is the only workaround
  applied - it is a documented prop and D6 keeps the evidence - and **nothing
  else was worked around**: the self-transition stays in the source with its
  label sitting on `ESTABLISHED`, the `<Graph>` keeps its stray "Frame" caption
  (D2, which has no chrome-free alternative for `<Graph>` the way `<Row>` has
  `<Group>` - noted under D2), and the note still covers part of the drawing
  (D3). `npm run check` green; no `src/` touched, so `docs/renders/` and
  `docs/baseline.md` are unchanged.

- [x] **T30. A layered web application architecture.**
  Browser, CDN, load balancer, a horizontally scaled app tier, cache, primary
  and replica databases, object storage, and a background worker fed by a queue.
  The everyday diagram this tool most needs to be good at. Include the things
  real ones have and the corpus does not: a replica pair with a replication
  arrow between them, a component that talks to three tiers at once, and an
  external dependency drawn outside the system boundary.
  **Acceptance:** `examples/web-architecture.tldsl.jsx`, check clean, PNG
  reviewed, gaps logged.

  `examples/web-architecture.tldsl.jsx` exists and `tldsl check` is clean:
  browser and an external `Payments API` in a chrome-free `<Group>` above the
  boundary, then a `system` frame holding four named tiers - `Edge` (CDN, load
  balancer), `App tier` (app-1..3), `Data` (Redis, Postgres primary, Postgres
  replica, object storage) and `Async` (job queue, background worker). All three
  of the things the corpus does not have are in it: the replica pair with a
  dashed `streaming replication` arrow between them, the worker as the component
  that talks to three tiers at once (queue, data, and out through the boundary
  to the payment gateway), and the external dependency drawn outside. Edges
  pointed at a *frame* id (`app-tier -> cache`, `-> db-primary`, `-> db-replica`,
  `-> queue`) work fine and are the honest way to say "the whole tier does this";
  that was the one thing tried that was not in the skill and it needed no
  workaround. The PNG was rendered and read; it is legible, and the tiers read
  top to bottom in the right order.

  **Four entries, D9-D12, with repros under `examples/repro/`.** D9 (ugly) - an
  edge label wraps mid-word: `dequeue` renders `dequeu`/`e` between two adjacent
  boxes, and removing `gap` or setting it to 120 or 144 changes nothing (it
  comes right between 144 and 160). This partly corrects D8: `labelClearanceGap`
  exists but reserves ~50px too little, and the same crush collapses the space
  in `streaming replication` even in `font="sans"`, which was D6's workaround.
  D10 (ugly) - the four tiers are 540, 520, 1569 and 616px wide inside a 1633px
  boundary because each frame is sized to its own contents and centred; a
  layered diagram is read by its bands and these bands are ragged.
  `align="stretch"` is rejected with `ir/bad-align` and the skill offers no
  other lever. D11 (ugly) - a cross-tier edge's label is stamped at the
  geometric midpoint regardless of what is there, so `origin pull` sits across
  `app-3` and `enqueue` across the `Postgres primary` ellipse; that is D8's
  label half seen outside an auto container. D12 (papercut) - `<Group>` requires
  an `id`, the skill's component table does not say so, and the diagnostic names
  `<frame>`, an element that appears nowhere in the file.

  Two authoring choices. **Nothing was worked around except D12**, which is
  unavoidable - the file does not compile without the id. `dequeue` keeps its
  broken word, `origin pull` keeps sitting on `app-3`, the tiers stay ragged and
  the note still covers the async frame's border (D3), so the example carries
  its defects visibly until a fix task drains them. And the repro for D12 is
  written to *compile*, with a comment naming the line to delete, because every
  existing repro compiles and T40 gates the whole of `examples/` on that.

  `npm run check` green. No `src/` touched, so `docs/renders/` and
  `docs/baseline.md` are unchanged.

- [x] **T31. An event-driven microservice topology.**
  Six or seven services around a message bus, with both publish and subscribe
  edges, a dead-letter path, and a saga spanning three services. Stresses
  many-to-one and one-to-many through a single hub - the shape T6's fan
  placement was built for, on a graph it has never seen.
  **Acceptance:** `examples/event-driven.tldsl.jsx`, check clean, PNG reviewed,
  gaps logged.

  Built `examples/event-driven.tldsl.jsx`: four core services that both publish
  and subscribe, a `Kafka` frame of four topic boxes as the hub, three derived
  consumers fed by two frame-targeted edges (`bus -> analytics`), and a
  dead-letter topic with a redrive edge back onto the bus. The checkout saga
  runs orders -> payments -> shipping and compensates backwards onto
  `orders.v1`. `check` clean on the first run; 17 edges over 14 shapes.

  **The numbers.** `layout-report`: 14 edge-edge crossings, 4 overlapping shape
  pairs, canvas 1102x744, fill ratio 0.25. `arrow-truth`: 11 of 17 arrow paths
  cross a shape they do not connect, 2 arrow labels sit on a non-endpoint shape,
  1 crowded arrow pair at `97% within 8px`. The PNG was rendered and read, and
  it is the worst-reading diagram of Phase 9 so far: three of the four topics
  are hidden under the saga note and the eight publish/subscribe labels merge
  into one run of glyphs.

  **Four new entries, D13-D16, plus recurrences on D1 and D3.** D13 (wrong) -
  eight labels land in one 33px band because each goes at its own edge's
  midpoint, and seven of nine label boxes overlap a neighbour; they collide with
  each other, not with shapes, and no tool counts that. D14 (ugly) - the
  antiparallel separation is mis-scaled in both directions: the 413px
  dead-letter pair bows ~165px sideways out of the bus frame and parks both
  labels on `Notification service`, while the adjacent `t-orders`/`payments`
  pair gets no separation at all. D15 (papercut) - `check` printed nothing on
  all of the above; it validates the IR, not the diagram, and it has never once
  been the thing that caught a defect in this ledger. D16 (papercut) - `maxW`
  is documented on `<Note>` and `<Sticky>` and rejected by `check` on both,
  which also corrects D3: `w` **is** allowed and does cap the note, it is just
  a hand-tuned coordinate and it turns a horizontal occlusion into a vertical
  one.

  Nothing was worked around and nothing was reshaped: the note still hides three
  topics, the labels still smear. `npm run check` green, no `src/` touched, so
  `docs/renders/` and `docs/baseline.md` are unchanged.

- [x] **T32. A C4 container diagram.**
  Follow the C4 convention properly: a system boundary, containers inside it
  with technology annotations, external systems and people outside it, and every
  edge labelled with both purpose and protocol. C4 has explicit conventions this
  tool has never been measured against - the interesting question is how much of
  it is expressible and how much needs new vocabulary.
  **Acceptance:** `examples/c4-container.tldsl.jsx`, check clean, PNG reviewed,
  gaps logged.

  `examples/c4-container.tldsl.jsx` exists and `tldsl check` is clean: the
  canonical Big Bank internet-banking subject, with two people and two external
  systems in chrome-free `<Group>`s above and below a `<Frame>` boundary holding
  the five containers (web app, SPA, mobile app, API app, database), every
  element carrying its C4 three-line label and every one of the eleven edges
  carrying purpose *and* protocol - `Reads from and writes to [JDBC]`,
  `Makes API calls to [XML/HTTPS]`, `Sends e-mail using [SMTP]`.

  **Most of C4 turned out expressible, and the parts that are not are notation,
  not layout.** Two discoveries worth carrying forward. Multiline labels work
  via `label={"a\nb"}` - the expression form, not the string-attribute form -
  which is what a C4 element needs and what nothing in the corpus had used;
  and `maxW` **is** accepted on `<Box>` and wraps within each line, which is
  the opposite of D16's finding on `<Note>`/`<Sticky>`. Applying `maxW="240"`
  is authoring, not a workaround: C4 containers are fixed-width boxes, and
  without it the five containers sit on one 9474px line at aspect ratio 5.38.

  **The numbers.** `layout-report`: 0 overlapping shape pairs, 6 edge-edge
  crossings, 2 edges crossing a frame boundary they don't belong to, canvas
  2848x1226, fill ratio 0.221. `arrow-truth`: 3 arrow paths crossing a
  non-endpoint shape and **3 labels on one box** - `Mobile App` carries the
  SPA's API call, the staff member's mainframe access and the e-mail to the
  customer on top of its own three-line label. The PNG was rendered and read.
  It is legible - the second-best render of Phase 9 after T30 - and the
  containers read left to right in C4's order.

  **Three new entries, D17-D19, plus recurrences on D6 and D11.** D17 (ugly) -
  a `<Frame>` takes only `color`, so the dashed system boundary that is C4's
  central piece of notation is `ir/unknown-prop`; worse, a `<Box>` *can* be
  dashed, so the render shows boldly dashed external systems around a hairline
  solid boundary, C4's emphasis inverted. D18 (ugly) - `geo` has `heart` and
  `star` but no `person` and no `cylinder`, so an actor and a datastore are
  both ellipses distinguished only by colour. D19 (papercut) - `label="a\nb"`
  as a string attribute passes `check` silently and renders the two characters
  `\n` inside the box; the working expression form is documented nowhere in the
  skill. **D6 is corrected**: it claimed `font="sans"` fixes the vanishing
  spaces, and all eleven edges here are `sans` and still render `writesto`,
  `bigbank.com/ibusing`, `e-mailusing` - verified at native resolution. D11 gains
  the asymmetry that explains it: a row widens its gap to clear the label of an
  edge between **adjacent** children and reserves nothing for an edge that skips
  one.

  Nothing was worked around and nothing was reshaped. The boundary stays
  undashed, the people stay ellipses, and the three labels stay stacked on
  `Mobile App`. `npm run check` green (59 files, 657 tests); no `src/` touched,
  so `docs/renders/` and `docs/baseline.md` are unchanged.

- [ ] **T33. A CI/CD pipeline with branches and a gate.**
  Commit through build, unit tests, integration tests, a manual approval gate,
  staging, smoke tests, production, plus a rollback path returning to a previous
  stage. **The rollback edge is the point**: an arrow that flows backwards
  against the layout axis is exactly the shape that produced the worst render in
  this project's history, and Phase 1's routing was tuned without one in the
  corpus.
  **Acceptance:** `examples/cicd-pipeline.tldsl.jsx`, check clean, PNG reviewed,
  gaps logged.

- [ ] **T34. Triage the ledger.**
  Read every entry. Group duplicates - several diagrams will hit the same
  underlying gap from different directions, and that is the signal worth acting
  on. Order by severity, then by how many diagrams each affects. Write the
  ordered list at the top of `docs/diagram-defects.md`.
  **Do not fix anything in this wake.** If triage shows the whole ledger is
  papercuts, say so and strike T35-T38 rather than inventing work to fill them.
  **Acceptance:** an ordered list exists, duplicates are merged, and each entry
  names the tasks that will consume it. No code.

- [ ] **T35. Fix the top defect.**
- [ ] **T36. Fix the next defect.**
- [ ] **T37. Fix the next defect.**
- [ ] **T38. Fix the next defect.**
  Four wakes, each taking the highest unfixed entry from T34's ordered list.
  Same rules as the rest of the plan: smallest test at the right layer,
  `npm run check` green, re-render every affected example and look at it.
  Mark the entry fixed in the ledger with the commit that did it.
  A defect that turns out to be a design decision rather than a bug gets struck
  in the ledger with the reason - that is a result too. If the ledger empties
  early, strike the remaining tasks; do not invent defects.

- [ ] **T39. Re-test the skill on unseen material.**
  T24 tested the skill against a diagram T24 chose. Give a subagent **only**
  `skills/tldsl/SKILL.md` and one sentence - "draw the OSI seven-layer model
  with an example protocol at each layer" - and no other context, no examples
  directory, no corpus. Whatever it produces is the measurement.
  **Acceptance:** the diagram compiles on the first attempt and renders legibly.
  If it does not, the fix is to the skill, not to the prompt you gave it - and
  the failure goes in the ledger with what the skill failed to say.

- [ ] **T40. Regression gate.**
  Run `tldsl check` and `tldsl render` over every file in `tests/corpus/` and
  `examples/`, including everything Phase 9 added. Nothing may fail to compile
  and nothing may have regressed visually against the renders taken when it was
  written.
  **Acceptance:** every file compiles, every PNG has been looked at, and any
  regression is either fixed or logged with the commit that caused it. Record
  the final corpus-wide crossing and crowded-pair numbers in `docs/baseline.md`
  so there is one honest end-state measurement.

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

---

## Questions for the human

Defaults were taken so the loop could continue; nothing here is blocking. Each
entry is a decision a human may want to revisit, with what it costs to leave it
as-is.

- **T25 - the overlay hook reports canvas changes nobody made.** The task asks
  `UserPromptSubmit` to flag a non-empty `*.tldsl.overlay.json` as "source and
  canvas disagree". Shipped exactly that, and it reported 8 changes on a file
  nobody had edited, because rendering it once makes the viewer write an
  index-only overlay.
  **Default taken:** shipped the hook as the task specifies and wrote the false
  positive down. It changes least: the hook is three lines of `find` + `jq`, and
  the alternative fixes are both outside T25.
  **Alternatives:** (2) filter index-only entries inside the hook - rejected,
  Phase 8's rule is that a hook which computes something is a bug; (3) stop the
  viewer PUTting an index-only overlay, a core round-trip change; (4) ship
  `tldsl overlay show` and have the hook read its count, which is the shape the
  phase's own missing-commands table already implies.
  **What the default costs:** anyone who renders a diagram once then gets nagged
  to run `/tldsl:sync` on every subsequent turn, for nothing. That is bad enough
  that the hook may be worth disabling until (3) or (4) lands.

- **T12 - the last arrow-label overlap, and squished diagonal labels.** T12's
  acceptance is *no* arrow label's bounding box overlapping a shape the arrow
  does not connect; the shipped work reached **1** on the new fixture (0 across
  the whole corpus, which carries no edge labels).
  **Default taken:** accepted 1 and ticked the box. It changes least - the
  clearance mechanism is a clear win on its own terms (2 -> 1 overlaps, and the
  render went from three stacked label fragments per edge to legible labels with
  real clearance), and the survivor is marginal: `e-ingest-publish`'s label rides
  a bent skip edge's apex and clips the top few pixels of the box it skips.
  **Alternatives:** (2) boost `|bend|` in `routing.ts` by half the label height
  for a *labeled* bent edge, which would clear exactly this case in about five
  lines; (3) nudge tldraw's `labelPosition` off 0.5 for an overlapping label,
  which needs the domain to know where a point at parameter t lands on the arc -
  duplicating tldraw geometry, the class of thing that has failed here before;
  (4) re-word the acceptance to exclude bent skip edges.
  **What the default costs:** one marginal overlap survives, and separately - not
  counted by the metric, because a squished label is not an overlapping one -
  **cross-container diagonal labels are still force-wrapped** (`on failure`
  renders as `on / failur / e`). Those edges' bodies are wider than tall, so
  tldraw's 64px squish margin applies to them exactly as it does to a row edge,
  but the clearance they need is horizontal space that a `col` container's
  vertical gap cannot provide. That is the same residue class as the T6b
  cross-container question above: both are diagonal edges that the axis-aligned
  machinery declines. Anyone revisiting either should look at them together.

- **T6b - the cross-container floor.** Acceptance asked for the
  `cross-container` bucket at <= 5; the shipped work reached 9.
  **Default taken:** accepted 9 and ticked the box. It changes least - the code
  is a clear win on its own terms (crossings 17 -> 11, `deep-nesting` 9 -> 3,
  all crowded pairs gone, T5 unblocked and ticked) and reverting it to make the
  box honest would throw that away.
  **Alternatives:** (2) re-word the acceptance to cover only axis-aligned
  cross-container edges, by which reading the bucket went 15 -> 0 and T6b passed
  outright; (3) add a task that owns diagonal edges - either a detour waypoint
  in `routing.ts` or placement, the trick that already worked twice.
  **What the default costs:** nine crossings survive, all from six edges whose
  endpoint x-bands *and* y-bands are disjoint, so `deriveAxis` returns null and
  they are declined before any routing runs. Four are `hexagonal`'s `usecases ->
  p-*` fan into a column of ports offset on both axes. The `cross-container`
  bucket name now outlives its contents: nothing in it is axis-aligned, so it is
  a different failure mode wearing the old label. Worth renaming if anyone
  revisits.
  **Already ruled out, do not retry:** widening `deriveAxis` to a dominant-axis
  fallback. Built and measured - an exact no-op on all eight files, byte-identical
  route maps and PNGs. Tried three times now.

- **T9 - frame `color` compiles but does not render.** T9 asked for `color` on
  frames. It lowers, validates and emits correctly, but tldraw's
  `FrameShapeUtil.options.showColors` defaults to `false`, so every frame is
  drawn in `theme.black` no matter what `props.color` says.
  **Default taken:** shipped the pass-through and left the viewer alone. It
  changes least: enabling it is `FrameShapeUtil.configure({ showColors: true })`
  in `src/viewer/app.tsx`, a one-line, trivially reversible change - but it also
  swaps every frame heading's fill from `theme.background` to the colour's
  `headingFill` and shifts the heading x-offset from -6 to -1, i.e. it changes
  how all three frame-bearing corpus renders look, for a feature no corpus file
  uses. T9's acceptance is "byte-identical", so putting it in the same wake
  would have made the acceptance unmeasurable.
  **Alternatives:** (2) flip `showColors` in the viewer and re-baseline the
  three frame renders in the same change; (3) drop `color` from `<Frame>`
  entirely and let containment be conveyed by nesting alone.
  **What the default costs:** an author can write `<Frame color="blue">`, get no
  diagnostic, and see no colour - the one failure mode decision 9 was written to
  prevent. Whoever picks this up should also note that frames are the *only*
  place tldraw hides a valid prop behind an editor option; boxes, notes and
  arrows all honour `color` immediately.

- **T9 - `fill` has five values, not four.** The task lists
  `none|semi|solid|pattern`; tldraw's `DefaultFillStyle.values` is
  `["none","semi","solid","pattern","fill"]`.
  **Default taken:** accepted all five. Decision 9 is "raw tldraw enums,
  pass-through, rejected if unknown", and `"fill"` is not unknown to tldraw.
  **Alternatives:** (2) reject `"fill"` to match the task text literally.
  **What the default costs:** nothing found - it is a superset, the fixture
  exercises all five, and geometry is unaffected. Recorded only so the
  discrepancy between the plan text and the schema is not re-derived.

- **T8 - only three files could shrink.** T8's acceptance asks for a canvas
  area drop on at least four files; the shipped change reached three
  (deep-nesting -4.8%, hexagonal -5.2%, multi-region -7.9%).
  **Default taken:** accepted three and ticked the box. Only three of the eight
  corpus files contain a `<Frame>`, so a frame-chrome measurement cannot reach
  a fourth - the number in the acceptance was written before anyone counted the
  frames. Accepting changes least: the mechanism is correct, measured from
  tldraw's own source, and every file it can touch it did touch.
  **Alternatives:** (2) re-word the acceptance as "every corpus file that
  contains a frame", which the change meets outright; (3) widen T8's scope to
  non-frame whitespace - gaps, box padding, the note column - which would move
  the other five but is a different task with a different risk profile, and the
  authored `gap`/`pad` values live in frozen corpus fixtures.
  **What the default costs:** nothing measurable. The risk is a future reader
  taking "3 of 8" as a partial failure of the mechanism rather than as the
  corpus having only 3 candidates.

- **T7 - the attached-pair overlap whitelist.** T7 asks for overlap checks to
  whitelist a note and the shape it is attached to, so a deliberate annotation
  does not trip the "overlapping shape pairs" gate in `tools/layout-report.mts`.
  **Default taken:** not built. `attach.ts` separates every candidate placement
  from its target by a 24px gap, so an attached pair cannot overlap; a whitelist
  today exempts nothing. Measured 0 overlapping pairs on the new fixture.
  **Alternatives:** build it now against a future overlap-permitting mode; or
  add an explicit `over` / `inside` prop that places a note on top of its
  target, at which point the whitelist becomes load-bearing.
  **What the default costs:** nothing today. It becomes a real gap the moment
  someone adds a placement that is allowed to overlap - the gate would then
  report a false positive and there is no exemption path.

- **T16 - `<Layers>` and `<Swimlanes>` are the same mechanism under two
  names.** T16 describes them as different things (stacked tiers vs. labelled
  lanes), but both reduce to "a `col` frame whose frame children are forced to
  `layout="row"`". The only shipped difference is chrome: `<Layers>` marks an
  unnamed tier `group: true`; `<Swimlanes>` never does.
  **Default taken:** shipped both, distinguished only by that chrome rule. It
  changes least - each is four lines over `Frame`, neither touches the engine,
  and either can be deleted later without moving any geometry.
  **Alternatives:** (2) build the thing that would make `<Swimlanes>` genuinely
  distinct - cross-lane column alignment, so the *n*-th box of every lane shares
  an x-range - which needs a real engine change, since `applyContainerBoxSizing`
  shares a width within one container and has no notion of sibling containers
  agreeing; (3) ship only one of the two and let the other be a userland
  component in T16b, which is arguably where a domain vocabulary belongs.
  **What the default costs:** a swimlane diagram whose lanes hold different
  numbers of boxes does not line up into columns - the defining visual property
  of a swimlane chart. It is written into `docs/dsl.md` as a known limitation,
  so nobody will be surprised, but the primitive under-delivers on its name.

- **T16b - reload on editing an imported file is proven as a chain, not end to end.**
  Acceptance asked that editing the *imported* file trigger a reload in `serve`.
  What was verified: `compileFile`'s `result.inputs` contains `lib/c4.jsx`, and
  `watch-and-serve.test.ts` already pins that `watchHandle.update(result.inputs)`
  is called after every successful compile. No test starts a real `serve`,
  touches the imported file and observes a pushed scene.
  **Default taken:** accept the two-link chain, because it reuses tests that
  already exist and adds nothing to the process-spawning surface of the suite.
  **Alternatives:** an `app`-level test driving `watchAndServe` with the fake
  watch/transport ports and a real two-file fixture on disk (medium cost, no
  new process); a `tests/e2e/` test that spawns `tldsl serve`, edits the
  imported file and reads the SSE stream (high cost, flaky).
  **What the default costs:** if the watch handle ever stops re-subscribing, or
  chokidar stops reporting changes to a file added mid-session, the suite stays
  green and multi-file authoring silently stops live-reloading.

- **T17 - serpentine kept despite a flat crossing count.** The criterion was
  "keep if crossings drop and nothing regresses". Crossings did not drop:
  13 -> 13, per file identical. Nothing regressed: over all sixteen fixtures
  exactly one number in the whole canvas/edge-length diff changed.
  **Default taken:** kept it. The wake rule "a shipped mechanism that misses its
  number is a result, not a failure - do not revert working code to make a box
  honest" points at keeping, and the one number that moved is a 19% edge-length
  drop on `release-pipeline` whose render visibly loses two full-width
  diagonals. Reverting is a one-commit revert of +21/-6 in one file if you
  disagree.
  **Alternatives:** (a) revert, per B21b's precedent and a literal read of the
  criterion; (b) keep but gate it to containers whose children form a chain,
  which is the topology serpentine is actually for - except B20's auto-wrap gate
  admits a container precisely when it is *not* a chain, so that gate would
  never fire.
  **What the default costs:** a flag and a helper in `stack.ts` that earn
  nothing on the gate metric, plus `long-labels`' rows now reading right-to-left
  for no measured gain - and that file's boxes are full sentences, so backwards
  row order is arguably worse prose order even though no tool notices.

- **T19 - `apply` never re-runs layout.** T19 asked for a decision on overlay
  precedence; the doc takes it further and fixes an invariant T20 will be built
  on: `apply` is a patch over the finished scene and never feeds back into the
  layout engine.
  **Default taken:** no re-layout. It changes least - it keeps `apply` a pure
  function of two arguments, which is the whole reason the round-trip is
  lossless by construction, and layout-under-overlay has no guaranteed fixed
  point (a nudged box changes a container's extent, which moves the box).
  **Alternatives:** (2) re-run layout with overlay entries as hard pins, which is
  the `free`-container behaviour generalised; (3) re-run layout only when a
  `restyled` changes `font`/`size`, the two props that change text metrics.
  **What the default costs:** a canvas font or size change leaves the box sized
  by the old metrics until the user drags it or absorbs. Visible, not wrong, and
  fixable by the user with one drag.

- **T19 - a `PUT` route rather than the reserved websocket.** CONTEXT.md's
  transport section says "Websocket is reserved for phase 2 if round-trip needs
  bidirectional". The doc concludes it does not.
  **Default taken:** the viewer writes the overlay over `PUT /overlay` on the
  existing dev server; SSE stays one-way and `TransportPort` is unchanged. It
  changes least - one route on a server that already 405s non-GET, versus a
  second transport with its own reconnect and message contract.
  **Alternatives:** (2) upgrade the transport to a websocket as CONTEXT.md
  anticipated; (3) have the viewer write nothing and make every nudge an
  explicit "save" gesture.
  **What the default costs:** if round-trip later needs the server to push
  something the viewer must acknowledge, the `PUT` route will not carry it and
  the websocket question reopens. Nothing in the current design needs that.

- **T20 - `restyled` carries any changed prop, not just the tldsl style
  vocabulary.** D1 says `restyled` is "a partial props patch in the **tldsl
  style vocabulary**" (`src/domain/ir/styles.ts`). Restricting it to those enums
  would silently drop a canvas change to `geo`, `spline`, `arrowheadStart`,
  `growY` or anything else outside the DSL's surface, which contradicts D1's own
  losslessness headline.
  **Default taken:** `restyled` is a flat patch of *every* changed prop, plus the
  two top-level fields a user can actually change from the style panel
  (`opacity`, `isLocked`, listed in `RESTYLE_RECORD_FIELDS`). It changes least:
  the schema and D1's flat `{ "color": "red" }` shape are untouched, and for
  every prop that *is* in the vocabulary the absorb mapping is still the
  mechanical rename D1 describes.
  **Alternatives:** (2) restrict to the vocabulary and drop the rest, breaking
  round-trip for any non-DSL prop; (3) restrict to the vocabulary and add a
  second op for the remainder, which is two names for one gesture.
  **What the default costs:** absorb (T22) will meet `restyled` keys it cannot
  turn into a JSX prop. It has to leave those in the overlay rather than assume
  every key maps - if it empties the overlay regardless, the render changes.

- **T20 - `putOverlay` pushes the applied scene back over SSE.** D4 says `serve`
  deliberately does not watch the overlay file, because the viewer's own write
  would push a fresh scene back and stomp the canvas being edited. But the SSE
  transport replays its last message to new subscribers, so without *some* push
  a browser reload is served the pre-edit compile and the edits vanish - which
  is exactly what this task's acceptance forbids.
  **Default taken:** after writing the overlay, `putOverlay` pushes
  `applyOverlay(overlay, lastCompiled)` - the scene the browser already has - so
  the replay is correct. The stomp D4 feared is avoided in the viewer instead: it
  skips `loadSnapshot` when the incoming scene already equals its current
  document. No watcher was added.
  **Alternatives:** (2) give `TransportPort` a "set the replay value without
  broadcasting" method; (3) have the viewer re-request the scene over HTTP on
  load instead of relying on SSE replay.
  **What the default costs:** a second browser viewing the same diagram receives
  a full `loadSnapshot` every time the first one nudges a shape. Single local
  user is the documented scope (round-trip.md "Out of scope"), so this costs
  nothing today.

- **T22 - absorb shipped deterministic, not model-driven.** The task and
  `docs/round-trip.md` D5 both describe absorb as "a model rewrites the JSX",
  allowed to be imperfect because it is reviewed. What shipped is a mechanical
  rewriter with a verification gate: it absorbs the entries it can express
  exactly, leaves the rest in the overlay, and refuses outright if the result
  does not reproduce the render.
  **Default taken:** built the mechanical half only. It changes least and is the
  reversible option - a model can be put in front of it later, or asked to
  restructure its flat pinned output afterwards, without any of this code
  changing. A CLI that shells out to a model would bake an agent dependency into
  a tool CONTEXT.md says is agent-agnostic, and that is the harder thing to undo.
  **Alternatives:** (2) `absorb` shells out to a model for the rewrite and uses
  the same verification gate to accept or reject it; (3) `absorb` emits the
  mechanical rewrite plus a prompt, and Phase 8's `/tldsl:sync` command drives
  the model half.
  **What the default costs:** the canvas-first case produces *correct* JSX, not
  *good* JSX - a flat pile of hard-pinned `<Box>` elements with every style prop
  spelled out, no frames, no components, no flow. The half of the Phase 7 pitch
  that says absorb "turns a flat pile of shapes into componentised JSX" is not
  built, and nothing mechanical can build it.

- **T26 - what `tldsl verify` means, and who empties a redundant overlay.** The
  task's acceptance names `tldsl verify` as if it existed; it did not, and no
  Phase 7 doc defines it. I defined it as "apply each overlay entry alone to the
  fresh compile; pass when none of them change anything", and left it read-only.
  **Default taken:** the definition above, plus prose in `commands/sync.md`
  telling the agent to `rm` the overlay once `verify` has passed. It changes
  least - no new flag, no new destructive code path, and D5's rule already
  authorises the deletion once the check is green.
  **Alternatives:** (2) `tldsl verify --prune` empties a redundant overlay
  itself, so the agent never runs `rm`; (3) verify compares against a stored
  snapshot of the canvas scene instead of the compile, which would catch an
  agent that edits the JSX *and* the overlay in the same breath, at the cost of
  a new on-disk artefact; (4) fold verify into `absorb --check` and ship no new
  subcommand.
  **What the default costs:** the last step of `/tldsl:sync` is an `rm` the
  model decides to run, so a model that misreads verify's output can delete an
  overlay that still held work. The window is small - verify prints the exact
  path only on the passing branch - but it is a model in the loop where a flag
  would have been a program.

## Discovered work

- **A render wrote an overlay file I never asked for, once.** The first
  `tools/screenshot.mts` run over `examples/tcp-lifecycle.tldsl.jsx` left an
  `examples/tcp-lifecycle.tldsl.overlay.json` behind containing eight `moved`
  entries - tldraw reparenting the eight arrow shapes into `shape:ladder` -
  which then produced `overlay/unresolved-id` warnings against the next edit of
  the source. It did **not** reproduce: deleting it and re-rendering the same
  file produced no overlay, and a from-scratch grid-plus-eight-arrows diagram
  under `examples/repro/` produced none either. Not logged as a defect because
  an unreproducible one is not a defect yet, but if `render` or `serve` can
  persist tldraw's own automatic reparenting as author edits, that is a
  correctness problem in the absorb path worth a deliberate hunt.
- **`check` cannot see a diagram that lost information.** D1 and D3 both render
  something false and both pass `check` silently. A post-layout diagnostic for
  "two edges share a path" and "a shape is fully covered by a note" would catch
  the two worst findings of this wake before anyone looks at a PNG.
- **An arrow has no rank.** Even with D1 fixed, nothing in the vocabulary says
  message 3 comes after message 2. Sequence diagrams number their messages; a
  fix that only separates the paths will still leave the reader to infer order
  from geometry.

- **T23: rendering a diagram writes an overlay file into the repo.** Every
  `tldsl render` (and every `tools/screenshot.mts`) boots the viewer, and the
  viewer PUTs its snapshot back, so `tests/corpus/sequence.tldsl.overlay.json`
  appears with 13 `moved` entries that carry only an `index` - tldraw reassigns
  fractional indexes on mount, and `diffScenes` reports that as a canvas edit.
  Harmless to the render (the PNGs stay byte-identical) but it litters the
  working tree during a corpus re-render, and it means an index-only `moved`
  record is indistinguishable from a real reorder. Either ignore index-only
  diffs in `diffScenes`, or give `render` a read-only viewer mode.

- **T23: `docs/baseline.md`'s `png` column disagrees with the committed PNGs.**
  The table says `deep-nesting` exports at `1316 x 1708`, computed from the
  layout report's `594 x 790` canvas. tldraw's own page bounds for that file are
  `594 x 752`, and the committed `docs/renders/deep-nesting.png` is `1316 x 1632`
  - which `tldsl render` reproduces byte for byte. So the report's canvas height
  over-reports by 38px on this file and the doc's `png` column was derived from
  it rather than measured. Nothing in the render moved; the number in the table
  is arithmetic on a stale input. Worth re-deriving that column from the actual
  files next time the corpus is re-rendered.
- **T23: `--frame` has no way to include the frame's own border and label.**
  tldraw's export draws a frame's contents, not the frame, so a single-frame
  export loses the box and the title that a reader needs for context. Passing
  the frame id plus a synthetic bounds would do it, or exporting the parent with
  `--shapes`. Nobody has needed it yet.
- **T23: the serve record is keyed by file, not by port, and never validates the
  URL.** `findServe` trusts a live pid. A `serve` that is alive but wedged, or a
  pid reused by an unrelated process on the same machine, would send `render` at
  a URL that answers nothing and it would fail with a playwright timeout rather
  than falling back to booting its own. A single HEAD request before trusting
  the record would close it.

- **T11: `estimatedNoteSize` is still a char-count guess, now a scaled one.**
  Sticky height reservation divides label length by
  `(NOTE_SIZE - 2*NOTE_PAD) / (15 * fontScale)`. It is now size-aware but still
  font-blind, so a `mono` sticky (13.20px/glyph) is over-reserved and a `serif`
  one is closer to the edge. The machinery to do it properly - `textWidth` with
  a `TextStyle` - now exists; only the willingness to move sticky geometry is
  missing. Any wake that re-renders the corpus anyway could switch it for free.
- **T11: `sans`, `serif` and `mono` share an identical 13.20px advance for
  every digit and every math symbol.** Not a measurement bug - all three are
  IBM Plex faces, whose digits and operators are 600/1000 units. `draw`
  (Shantell Sans) has the same signature at 15.40px for `+ < = > _ ~` but real
  per-digit widths. Anyone eyeballing the tables for "suspiciously uniform
  numbers" will find these first; they are correct.
- **T11: the `mono` table is 95 copies of `13.20`.** Kept in full so all four
  fonts share one lookup path and one regeneration command. If a fifth
  monospace font ever lands, a `uniform(13.2)` helper beats a second wall of
  identical numbers.
- **T11: nothing pins the glyph tables against tldraw's own fonts changing.**
  A tldraw upgrade that reships `tldraw_sans` would silently invalidate all
  four tables, and every test here is self-consistent - it would still pass.
  `tools/font-metrics.mts` makes re-measuring cheap; wiring a check that
  compares stored to measured (in a browser, so not in `npm run check`) is the
  missing half.
- **T11: `size` on a `<Box>` reads like a box dimension.** It is tldraw's name
  for the label's font size, and per decision 9 the enum names pass through
  raw - but `<Box size="xl" w="200">` is two different meanings of "size" one
  attribute apart. Not changed, because renaming it would be the first place
  the pipeline stops using tldraw's vocabulary.
- **T10: `NoteShapeUtil.toSvg` drops `labelColor`.** Sticky label colour is
  correct in the scene JSON and honoured by the live viewer, but every PNG from
  `tools/screenshot.mts` derives sticky label colour from `props.color`. Any
  future check that asserts a sticky's rendered text colour will fail for a
  reason that is not ours.
- **T10: `size` and `font` are still hardcoded in `builders.ts`.**
  `boxShape`/`noteShape`/`arrowShape` all pin `size: "m"`, `font: "draw"`. T11
  is the task that unpins them, and it is the one that has to measure - noted
  here only so the hardcoding is not mistaken for an oversight.
- **T10: `<Note>` and `<Sticky>` now take props that behave differently.** A
  geo-note is a `boxShape`, a sticky is a `noteShape`; they accept the same
  three props but tldraw honours `labelColor` on export for only one of them.
  Worth a line in `docs/dsl.md` if the two components ever get documented as
  interchangeable.
- **T10: no test pins the DSL-name-to-tldraw-name mapping.** `textAlign` ->
  `align` lives in one expression in `builders.ts`. `emit.test.ts` asserts the
  emitted `props.align`, which covers it today, but nothing fails loudly if
  someone "fixes" the input field name to `align` and reintroduces the
  collision.

Append here. Do not act on these during the wake that finds them; they get
promoted into the task list by the human.

- Anchor syntax `id.anchor` collides with dotted namespaced ids, so a component
  cannot prefix its children with `${ns}.` - filed as a bd bug (P1). Blocks any
  task that wants author-specified anchors.

- `attach.ts` counts a frame's own rect as an obstacle, so a note attached to a
  box in the middle of a large frame is pushed outside the frame entirely
  rather than into the frame's own empty space. That is the right answer given
  re-parenting, but it means an attached note can end up far from a deeply
  nested target. T8 (reclaim dead whitespace) will make this worse, not better.
- The attached-note placement is greedy and order-dependent: notes are placed
  in document order and each becomes an obstacle for the next. Two notes on the
  same target will stack right/below rather than being distributed.
- `<Sticky>` is exported and lowered but no corpus fixture or e2e test renders
  one, so B9's `growY` path is now covered only by unit tests. If T13 adds
  fixtures, one should carry a `<Sticky>`.
- `long-labels` lost its last two crossings for free when the note columns
  collapsed. It is now a zero-crossing file, which makes `deep-nesting` (3) and
  `hexagonal` (6) the entire remaining crossing residue - both purely diagonal.
- The `other` crossing bucket is now empty corpus-wide. `crossing-classify.mts`
  still prints it.
- A geo `<Note>` uses the box label path, so it inherits box text centring.
  A multi-sentence annotation would read better start-aligned; that is T10's
  surface (`align`), not something to hardcode here.
- `flow()` edges carry no source span; diagnostics report them at `.:0:0`
  (bd bug, P2).
- **`tests/corpus/sequence.tldsl.jsx` is misnamed.** It is a linear 14-step
  chain, not a UML sequence diagram - a `<Pipeline>` in disguise. Nothing in the
  corpus is a real sequence diagram. The name is a trap for whoever reads the
  corpus next and should be `linear-chain`, but renaming touches a fixture, so
  it needs to be a deliberate task rather than a drive-by.
- `docs/layout-champion.md` is still in the tree and still describes
  pre-`2484ffa` geometry. T1 marks it historical.

- **`fill` is not overridable on a geo `<Note>`.** T9 gave notes `color` only
  (that is what the task asked for), so `emitNote`'s geo path still hardcodes
  `fill: "semi"`. A `<Note fill="none">` is an `ir/unknown-prop`. One line in
  `ALLOWED_PROPS` + `lowerNote` + `emitNote` if anyone wants it.
- **`size`, `font`, `labelColor`, `align`, `verticalAlign` are still hardcoded
  in `builders.ts`.** T10 and T11 own four of the five; nothing owns `size` on
  an *arrow* (its stroke weight), which is the cheapest remaining legibility
  win in Phase 3 and is not layout-affecting.
- **The style enums are copied into `domain/ir/styles.ts`, not derived.** They
  cannot be imported - `domain/` may not import tldraw - so a tldraw point
  release that adds a colour silently leaves tldsl rejecting it. The pattern
  used elsewhere for exactly this (`DEFAULT_SCHEMA` in `builders.ts`) is pinned
  by an e2e test that reads the live schema; the enum tuples have no such test.
  `tests/e2e/scene-roundtrip.test.ts` is the natural home.
- **`arrow` shapes carry a `fill` prop** (`arrowShapeProps.fill`) that T9 did
  not expose. It only matters for filled arrowheads (`triangle`, `diamond`,
  `square`, `dot`), where it is the difference between hollow and solid - which
  is visible in `tests/e2e/fixtures/styles.tldsl.jsx`, where every arrowhead
  renders hollow.
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
- **A fan row does not wrap, so an 18-way fan is 3722px wide.** T6 buys its zero
  crossings with an unwrapped row; `wide-fanout`'s canvas aspect went from
  1.29 to 18.2 and its fill ratio is 0.335. Wrapping is not a fix - a second
  row loses the shared axis that makes the bow fire. A compact wide fan needs
  orthogonal (elbow) routing, which nothing in the plan owns.
- **`crowdedPairs` cannot see convergence at a shared anchor.** `wide-fanout`
  scores 0 while 17 arcs leaving `Dispatcher` are a solid wedge of ink for the
  first ~15% of their length, because the metric asks for 8px proximity over a
  *third* of the length. A second check on the first ~20% of each path, or on
  arcs sharing a source anchor, would catch it.
- **`findFanGroups` is first-come, first-served in flow order.** Overlapping
  candidate fans are resolved by whichever source appears earlier among the
  container's children, and a candidate touching an already-consumed id is
  dropped whole. Nothing in the corpus has overlapping fans, so this is
  untested against a real case.
- **T6's block machinery is general but only the doc root can reach it.** The
  `mayAutoGrid` gate was chosen so an explicit `layout=`/`cols=` is never
  overridden, which also means a fan inside an explicitly laid-out `<Frame>`
  gets nothing. Whether a frame should opt in (`layout="auto-fan"`? a prop?) is
  a real design question nobody has asked yet.
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
- **Diagonal edges are now the entire crossing residue, and nothing in the task
  list owns them.** After T6b the corpus is 11 crossings: nine cross-container
  diagonals plus `long-labels`' two `other`. Every one of the nine is declined
  at `deriveAxis` because the endpoints share neither an x- nor a y-range. Bows
  cannot help - the dominant-axis fallback was measured as an exact no-op (see
  T6b). The two candidate mechanisms are a detour waypoint (multi-point arrow
  path, a real departure from single-bend routing) and moving the endpoints so
  they share an axis (placement, which is how T6 solved `wide-fanout`). The
  second is the same trick that has worked twice; `hexagonal`'s six all come
  from one source fanning into a column of ports it is not aligned with.
- **`src/domain/layout/routing.ts` contains two literal NUL bytes** in the
  `assignLanes` group-key template literal, in place of what should be spaces or
  a separator character. Pre-existing since T5, unrelated to T6b. It does not
  affect correctness - NUL is a valid JS string char and equality still groups
  right - but it makes git treat the file as binary (`Bin 11682 -> 12373 bytes`
  instead of a diff) and breaks plain `grep` on it. Both cost a wake real time.
  Worth one line of cleanup.
- **`isCrossing` requires an obstacle to overlap the perpendicular band of
  *both* endpoints.** That is right for an axis-aligned skip and wrong for
  anything else: a box sitting squarely in the middle of a diagonal chord is
  not "crossed" by this predicate unless it happens to straddle both endpoint
  bands. It is the second reason the diagonal residue survives, independent of
  `deriveAxis`, and any future diagonal work has to replace it with an actual
  segment-vs-rectangle test - `segmentHitsRect` in `tools/arrow-truth.mts`
  already is one.
- **The `other` bucket has never been looked at.** `long-labels`' two crossings
  have been 2 since T4 and no task in the list targets them. They are now 18% of
  the remaining total.
- **The `cross-container` bucket label now lies about its contents.** After
  T6b every crossing in it is diagonal; not one is axis-aligned. Classifying by
  container relationship made sense when the parent gate was the thing blocking
  routing, and that gate is gone. `tools/crossing-classify.mts` would say more
  with a `diagonal` bucket applied before `cross-container`, which would read as
  `diagonal 9, other 2` and stop a future wake reaching for a container fix that
  cannot bite.
- **A nested frame's heading still lands in the gap above it.** T8 measured the
  heading at y in [-30, -6] outside the frame, and reserves that clearance only
  in a parent's *top padding*. A frame that is the second or later child of a
  `col` gets whatever `gap` the author set - 12, 14 and 16 in `deep-nesting`,
  all short of 30 - so its title is drawn over the band the previous sibling
  occupies. It reads fine today by luck: headings are left-aligned at the frame
  edge and the boxes above are centre-aligned, so they miss each other
  horizontally. Fixing it means an extra leading gap before every frame child in
  `computeFlowPositions`/`gridPositions` (there is already a `rowGaps`
  mechanism), and it would *grow* the canvas, which is why T8 did not do it.
- **Five of eight corpus files have no `<Frame>`.** `long-labels`,
  `release-pipeline`, `sequence`, `sparse-graph` and `wide-fanout` are flat.
  Any task whose acceptance counts "at least N files" needs to check first how
  many files can possibly respond to the mechanism - T8's four was unreachable
  for this reason. It is also a gap in the corpus itself: nothing exercises a
  frame that contains both boxes and a nested frame *and* is wide rather than
  deep.
- **`FRAME_PAD_TOP` is now used only by `src/domain/ports/layout.fake.ts`.**
  The real path (`sizeFrame`) composes its own top padding from `pad` plus a
  conditional `FRAME_TITLE_PX`, so the fake and the engine no longer agree on
  what a frame's top padding is. Harmless while the fake is only asserting
  relative placement, but it is a divergence that will mislead someone.
- **`estimatedBoxSize`'s `BOX_LABEL_PAD_X` is 32 and the frame inner pad is
  also 32,** so a box sitting flush in a frame has 64px between its glyphs and
  the frame border. Nobody has measured whether 32 is what tldraw's own label
  padding needs, the way T0 measured the glyph advances. The same trick that
  found `BOX_CHAR_PX = 14` was wrong would apply here.

- **T12: `<Edge>` still cannot be styled with `fill`, `bend` or
  `labelPosition`.** T12 exposed `label`/`labelColor`/`font`/`size`;
  `labelPosition` stayed hardcoded at `0.5` and `bend` is owned by `routing.ts`.
  An author who wants a label off-centre has no way to ask.
- **T12: `arrowLabelWidth` ignores wrapping entirely.** It measures a label as
  one line, so a long edge label (`"retries with exponential backoff"`) would
  demand a gap as wide as the whole sentence rather than wrapping to two lines
  at a sensible width. Nothing exercises it yet; T13's realistic diagrams might.
- **T12: the clearance rule only looks at *consecutive* siblings.** A labeled
  skip edge (source and target two apart) gets no clearance at all - exactly the
  case whose label rides the bend apex and produced T12's surviving overlap.
- **T12: the corpus has no edge labels at all**, so the new
  `arrow labels overlapping a non-endpoint shape` metric is 0 there by
  construction and cannot regress. It only starts measuring anything once T13's
  realistic diagrams land, which the task text says will use arrow labels.
- **`examples/kernel.tldsl.jsx` is an untracked leftover** in the repo root - a
  hand-authored 138-line diagram that has never been committed and is referenced
  by nothing. It is not test-generated (the only other `kernel` match in the tree
  is a comment about FSEvents in `chokidar-watch.test.ts`). Either commit it as a
  fixture or delete it; leaving it untracked makes every `git status` noisy.
- **T13: the clearance rule has no slack, so the label that sets the gap is the
  one that wraps.** `arrowLabelWidth("assets") = 70.27` gives a 134.27px gap and
  tldraw *still* squished `assets`, while `quote` (62.67) on a 136px gap was
  fine. A 2-4px slack constant on `ARROW_LABEL_MARGIN` would fix every case, but
  `stack.test.ts:323` and `:385` hardcode `+ 64`, so it is a three-file change
  and belongs to T12's surface. Worked around fixture-side with explicit `gap`.
- **T13: `auto` is exempt from the clearance rule and ELK is never told a label
  exists.** `elk-layout.ts` passes node sizes and `elk.spacing.nodeNode` only;
  edge labels are invisible to it. `RIGHT` squished seven of twelve labels on
  the state machine at the default gap. Passing edge-label dimensions to ELK as
  label nodes is the real fix; `gap` + `direction="DOWN"` is the workaround.
- **T13: `direction="DOWN"` is dramatically better than `RIGHT` for a labeled
  `auto` graph** - zero squished labels vs seven, canvas aspect 0.32 vs 2.71 -
  because a vertical arrow gives its label unlimited horizontal room. If a
  future primitive picks the layout engine (T16), it should probably pick the
  direction too.
- **T13: `fill="solid"` + `labelColor="white"` is unreadable.** tldraw's solid
  geo fill is a pale tint of the shape colour, not the colour itself. There is
  no way to get a dark-filled box with light text through the current prop set.
- **T13: a labeled edge that skips a container drops its label on the skipped
  container.** `checkout -> postgres` past a `Payments` frame parks `orders`
  inside it. Reordering the doc so the two containers are adjacent was the only
  fix available; same residue class as the open T6b cross-container question.

### From T14

- **An `<Edge>` pointing at a `<Group>` id emits a dangling binding.** Groups
  are addressable (frames require an explicit `id`) but emit no shape, so
  `binding:<edge>-start` can reference a `shape:<groupId>` that is not in the
  store. Nothing in `lower.ts` or `emit.ts` rejects or redirects it. Two fixes
  are available: a new lower-time diagnostic (`ir/edge-endpoint-is-group`), or
  redirecting the binding to the group's bounding descendant. Documented as a
  limitation in `docs/dsl.md` for now.
- **`Group` requiring an explicit `id` is arguably wrong.** The id names nothing
  visible and cannot be usefully referenced (see above). It was kept only
  because dropping the requirement means special-casing `assignId`'s
  "addressable elements require an id" rule, which is a bigger change than T14
  called for.
- **`applyContainerBoxSizing` never votes on `frame` children**, only `box` and
  `note`, so a group's siblings are sized as if the group were not there. That
  is the same behaviour frames already had, but it means a `Group` wrapping two
  boxes hides those boxes from their uncles' shared-width vote - a real
  behaviour change for anyone who reaches for `Group` to tidy a row.
- **`routing.ts` never treats a frame as a bowing obstacle** (`computeCandidate`
  only considers `box`/`note`), so groups change nothing there. Worth recording
  because it also means *real* frames are invisible to the router - an arrow
  will happily bow straight through a nested frame's chrome.
- **The corpus does not exercise `Group` at all.** Its three claims are pinned
  only by unit tests. Until a fixture uses one, no render has ever contained a
  group, and the `+ offsetX` path in `emit.ts` is dead in every measured
  diagram.

### From T15

- **The containment models for `star`, `trapezoid`, `hexagon`, `octagon`,
  `pentagon` and `heart` are approximations, not solved geometry.** `star` is
  tighter than a diamond and is under-sized by the diamond model; the other
  five are roomier than an ellipse and are over-sized by the ellipse model.
  They all look right in the gallery, but nothing pins them the way the exact
  four (rect / ellipse / diamond / triangle) are pinned.
- **`x-box` and `check-box` cannot hold a label cleanly at any size.** tldraw
  draws the mark through the box. The only real fixes are outside sizing:
  offset the label (`verticalAlign="start"`), or don't ship those two geos.
- **`geo` fights container box sizing.** `applyContainerBoxSizing` gives a
  `col`/`grid` container one shared width, so a single `triangle` or `star`
  child inflates every sibling. In the gallery a 5-wide grid with one triangle
  is more than twice as wide as the same grid of rectangles. Nobody has decided
  whether shared sizing should exclude, or normalise across, mixed geos.
- **`geoScale` ignores `maxW`.** An author who caps a box with `maxW` still
  gets a box wider than the cap once `k` is applied, because the label has to
  fit the outline. `maxW` is documented as a wrap hint, so this is arguably
  right, but it is undocumented and untested.
- **The arrow model uses one constant pair (0.68 / 0.24) for all four arrow
  geos.** It is exact for `arrow-up`/`arrow-down`, where the label sits in the
  shaft. For `arrow-left`/`arrow-right` tldraw's head inset is
  `min(w, h) * 0.38`, so the usable width depends on the box's own aspect - the
  fixed point still converges, but the model is not the real constraint.
- **Nothing exercises `geo` in the corpus or in `docs/renders/`.** All 20
  values are pinned by unit tests and by a scratch gallery in `/tmp`, which is
  not committed. Until a fixture carries a `geo`, no measured diagram has ever
  contained a non-rectangle box.

### From T16

- **`<Pipeline>` returns an array, which nothing else in the library does.**
  Every other component returns one `AstNode`; `Pipeline` returns
  `[frame, ...edges]`. It works because `flattenNodes` walks arrays, but it
  means a user component wrapping `<Pipeline>` must also return an array or
  splat it, and TypeScript will not warn them. Worth a line in `docs/dsl.md`
  if anyone hits it.
- **A `<Pipeline>` nested inside a `<Layers>` tier would put edges inside a
  frame.** Layout skips `kind === "edge"` children of a frame in five places in
  `stack.ts`, so it is handled - but no fixture in the corpus has ever nested an
  edge inside a frame, so that path is unexercised end to end.
- **`<Pipeline>` requires an explicit `id` on every child, and every other
  element in the language does not.** Ids are otherwise synthesised at lower
  time. The throw is a runtime `Error`, not a diagnostic with a span, so the
  author gets a stack trace instead of a pointer at the offending child.
- **`<Layers>` silently discards a tier's `layout`.** An author writing
  `<Layers><Col>...</Col></Layers>` gets a row and no warning. Same for
  `<Swimlanes>`. That is the primitive's whole point, but a diagnostic saying
  so would be kinder than silence.
- **The four new fixtures are the first corpus files with zero crossings of any
  bucket.** `sequence` and `sparse-graph` were zero-crossing but also
  near-trivial; `graph-topology` carries 11 arrows over 8 peers and still
  crosses nothing. If a future routing change needs a "did I break the easy
  cases" canary, these four are it.
- **`fill="solid"` is back in the corpus.** `pipeline-build`'s `publish` and
  `swimlanes-release`'s `notify` use it as a terminal-state highlight. T13
  dropped `fill="solid"` because it is unreadable *with* `labelColor="white"`;
  with the default label colour it reads fine. The T13 note should be narrowed
  to the pair, not the fill.

### From T16b

- **tldraw wraps horizontal arrow labels mid-word; the reserved corridor is
  about one glyph too narrow.** `text-metrics.mts` reports `persists` at
  labelW 85 in a shapeW 114 corridor - it should fit - yet the render broke it
  into `persist` + `s`. Same for `reads/writes` and `HTTPS/JSON` at their own
  corridor widths. Shortening the label does not escape it: the corridor is
  sized *from* the label, so the shortfall scales with it. T0 fixed exactly
  this class of bug for box labels by measuring per-glyph advances; arrow
  labels never got the same treatment, and tldraw appears to add padding
  inside the label box that the corridor does not account for.
- **`text-metrics.mts` agrees with the engine, not with tldraw, on arrow
  labels.** It reported every label above as fitting. Whatever budget tldraw
  uses for an arrow label is not the one the tool models, so the tool cannot
  currently catch this defect - only the PNG can.
- **Nothing prefixes ids inside a userland component.** `c4.jsx`'s components
  take an explicit `id` and pass it straight through, per the `ns` convention
  in CONTEXT.md. Reusing `Boundary` twice with the same inner ids is a
  `ir/duplicate-id`, and the component has no way to help. If domain
  vocabularies become common this is the next thing authors will hit.
- **A userland component cannot produce a diagnostic.** `c4.jsx` validates
  nothing; if it did, its only options are `throw` (a `runtime/threw` stack
  trace) or silence. `<Pipeline>` has the same problem inside the library
  (already noted under T16), but in userland there is not even a private API
  to reach for.
- **`corpus.test.ts` discovers fixtures non-recursively, which is now load-
  bearing.** `tests/corpus/lib/c4.jsx` is skipped both because it is in a
  subdirectory and because it does not end in `.tldsl.jsx`. Any future change
  to recurse into subdirectories has to keep excluding module files, or the
  corpus test will try to compile a library as a diagram.
- **`tests/corpus/` is outside eslint and dep-cruiser** (both scoped to
  `src`), so the userland module is unlinted. That is fine for a fixture, but
  it also means nothing mechanically stops a fixture-side module from
  importing out of `src/domain/`.

### From T18

- **`SKIP_ROW_GAP_FACTOR` is load-bearing for column choice, not for clearance.**
  Its only job is to give `bestGridCols` a pessimistic pre-gap so it picks a
  wider grid; `skipRowGaps` then sets the real boundary. Measured alone it makes
  things worse (17 vs 16 with nothing). The two are one mechanism in two places
  and should never be tuned independently.
- **The corridor is ~55 lines, not the ~150 the task assumed.**
  `hasSkipEdge` (20), `skipRowGaps` (30), two constants and two call sites.
  The estimate the task carried was inherited from the B25/B32/B33 write-ups.
- **Only `release-pipeline` exercises the corridor at all.** Every other corpus
  file is unchanged byte-for-byte with it removed. One fixture is deciding
  whether ~55 lines stay - the same corpus-of-two thinness T17 found for
  wrap order.
- **`SKIP_ROW_GAP_MAX` is reached on the first two row boundaries of
  `release-pipeline`** (gap 40 -> 160). Nothing has ever measured whether the
  cap is in the right place; it just happens to bind there.

### From T17

- **`wide-fanout` is a single row now.** 3722 x 204, aspect 18.25, after T6's
  fan collapse. Every wrap-order hypothesis in the ledger that was rejected on
  `wide-fanout`'s crossing count was measured against a four-row grid that no
  longer exists. Anything else in `docs/layout-hypotheses.md` that died on that
  file is worth re-reading with this in mind.
- **Only two corpus files can see an auto-grid wrap-order change at all.**
  `long-labels` and `release-pipeline`. `deep-nesting` and `hexagonal` have one
  top-level child; `wide-fanout` no longer wraps. Any future wrap-order work has
  a corpus of two, which is thin enough that a new multi-row fixture is probably
  a prerequisite.
- **A permutation of uniform columns is edge-length-invariant.** `long-labels`
  mirrors rows 1 and 3 and lands on exactly 4877 both ways. `total edge length`
  is therefore blind to wrap order whenever the columns are equal width - worth
  knowing before using it as a proxy metric.
- **Serpentine reverses reading order, and nothing measures that.**
  `source-order violations` is already `min` over both reading orders (B21a), so
  it cannot see it either. For a diagram whose boxes are prose, a backwards row
  is a real cost with no counter in any tool.
- **`release-pipeline` still has two edge-edge crossings** (`Build image -> Push
  to registry` against `Security scan -> Integration tests`, and one lower
  down). Serpentine turned them from long diagonals into a short X. Cheaper to
  look at than before, but not gone.

### From T19

- **The viewer is already fully editable and silently discards edits.**
  `<Tldraw onMount={handleMount} />` (`src/viewer/app.tsx:43`) sets no
  `readonly` prop, and nothing listens to the store. A user can drag a box
  today; the next `loadSnapshot` from a recompile, or a browser reload, throws
  it away with no trace. That is the exact gap T20 closes, but until it lands
  the honest options are a readonly viewer or a note in the README. Left alone
  because changing it is T20's call, not T19's.
- **CONTEXT.md will need three edits when T20 lands.** "Round-trip from canvas
  back to DSL" is listed under both "Phase 2 (later)" and "Out of scope"; the
  transport section says "Websocket is reserved for phase 2 if round-trip needs
  bidirectional", which D4 overrules in favour of a `PUT` route on the existing
  dev server. None touched here - the doc says "no code", and CONTEXT.md
  describes code that does not exist yet.
- **ADR-14 is unwritten on purpose.** `docs/round-trip.md` names itself as the
  proposal; the `docs/decisions.md` entry should land with the implementation in
  T20 so it records what was built, not what was planned.
- **`docs/patches/` is dead weight.** Two git-format patches
  (`b13-elbow-side-anchors.patch`, `b24-elbow-side-anchors.patch`) referenced
  only from `docs/layout-hypotheses.md`, which is itself marked historical and
  describes geometry that no longer exists after `2484ffa`. Deletable whenever
  someone wants the tree smaller.
- **`examples/kernel.tldsl.jsx` is still untracked.** Written during T16b,
  never staged. Either it is a corpus fixture and belongs in git, or it is
  scratch and belongs deleted.

### From T20

- **`tldsl overlay show` and `tldsl reset` still do not exist.** D4 names both as
  part of the design - `show` to list entries and whether they resolve, `reset`
  (with a `.bak`) as the escape hatch from an overlay that is masking a JSX edit.
  T20's acceptance did not ask for them, so they were not built. Until they land
  the only way out of a bad overlay is deleting the JSON by hand, and the only
  way to read pending edits is opening it.
- **Nothing tells the user the overlay file exists.** `docs/dsl.md` and the
  README do not mention it, and `.gitignore` does not list it. The first time
  someone drags a box they get an unexplained `x.tldsl.overlay.json` beside their
  source and, in a repo, an unexplained untracked file. Whether it *should* be
  gitignored is a real question - it is hand-done work, so probably not - but the
  silence is not a decision, it is an omission.
- **The viewer PUTs its entire document store on every debounced edit.** Fine at
  corpus size over localhost, and it is what keeps all diff logic in `domain/`
  where it is testable. The ceiling is real for a large diagram on a slow
  machine; the fix, if it ever bites, is diffing in the viewer against the last
  server scene and PUTting entries, which moves the logic across the layer
  boundary into code that can only import `contracts/`.
- **`diffScenes` cannot represent two things.** A prop removed from a record
  (tldraw does not do this, so it is theoretical) and a change to a top-level
  field outside placement and `RESTYLE_RECORD_FIELDS` - `meta` and `type`. A
  canvas gesture that writes shape `meta` would round-trip silently wrong rather
  than loudly. Nothing in tldraw's UI writes `meta` today.
- **`docs/round-trip.md` called this ADR-14; 14 was already taken** by "JSX as
  syntax - no React, no reconciler". The entry landed as **ADR-22** and the
  reference in `round-trip.md` was corrected in place. Worth a glance at whether
  any other doc guesses an ADR number it did not check.
- **`examples/` is still untracked**, as it has been since T16b. Not mine to
  commit.

### From T21

- **The `moved` mutation usually lands on an arrow, not a box.**
  `buildMutatedScene` picks the first shape with numeric `props.w`/`props.h`,
  and on most fixtures that is an edge - so on `checkout-services` a
  `moved`-dropping apply diverges in exactly one record, `shape:edge`. The
  harness still goes red, but the move leg would bite harder (and read more like
  a real canvas drag) if the picker preferred a geo shape and fell back to an
  arrow.
- **The harness copies the fixture's whole directory, not the fixture.**
  `c4-context.tldsl.jsx` imports `./lib/c4.jsx` and esbuild resolves that
  against the entry's real directory, so a single-file copy breaks it. The
  harness does a recursive `cp` of `tests/corpus/` per fixture - 17 copies of a
  small tree, harmless today. The honest fix is copying the entry plus its
  resolved import graph, which is a thing the compiler already knows (chokidar
  is handed exactly that set) and does not expose.
- **`describeDivergence` only walks `store`.** A divergence in `schema` fails
  the equality gate but is reported as "0 records", which would be a baffling
  message. Nothing produces one today because `applyOverlay` passes `schema`
  through untouched.
- **Nothing proves `runServe` and `applyOverlay` are the same apply.** The
  reload leg exercises whatever `watchAndServe` calls; the apply leg exercises
  what the harness was handed. They agree today because they are literally the
  same function, but if `serve` ever grew its own apply path the harness would
  not notice the two drifting - it would just report the reload leg green and
  the apply leg green independently.
- **`examples/` is *still* untracked**, unchanged since T16b. Not mine to
  commit.

### From T22

- **Z-order has no DSL prop, and that is the biggest gap between the test and a
  real canvas.** `emit/` gives every shape `index: "a1"` (`contracts/builders.ts`
  defaults it and nothing overrides), so hand-built overlay records built with
  `boxShape`/`noteShape` verify cleanly. A shape actually drawn in tldraw carries
  a distinct fractional index (`a2`, `a2V`, ...), which no JSX attribute can pin,
  so absorb would refuse it. Either the DSL grows a z-order prop or absorb has to
  be allowed to leave a residual `moved: { index }` entry behind.
- **The record fields absorb cannot express**, each of which makes it refuse
  rather than silently drop: `rotation`, `opacity`, `isLocked`, `meta`, `url`,
  `scale`, `index`, and any `parentId` other than the page - there is no
  frame-nesting absorption, so a shape the user dragged into a frame cannot be
  absorbed at all.
- **Absorb does not touch `moved`/`restyled`/`relabelled`/`deleted`.** That is
  the "nudge, then absorb" use case from the Phase 7 pitch, and it is entirely
  unbuilt: those entries just stay in the overlay forever. It needs attribute
  splicing into *existing* elements, which the per-element and per-attribute
  spans in `domain/parser/ast.ts` already make possible - the spans are carried
  through the IR and nothing consumes them for this yet.
- **`readOverlay` collapses "missing" and "malformed" into one `null`.** A
  corrupt overlay is reported as `nothing to absorb: no overlay at <path>` and
  exits 0, which is a confusing thing to read while staring at a file that
  exists. Three lines to separate.
- **Codegen emits every mapped prop, not only the non-default ones.** Correct
  and free of a default table that could drift from `builders.ts`, but the
  absorbed line is 200 characters of `dash="draw" size="m" font="draw"` that a
  human has to read past. A default-elision pass would need the DSL defaults and
  the tldraw defaults to be provably the same set.
- **`diffIds` only walks `store`**, the same limitation already logged for the
  harness's `describeDivergence`: a divergence in `schema` would fail the
  equality gate and be reported as an empty record list.
- **`examples/` is *still* untracked**, unchanged since T16b. Not mine to commit.

- **An attached note can be drawn on top of a sibling box.** T24's agent-A test
  diagram parks a two-line `<Note on="rollback-trigger">` directly over the
  "Revert to previous build" box inside the same frame. T7 places an attached
  note 24px off its target "on whichever side is clearest", but clearest is
  evidently scored against the target alone, not against the target's siblings.
  The note is out of layout by design, so nothing pushes back, and long note
  text makes it near-certain. The cheap fix is to score candidate sides by
  overlap against every shape, not just the anchor.
- **Arrow labels collide with each other and with box labels.** Same render:
  "rejected", "regression detected" and "tests fail" pile up around the approval
  diamond, and "Release manager approval" is overprinted by one of them. T12
  puts an arrow label at the arrow midpoint with no collision awareness, so
  three edges converging on one target put three labels in nearly one place.
- **The plugin root is now the repo root** (`.claude-plugin/plugin.json`,
  `skills/`). T25 and T26 add `hooks/hooks.json` and `commands/` beside them. If
  that ever sits badly next to `src/` and `docs/`, moving the lot under
  `plugin/` is a two-file change - but nothing forces it today.
- **Nothing tests the skill's examples.** The two JSX snippets inside SKILL.md
  were compiled by hand this wake, and they will rot silently. A small test that
  extracts fenced `jsx` blocks from the skill and runs them through the corpus
  compile path would pin them.

### From T25

- **The overlay hook cries wolf after every render.** `hooks/on-prompt.sh`
  counts `.entries` in `*.tldsl.overlay.json`; one `tldsl render` against a warm
  serve was enough to make it report 8 unabsorbed changes on an untouched
  `deep-nesting`. This is the T23 index-only-PUT defect surfacing where a user
  will actually see it, every turn, and it makes the third hook worse than
  silence until it is fixed. Two ways out: stop the viewer PUTting an
  index-only overlay, or give the CLI a `tldsl overlay show` that reports only
  entries a human would call a change. The second is on Phase 8's own
  missing-commands table already.
- **Rendering still litters the working tree.** Same cause: the warm-serve test
  in this wake left `tests/corpus/deep-nesting.tldsl.overlay.json` behind and I
  deleted it before committing, exactly as T23 did. Every wake that renders pays
  this tax by hand.
- **`async: true` may be able to inject context after all.** The Phase 8
  mechanics block states that async hooks fire and forget and cannot inject, and
  that is what forced the synchronous-render design. A docs re-read this wake
  said the opposite - that async hooks use the same output JSON, including
  `additionalContext`. I did not act on it: the synchronous render measures
  0.26s cold and 1.48s warm, so there is nothing to buy. But the claim in the
  plan should not be trusted as settled.
- **Nothing in `npm run check` covers the warm-serve branch of `on-edit.sh`.**
  The new e2e tests pin silence, diagnostics and the cold hint; the render
  branch needs a live `serve` and chromium, so it was verified by hand this wake
  (byte-identical PNG) and is unpinned thereafter.
- **`hooks/on-prompt.sh` word-splits `find` output**, so an overlay under a path
  containing a space is skipped, and its `find` is unbounded below `cwd`. It ran
  in 0.25s over this repo; a monorepo could be slower, against a 15s timeout.
- **The plugin is now three of the four pieces** - `skills/`, `hooks/`,
  `.claude-plugin/`. Only `commands/` (T26) is missing, and T26 is the one task
  that needs core commands that do not exist yet (`overlay show`, `verify`).
- **`/tldsl:sync` step 3 is unpinned by any test.** The e2e drives the
  deterministic path (`overlay show` -> `absorb` -> `verify`), which is what the
  acceptance asked for. The hand-rewrite loop - agent edits JSX until `verify`
  goes green on a `moved`/`restyled`/`relabelled` entry - was exercised by hand
  this wake but nothing in `npm run check` covers it, and nothing checks the
  command's prose still matches the CLI's output strings.
- **`absorb` and `sync` overlap and nobody says which to reach for.** Both are
  "fold canvas edits into the source"; `absorb` is the subset a program can do.
  `skills/tldsl/SKILL.md` mentions neither, so an agent with the skill loaded
  has no idea the round-trip exists. The workflow section stops at `render`.
- **`tldsl verify` fails on the index-only overlay the viewer PUTs back.** T23's
  defect (booting the viewer writes an overlay of `moved: { index }` entries
  that change nothing a human cares about) now has a second victim: those
  entries genuinely change the scene's `index` fields, so `verify` reports them
  as outstanding and `/tldsl:sync` would ask the agent to encode a z-order it
  never chose. `on-prompt.sh` already over-reports the same thing.
- **Nothing keeps `commands/sync.md` honest about the CLI.** Same gap as the
  SKILL.md examples: the command names five subcommands and quotes their
  behaviour, and a rename or an output-string change breaks it silently.
- **`layout="auto"` looks unwired, not just badly tuned.** The ELK adapter
  builds the right graph and passes `elk.spacing.nodeNode: String(req.gap)`, and
  the CLI wires `ElkLayoutAdapter` on every command - yet gap, direction and
  topology are all no-ops at render time (T29/D7), and the 20px spacing is
  exactly ELK's default, i.e. what you get from `String(undefined)`. Worth
  checking whether the frame's props reach `AutoPlaceRequest` at all before
  anyone tunes ELK options. `src/infra/layout-elk/elk-layout.test.ts` presumably
  passes a `req` built by hand, so a break in the plumbing between `stack.ts`
  and the adapter would not show up there.
- **The auto placer's output looks like the grid flow layout.** Four unconnected
  or chained nodes land in a 2x2 block at the same aspect target the row/col/
  grid path uses. If auto is silently falling through to `bestGridCols`, then
  every `<Graph>` in the corpus has been a grid all along and no measurement
  ever noticed, because no fixture has a topology a grid gets wrong.
- **No diagnostic fires for an edge that draws nothing.** `from === to` (D5)
  joins D1 and D3 on the list of things `check` is silent about. Three separate
  authoring wakes have now shipped a diagram that validates clean and omits
  information; a "this edge cannot be rendered" class of diagnostic would have
  caught all three at author time.
- **The phantom overlay T28 could not reproduce, reproduces.** Rendering
  `examples/repro/d8-auto-edges-cross-nodes.tldsl.jsx` wrote
  `...tldsl.overlay.json` containing one `moved: { parentId: "shape:g", index }`
  entry per arrow - tldraw reparents an arrow into the frame that holds both its
  endpoints, and the absorb path records that as a user edit. It needs a frame
  and arrows whose endpoints are both inside it, which is why T28's two-lane
  diagram only sometimes triggered it. Deleted by hand this wake so it would not
  be committed.
- **An edge may point at a frame id, and it is the right way to draw a tier.**
  `<Edge from="app-tier" to="cache" />` resolves, anchors on the frame's
  boundary and reads correctly - it says "this whole tier talks to that", which
  is what a layered diagram means and what three arrows from three
  interchangeable app servers would have said in nine. The skill never mentions
  it: it says only that a `<Group>` may not be an endpoint, leaving the reader
  to infer that frames may. Worth a sentence in `skills/tldsl/SKILL.md` and, if
  it is meant to be supported, a fixture.
- **`gap` below some floor is ignored on a row.** In the D9 probes `gap` unset,
  `gap="96"` and `gap="120"` produced pixel-identical renders; 144 differed and
  160 differed again. Either the label clearance is taking a max with the
  author's gap (likely, given D8) or small gaps are being snapped. If it is the
  max, an author who sets a *deliberately tight* gap gets silently overridden
  and has no way to see it.
- **A layered diagram has no primitive that owns the band.** `<Layers>` and
  `<Swimlanes>` are documented as "a column of tiers", but a tier in every real
  layered diagram is a full-width band. D10 is the symptom; the underlying
  question is whether those two components should stretch their children by
  definition rather than needing an `align` value that does not exist.

- **T31: a hub topology is 17 hand-written edges.** Seven services and four
  topics needed one `<Edge>` per publish and one per subscribe, and the edge
  list is longer than the shape list for the third diagram running. An edge form
  that takes a list on one side - "these four ids publish to this one" - would
  collapse the whole pub/sub block and would also give the layout something to
  fan deliberately instead of eight independent midpoints. Not a defect; the
  diagram is expressible.
- **T31: two measurement tools, neither in the documented workflow.**
  `layout-report`'s `overlapping shape pairs` ignores label boxes;
  `arrow-truth`'s label check only compares labels against shapes, never against
  other labels. Between them they saw 4 of the 5 things wrong with
  `event-driven` and reported none of them to the author, because the skill's
  workflow section names only `check`, `serve` and `render`. D15 logs the
  `check` half; the other half is that the tools that do know are dev tools in
  `tools/`.
- **T31: `<Sticky>` reports itself as `<note>` in diagnostics.** Same shape as
  D12 - the error names an element that does not appear in the source file.
  Folded into D16 rather than given a number of its own, but if D12 gets a fix
  that maps IR node kinds back to the authored component name, this is the
  second case it should cover.
- **T32: `gap` on a row is advisory, and the override is invisible.** The C4
  boundary is written `gap="64"` and the rendered gaps between its five
  containers are 394, 393, 394 and 393px - six times what was asked - because
  the row widens until each adjacent pair's edge label fits (the mechanism D9
  calls `labelClearanceGap`). The behaviour is right and the diagram would be
  worse without it, but a number the author wrote is silently multiplied by six
  and nothing says so. Related to the D9/D11 asymmetry, and probably the same
  code: the same pass that over-pays for adjacent labels pays nothing for
  skipping ones.
- **T32: `maxW` sizes each box independently, so C4's equal containers are not
  equal.** With `maxW="240"` on all five, the rendered widths are 236, 215, 227,
  236 and 296 - each box shrinks to its own longest wrapped line. C4 draws
  containers as a uniform grid of identical boxes and the raggedness reads as
  accidental. This is D10 one level down: D10 is sibling *frames* sized to their
  contents, this is sibling *boxes*, and a `minW`, or an `align="stretch"` that
  worked, would answer both.
- **T32: nothing in the corpus had ever used a multiline label before this
  wake.** `label={"a\nb"}` works, and the whole of C4's element notation
  depends on it. Every diagram in `examples/` before T32 puts the type and the
  description in a `<Note>` or leaves them out. If the skill gains one example
  from this phase, it should be a three-line box label - it is the single
  highest-value thing found in T32 and D19 only logs that it is undocumented.
