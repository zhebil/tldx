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
  wrong but because their evidence was. See T10 and T11.

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
| `demo` | `use1-api → use1-db` | Worker pool, Redis cache |
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

**Fix the placement (T6-T8).** Some crossings *are* the tool's placement
choice. `wide-fanout` puts eighteen targets of a single source into
reading-order grid rows, so one node fires eighteen chords across the whole
canvas. No amount of curvature rescues that; a fan wants to be laid out as a
fan. Notes and whitespace are the same category - nothing is crossing, the
arrangement is just wrong.

**Fix the corpus (T9), but not to win.** The current corpus is stress fixtures
being used as taste samples. `wide-fanout` is eighteen identical `Worker N`
boxes; `long-labels` is six paragraph-length sentences. Nobody draws those.
They are excellent for measuring - they exaggerate exactly the defects we care
about - and useless for answering "does this look good". Keep them as gates.
Add diagrams that look like what people actually draw, and use *those* to judge
whether output is good.

**Never edit an existing corpus fixture to make a task pass.** That is the one
change that silently invalidates every measurement downstream of it. Adding new
fixtures is fine and is T9; changing old ones is not.

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
  seven corpus files plus `demo.tldsl.jsx`. Write `docs/baseline.md`: one table
  of per-file crossing counts, canvas dimensions, and shape counts, plus the
  commit it was taken at. Save the PNGs to `docs/renders/`.
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
  **fan** (the source has out-degree ≥ 4 within its container);
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
  node's out-degree within a container is ≥ 4 and its targets are otherwise
  unconnected leaves, place those targets as a block adjacent to the source -
  a column beside it, or rows that start at its edge - rather than in flow
  order among unrelated nodes.
  **Acceptance:** `wide-fanout` crossings down by at least half against the
  post-T5 number, and no other file regresses.

- [ ] **T7. Note placement.**
  A tldraw sticky is 200px wide and that is a tldraw fact, not something layout
  can override - stop trying to make notes wide. The fixable part is *where*
  they land. Right now a note is a peer in the main flow, so `demo`'s note sits
  alone in a large empty region below the diagram and `long-labels` gets two
  tall columns in dead space.
  Place a note adjacent to the content it follows in source order, or in a
  gutter column beside the diagram, rather than as a flow participant.
  **Acceptance:** no note's bounding box is further than 120px from the
  bounding box of the shape that precedes it in source order, and total canvas
  area drops on `demo` and `long-labels`.

- [ ] **T8. Reclaim dead whitespace.**
  Frames carry large empty margins - `hexagonal`'s outer frame has roughly
  110px of empty canvas above its first child and 50px below its last. Measure
  what tldraw's frame chrome actually needs (a title is 14px tall by
  `text-metrics`; `FRAME_TITLE_PX` is set to 32 and `FRAME_PAD_INNER` to 32)
  and set the constants from the measurement.
  **Acceptance:** canvas area drops on at least four files, with zero new
  overlaps and no label or title clipped in the renders.

### Phase 3 - a corpus worth judging

- [ ] **T9. Add three realistic diagrams.**
  Keep every existing fixture; they are the gates. Add three that resemble what
  someone would actually draw, each under 40 shapes:
  a service architecture with 3-4 containers and traffic between them;
  a request lifecycle as a single flow with two branches;
  a state machine with a cycle in it (nothing in the corpus has a cycle, and a
  cycle is the case every one of these routing rules is least prepared for).
  These become the files to look at when asking "is this good". The stress
  fixtures stay the files to measure.
  **Acceptance:** all three compile with zero diagnostics, render, and are added
  to `docs/baseline.md`.

### Phase 4 - re-examine what was decided on stale geometry

- [ ] **T10. Re-test serpentine rows (was B21b).**
  A grid that wraps in reading order makes the last node of one row and the
  first of the next as far apart as possible, which is where `long-labels`'
  long diagonal comes from. Serpentine (alternating row direction) fixes that
  by construction. It was rejected on an arrow-crossing gate measured against
  boxes 40% too narrow.
  **Acceptance:** re-measure against the post-T9 baseline. Keep if crossings
  drop and nothing regresses; if it fails again, write down the number so it is
  not tried a third time.

- [ ] **T11. Re-examine the row-gap corridor (B25/B32/B33).**
  Three kept changes widen grid row gaps in proportion to edges crossing them.
  They were tuned against stale geometry, and if T3-T5 route those edges around
  instead of through, the corridor is now paying for clearance nobody needs.
  Try removing it entirely and measure.
  **Acceptance:** if crossings do not rise when it is removed, remove it -
  that is ~150 lines and three layers of special case bought back. If crossings
  do rise, record by how much and keep it.

---

## Open questions for the human

Do not act on these. They are the discussion surface; they get resolved into
tasks above by the human, not by the loop.

1. **`BOX_MAX_W = 320` is arbitrary.** It is the cap that turns a
   paragraph-length label into a block instead of a 1300px ribbon. At 320,
   `long-labels`' sentences wrap to about five lines. Wider means fewer lines
   and a wider canvas. Nobody has looked at 480 or 560.

2. **Should `layout="auto"` (ELK) come back for graph-shaped input?** ELK
   solves same-axis skips by construction - it assigns layers and routes
   between them. It was set aside because it scrambles source order, which
   matters for nested containers. But `sparse-graph` and a state machine are
   genuinely graph-shaped, and source order means little there. The cost is two
   layout engines to maintain.

3. **Are stickies the right shape for notes at all?** 200px fixed width makes
   any real sentence a twenty-line column. A geo shape with a warm fill would
   look like a note and size like a box. This changes what `<Note>` emits.

4. **Should `BOX_MIN_H` exist?** It is 60, but the height formula is
   `lines * 30 + 32`, which is 62 for a single line, so the minimum never binds.
   Either it is dead and should go, or the intent was a taller minimum.

---

## Discovered work

Append here. Do not act on these during the wake that finds them; they get
promoted into the task list by the human.

- Anchor syntax `id.anchor` collides with dotted namespaced ids, so a component
  cannot prefix its children with `${ns}.` - filed as a bd bug (P1). Blocks any
  task that wants author-specified anchors.
- `flow()` edges carry no source span; diagnostics report them at `.:0:0`
  (bd bug, P2).
