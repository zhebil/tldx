# Layout hypotheses ledger

Phase B's written record. One entry per wake, appended, never edited after the
fact. Each entry carries the hypothesis, what was built, the objective gate
results, the blind per-file judge verdicts, and KEPT or REVERTED.

A REVERTED hypothesis is struck through in the backlog in `docs/ralph-plan.md`
so it is never retried blind. Read this file before proposing a new hypothesis:
it is the only place that records what has already failed and why.

---

## B1 — cross-axis `align` on `row`/`col`, default `center` — **KEPT**

_(wake 12)_

**Hypothesis.** Flow containers anchor every child to the cross-axis origin,
so a `col` is flush-left and a `row` is flush-top regardless of how ragged the
children are. Give containers an `align` attribute (`start`/`center`/`end`) and
flip the implicit default from `start` to `center`.

The default flip is the part actually under test. `align="start"` alone is
invisible to the corpus - the fixtures are frozen, so the only lever that
reaches the bench is the default. Judged as one change accordingly.

**Diff.** +139 / -4 across six files. `Align`/`ALIGNS`/`isAlign`/`DEFAULT_ALIGN`
in `domain/layout/defaults.ts`; `align?` on `IRDoc` and `IRFrame`; `readAlign()`
in `lower.ts` mirroring `readLayoutMode()` (bad value → `ir/bad-align`, not a
throw) plus `align` in the `doc`/`frame` prop allowlists; `crossAxisPos()` in
`stack.ts` threaded through `layoutContainer` → `computeFlowPositions`. `grid`,
`auto` and `free` untouched. 7 new tests. No existing assertion moved: every
pre-existing row/col case uses equal-width children, so the centred offset is 0.

**Objective gates — all pass.**

| file | canvas (champ → cand) | area | overlaps | source-order | total edge len |
|---|---|---|---|---|---|
| deep-nesting | 560x776 → 560x776 | 1.00x | 0 → 0 | 0 → 0 | 2155 → 2128 |
| hexagonal | 1198x636 → 1198x636 | 1.00x | 0 → 0 | 0 → 0 | 6139 → 5634 |
| long-labels | 948x1200 → 948x1200 | 1.00x | 0 → 0 | 0 → 0 | 1402 → 1400 |
| sequence | 282x1360 → 282x1360 | 1.00x | 0 → 0 | 0 → 0 | 1311 → 1300 |
| sparse-graph | 680x460 → 680x460 | 1.00x | 0 → 0 | 0 → 0 | 1440 → 1440 |
| wide-fanout | 138x2560 → 138x2560 | 1.00x | 0 → 0 | 0 → 0 | 21101 → 21100 |

`npm run check` green (36 files, 281 tests). Canvas is identical everywhere:
the widest child defines the extent either way, so centring redistributes slack
without consuming any.

**Blind judgement.** Five files. `sparse-graph` was **not** sent to a judge -
its two reports are byte-identical (no container in it has ragged children), so
the comparison carries no information and a forced pick would have injected a
coin flip into a strict-majority rule. Recorded as a structural tie.

| file | A was | B was | winner | verdict |
|---|---|---|---|---|
| deep-nesting | champion | candidate | B | candidate |
| hexagonal | candidate | champion | A | candidate |
| long-labels | champion | candidate | B | candidate |
| sequence | candidate | champion | A | candidate |
| wide-fanout | candidate | champion | A | candidate |
| sparse-graph | — | — | — | tie (identical) |

Reasoning, verbatim:

- **deep-nesting** — "B centers the main Gateway→Router→Handler→Parser chain
  into a single vertical spine with short, near-vertical edges, while A crams
  every box against the left edge and sends long dotted diagonals sweeping
  across large empty space, leaving each nested frame lopsided."
- **hexagonal** — "A vertically centers the shorter frames against the tall
  port/adapter columns, giving the symmetric, core-balanced composition a
  hexagonal diagram calls for and shorter edges (5634 vs 6139), while B
  top-aligns everything and leaves a lopsided dead zone in the lower left."
- **long-labels** — "Centering the near-equal-width boxes puts every connector
  on one straight vertical spine and places the notes balanced under the
  column, so the flow reads as a single clean line, whereas A's flush-left
  stack leaves the edges wandering slightly and the notes stranded in the
  far-left corner."
- **sequence** — "A centers every box on a single plumb-straight connector
  spine, so the flow reads as one unbroken vertical line, while B's left-flush
  boxes leave a ragged right edge and a zigzagging connector that the eye has
  to chase between steps."
- **wide-fanout** — "A centers every box on the hub's axis so all 25 edges
  collapse into one clean vertical spine (its 4-9px left-edge raggedness is
  imperceptible), while B's left-alignment makes the edges splay into a
  wandering scatter of slanted lines down the whole column."

**Verdict: 5 candidate, 0 champion, 1 tie → KEPT.** `docs/layout-champion.md`
regenerated from the candidate.

Recurring theme across all five: centring turns a flow into a *spine*, and
edges bound to shape centres then run straight along it. That is the mechanism,
and it predicts B4 (bind edges to sides) interacts with this - worth
re-measuring B4 against the new champion rather than the old evidence.

---

## B2 — wrapped, per-line box label measurement — **REVERTED**

_(wake 13)_

**Hypothesis.** `estimatedBoxSize` measures a label as one unwrapped line
(`len * 9 + 48`) and pins height at 60, so a 95-character label becomes a
948px-wide, 60px-tall box. Wrap the label at a maximum width, size the box off
the longest wrapped line, and grow the height per line.

**Diff.** +25 / -3, one file. `BOX_MAX_W = 320` and a private greedy
`wrapLabel(text, contentW)` in `domain/layout/defaults.ts`; `estimatedBoxSize`
now takes `w` from the longest line and `h` from the line count. A word longer
than the content width is deliberately not broken, so such a box still
overflows the cap. Plus a new `domain/layout/defaults.test.ts` (3 cases: short
label unchanged at 120x60, 13-word label wraps to 3 lines under the cap, single
50-char word left unbroken). Nothing outside those two files moved - every
pre-existing hardcoded size in the suite uses a label short enough to stay on
one line.

**Objective gates — all pass.**

| file | canvas (champ → cand) | area | overlaps | source-order | crossings | total edge len |
|---|---|---|---|---|---|---|
| deep-nesting | 560x776 → 560x776 | 1.00x | 0 → 0 | 0 → 0 | 0 → 0 | 2128 → 2128 |
| hexagonal | 1198x636 → 1198x636 | 1.00x | 0 → 0 | 0 → 0 | 2 → 2 | 5634 → 5634 |
| long-labels | 948x1200 → 318x1880 | 0.53x | 0 → 0 | 0 → 0 | 0 → **2** | 1400 → **2352** |
| sequence | 282x1360 → 282x1360 | 1.00x | 0 → 0 | 0 → 0 | 0 → 0 | 1300 → 1300 |
| sparse-graph | 680x460 → 680x460 | 1.00x | 0 → 0 | 0 → 0 | 0 → 0 | 1440 → 1440 |
| wide-fanout | 138x2560 → 138x2560 | 1.00x | 0 → 0 | 0 → 0 | 0 → 0 | 21100 → 21100 |

`npm run check` green (37 files, 284 tests). No gate rejects the candidate -
canvas area on the only affected file *shrank* to 0.53x. But two non-gate
metrics moved the wrong way on that same file: edge crossings 0 → 2 and total
edge length 1400 → 2352 (+68%), because taller boxes push the column from
1200px to 1880px and the notes now sit far below the nodes they annotate.

**Blind judgement.** One file. Five of six corpus files produce
byte-identical reports under both engines - every label outside `long-labels`
is short enough that wrapping never triggers - so they were recorded as
structural ties and not sent to a judge, per the B1 precedent.

| file | A was | B was | winner | verdict |
|---|---|---|---|---|
| long-labels | candidate | champion | B | champion |
| deep-nesting, hexagonal, sequence, sparse-graph, wide-fanout | — | — | — | tie (identical) |

Reasoning, verbatim:

- **long-labels** — "B keeps every long label on one legible line with zero
  edge crossings and a sane 0.79 aspect ratio, while A squeezes everything into
  a 318px-wide, 1880px-tall strip that wraps labels, crosses edges twice, and
  forces awkward scrolling."

**Verdict: 0 candidate, 1 champion, 5 ties → REVERTED.** Champion unchanged;
`docs/layout-champion.md` is still the B1 baseline.

What this rules out is the *parameter*, not the mechanism. A 320px cap turns a
column of long-label boxes into a ribbon - it trades a too-wide canvas for a
too-tall one, and the aspect ratio gets worse (0.79 → 0.17), not better. The
judge's objection was entirely about the resulting canvas shape, never about
wrapping as such. Any retry must choose the wrap width as a function of the
document's target shape rather than as a constant, which makes it a variant of
B7 (aspect-ratio targeting) rather than a standalone text-metrics change. Filed
as B11.

**Confound worth knowing.** `tools/layout-report.mts` renders labels unwrapped
in its ASCII view, so a wrapped box shows its full label spilling past its own
border. The judge saw the correct geometry table and cited the correct numbers,
so this did not decide the verdict here, but it will understate any future
wrapping hypothesis.

---

## B3 — default arrow `kind: "elbow"` instead of `"arc"` — **REVERTED**

_(wake 14)_

**Hypothesis.** Curved arrows read as amateur on architecture diagrams; tldraw
supports orthogonal `kind: "elbow"` routing, so make it the default.

The backlog entry's premise was wrong on one point: `builders.ts` does not
"never set `kind`" - it explicitly sets `kind: "arc"`, and already carries
`elbowMidPoint: 0.5` in the same prop bag. The change was a one-token flip, not
an addition.

**Diff.** +4 / -3 across three files. `kind: "arc"` → `"elbow"` in
`arrowShape()` (`contracts/builders.ts`), the same key pinned in the existing
`arrowShape` case in `builders.test.ts`, and two lines of the `emit` auth-flow
snapshot regenerated. Nothing else moved. No layout code touched at all -
tldraw computes the route, our engine does not.

**Objective gates — all pass, and all uninformative.**

`npm run check` green (36 files, 281 tests). Every corpus file's geometry report
is **byte-identical** between champion and candidate, so canvas, overlaps,
source-order violations and edge length are unchanged by construction:

| file | canvas | area | overlaps | source-order | total edge len |
|---|---|---|---|---|---|
| deep-nesting | 560x776 | 1.00x | 0 → 0 | 0 → 0 | 2128 → 2128 |
| hexagonal | 1198x636 | 1.00x | 0 → 0 | 0 → 0 | 5634 → 5634 |
| long-labels | 948x1200 | 1.00x | 0 → 0 | 0 → 0 | 1400 → 1400 |
| sequence | 282x1360 | 1.00x | 0 → 0 | 0 → 0 | 1300 → 1300 |
| sparse-graph | 680x460 | 1.00x | 0 → 0 | 0 → 0 | 1440 → 1440 |
| wide-fanout | 138x2560 | 1.00x | 0 → 0 | 0 → 0 | 21100 → 21100 |

This is the first hypothesis the geometry report is **structurally blind to**.
Under the pre-wake-14 protocol it would have been six ties and an automatic
revert with nothing learned. All six rendered PNGs differ, so `screenshot.mts`
is what made this wake mean anything.

**Blind judgement.** Six files, six PNG pairs, A/B randomised per file, judges
told the render outranks the report and to ignore the tldraw editor chrome.

| file | A was | B was | winner | verdict |
|---|---|---|---|---|
| deep-nesting | champion | candidate | A | champion |
| hexagonal | champion | candidate | A | champion |
| long-labels | champion | candidate | A | tie (see below) |
| sequence | candidate | champion | A | tie (see below) |
| sparse-graph | champion | candidate | A | tie (see below) |
| wide-fanout | candidate | champion | A | candidate |

Three judges volunteered, unprompted, that their pair was visually
indistinguishable and that they were picking by forced-choice tiebreak. Those
are recorded as ties, not wins - counting a self-declared coin flip as evidence
would have injected noise in whichever direction the randomisation happened to
land. The rule was applied in both directions: `sequence`'s "A" was the
candidate and is not counted for it either.

Judge reasoning, condensed:

- **deep-nesting** (champion): the candidate "collapses several edges into one
  overlapping vertical line through the centers of Config, Router, Metrics,
  Handler, Validator and Normalizer", routes one edge horizontally through the
  Normalizer box, and leaves clipped arrow stubs dangling below two boxes.
- **hexagonal** (champion): the candidate's "orthogonal routing collapses into
  overlapping vertical trunks that cut straight through box labels".
- **wide-fanout** (candidate): otherwise pixel-identical, but the champion
  loses the arrowheads on the two segments leaving each hub while the candidate
  draws them.

**Verdict: REVERTED.** 1 candidate / 2 champion / 3 ties. Champion doc
unchanged (it was already byte-identical to the tree, and the candidate did not
move a single number in it).

**Why it lost, and what it costs to fix.** Not the mechanism. Elbow routing
visibly *helped* where it had room - `hexagonal`'s seven-way fan out of
`usecases` becomes seven parallel orthogonal runs instead of seven diverging
diagonals. It lost because `arrowBinding()` anchors every terminal at
`normalizedAnchor: {x: 0.5, y: 0.5}` with `isPrecise: false`, i.e. the shape's
**centre**. An arc leaving a centre is a curve that tldraw clips at the box
boundary, so centre-binding is invisible. An elbow leaving a centre is a
straight orthogonal segment that is drawn *through* the source box, through the
target box, and through anything stacked between them. Every defect all three
judges named is that one cause.

So elbow arrows are not a bad default - they are a default that cannot be
adopted before edges bind to sides. That is exactly **B4** (the anchor scheme).
Retry as **B12**, which is B3 gated on B4 rather than a blind repeat.

---

## B4a — automatic side anchors on edge terminals — **REVERTED**

_(wake 15)_

**Hypothesis.** Backlog entry B4 reads "ship the anchor scheme (8 compass +
`center` + `@x,y`), then bind edges to sides instead of centres", with the
evidence that `hexagonal`'s `usecases` has seven outgoing edges all bound to its
centre. That is two things, and only the second is a layout-quality question the
frozen corpus can answer - an authored anchor attribute is a language feature no
corpus file uses. Split accordingly and tested the judgeable half, **B4a**:
derive each terminal's anchor automatically from layout geometry, binding it to
the side midpoint of the shape that faces the other end of the edge.

**Diff.** +72 / -6 in `domain/emit/emit.ts`, +94 / -8 in `emit.test.ts`, plus a
regenerated `emit.test.ts.snap`. `emit()` gained a `collectRects` walk building a
`Map<string, Rect>` of **absolute** (page-space) rects for every box / note /
frame - IR `x`/`y` are frame-relative under a frame, so the frame origin
accumulates as the walk descends. `emitEdge` looks both endpoints up, compares
`|dx| / w` against `|dy| / h` to pick the side the centre-to-centre ray exits
through, and emits `normalizedAnchor` with **`isPrecise: true`** (tldraw ignores
`normalizedAnchor` unless that flag is set - it is load-bearing, not cosmetic).
Missing geometry or coincident centres fall back to the old centre attach.
`contracts/builders.ts` untouched; no layout code touched.

**Objective gates — all pass, all uninformative.** `npm run check` green (36
files, 284 tests). This is an emit-only change, so every corpus geometry report
is byte-identical to the champion by construction: canvas area 1.00x, overlaps
0 → 0, source-order violations 0 → 0 on all six files. As with B3, the gates
cannot see this hypothesis at all.

Five of six PNGs differ. `sparse-graph` renders **byte-identical** and is
recorded as a structural tie without spending a judge: its edges join
equal-sized boxes at equal `y`, and for that geometry a centre-bound arc already
clips to exactly the side midpoint the candidate computes.

**Blind A/B.** Assignment randomised per file, judges never told which side was
the candidate, and told the render outranks the report.

| file | A was | B was | judge picked | winner |
|---|---|---|---|---|
| deep-nesting | candidate | champion | TIE | tie |
| hexagonal | champion | candidate | A | champion |
| long-labels | champion | candidate | TIE | tie |
| sequence | candidate | champion | TIE | tie |
| sparse-graph | champion | candidate | _(not judged)_ | structural tie |
| wide-fanout | champion | candidate | TIE | tie |

Judge reasoning, condensed:

- **hexagonal** (champion): same node placement in both, but the candidate
  "routes several usecases-to-driven-port arrows straight through the
  'Entities + rules' box and tangles the driving-port arrows with a stray
  arrowhead landing near CreateSession", where the champion's edges "fan out
  cleanly from Use cases".
- **deep-nesting** (tie): the only pixel differences are "tldraw's hand-drawn
  stroke jitter"; both carry the same pre-existing defects.
- **long-labels** (tie): both renders show the same sticky-note overflow piling
  garbled text below the reporting box.
- **sequence**, **wide-fanout** (ties): no visible difference to prefer.

**Verdict: REVERTED.** 0 candidate / 1 champion / 5 ties. Champion doc unchanged
(byte-identical, and the candidate moved no number in it). Reverted by restoring
the three files from `HEAD` (`git show HEAD:<path> > <path>`) - the guardrail
hook auto-denies `git checkout --`, and `git stash` would shift `stash@{0}`,
which the B2 entry references.

**Why it lost — and why this reframes B12.** With `isPrecise: false`, tldraw
does not really draw from the centre. It draws a curve from the centre and
**clips it at the box boundary**, which is a *continuous* side anchor: the exit
point slides freely around the perimeter as the other end moves. Snapping to one
of four fixed side midpoints is therefore not an improvement on centre-binding
for arc arrows - it is a **coarsening** of something the renderer already does
better, and it costs exactly what `hexagonal` shows: a fan of seven edges that
previously left `usecases` from seven distinct perimeter points now leaves from
one point, so several of them run through the box stacked in between.

The consequence for the backlog matters more than the revert. B12 gated elbow
arrows on B4 "landing first". That gate is now measured and it does not hold in
that direction either: side anchors alone can only lose (they coarsen arc
clipping), and elbow alone can only lose (wake 14 - an elbow leaving a centre is
drawn straight through both boxes). **They are a package, not a sequence.**
Neither half is adoptable on its own, and testing them one at a time will keep
producing reverts that each look like a refutation of a mechanism that is
actually fine. Requeued as a single hypothesis, **B13**, which flips
`kind: "elbow"` and side-anchors the terminals in one change and judges the pair
together. B12 is struck as superseded rather than left as a blocked retry.

---

## B13 — elbow arrows **and** automatic side anchors, shipped together — **REVERTED**

_(wake 16)_

**Hypothesis.** B3 (elbow routing) and B4a (side anchors derived from layout
geometry) each lost alone, for mirror-image reasons: an elbow leaving a shape
*centre* is drawn straight through both boxes, and a fixed side midpoint is a
*coarsening* of the continuous perimeter clip tldraw already gives an arc.
Neither is adoptable on its own. The combination is the first configuration
where the anchor has a routing style that can use it, so ship both in one change
and judge the pair.

**Diff.** +216 / -20 across five files, both halves recoverable from
`docs/patches/b13-elbow-side-anchors.patch` (saved before the revert — this is
the third time this code would otherwise be rebuilt from prose).

- `contracts/builders.ts`: `arrowShape()` `kind: "arc"` → `"elbow"`. One token.
- `domain/emit/emit.ts` (+115 / −4): `emit()` runs a `collectRects` walk before
  `emitElement`, building a `Map<string, Rect>` of **absolute page-space** rects
  for every box / note / frame (the frame's own absolute origin accumulates on
  descent, since IR `x`/`y` are frame-relative under a frame). `emitEdge` takes
  the centre-to-centre delta and, **per terminal independently**, compares
  `|dx| / w` against `|dy| / h` using that terminal's own rect to pick
  left / right / top / bottom, emitting `normalizedAnchor` with
  `isPrecise: true` (load-bearing — tldraw ignores the anchor without it). The
  target terminal reuses the same delta negated, since it faces back toward the
  source.
- Zero-size guard: `sideAnchor()` returns null when `w === 0 || h === 0` or the
  centres coincide, and that terminal falls back to the centre attach. This
  closes the unguarded division flagged in the plan's "Discovered work" at
  wake 15.
- Tests (+94 / −8 in `emit.test.ts`, +1 in `builders.test.ts`): a horizontal
  pair, a vertical pair, a nested-in-frame pair pinning absolute-origin
  accumulation, and a degenerate zero-width case proving per-terminal
  independence. Snapshot regenerated via vitest.

No layout code touched.

**Objective gates — all pass, all uninformative.** `npm run check` green (36
files, 284 tests). Emit-only plus the builders flip, so all six corpus geometry
reports are **byte-identical** to the champion by construction: canvas 1.00x,
overlaps 0 → 0, source-order violations 0 → 0. As with B3 and B4a, the gates are
structurally blind to this hypothesis. Unlike B4a, **all six PNGs differ**, so
every file got a judge.

**Blind A/B.** Assignment randomised per file and the staging verified against
the recorded assignment with `cmp` before launching. Judges never told which
side was the candidate, and told the render outranks the report.

| file | A was | B was | judge picked | winner |
|---|---|---|---|---|
| deep-nesting | candidate | champion | A | **candidate** |
| hexagonal | champion | candidate | A | **champion** |
| long-labels | candidate | champion | TIE | tie |
| sequence | candidate | champion | TIE | tie |
| sparse-graph | champion | candidate | TIE | tie |
| wide-fanout | candidate | champion | TIE | tie |

Judge reasoning, condensed:

- **deep-nesting** (candidate): the candidate "routes the long cross-frame edges
  as clean orthogonal elbows around the boxes", where the champion "draws them
  as long diagonals that slice straight through the Router and Config boxes and
  tangle with the vertical trunk".
- **hexagonal** (champion): the candidate's elbow routing "cuts through the CLI,
  ListOrders, Payments and Notifications boxes and tangles the driven-ports
  column".
- **long-labels** (tie): indistinguishable, and both carry the same defect —
  the two notes overlap each other and the reporting box into unreadable
  overprinted text.
- **sequence**, **sparse-graph**, **wide-fanout** (ties): no visible difference.
  `wide-fanout`'s judge noted both renders draw the same degenerate vertical
  chain with arrows piercing every box.

**Verdict: REVERTED.** 1 candidate / 1 champion / 4 ties — not *strictly* more
wins than losses, and ties go to the champion. Reverted by restoring the five
files from `HEAD` (`git show HEAD:<path> > <path>`; the guardrail hook
auto-denies `git checkout --`). Tree back to 281 tests. Champion doc unchanged —
byte-identical, and the candidate moved no number in it.

**What was actually learned — the mechanism is now half-proved, not refuted.**
This is the first of the three arrow wakes where the candidate *won a file*.
`deep-nesting` is the case with long cross-frame edges and room to route, and
there the pair does exactly what B3 predicted it would once terminals stopped
binding to centres: orthogonal runs around the boxes instead of diagonals
through them. The package hypothesis is correct. It is the *anchor placement*
that is still wrong, not the routing style.

`hexagonal` is the counter-example and it fails for the reason the B13 backlog
entry predicted in advance: `usecases` has seven outgoing edges, every one of
them picks the same facing side, and all seven therefore stack on that side's
single midpoint. Elbow routing then draws seven orthogonal trunks out of one
point, which is worse than seven diverging diagonals out of one point because
the trunks are straight lines through whatever is stacked between. One shape
one anchor is the defect; it is not a defect of elbows and not a defect of side
binding.

So the next variant is the one already named in the backlog: **distribute** the
edges that share a side along that side rather than stacking them on its
midpoint (`normalizedAnchor` slid to `k / (n + 1)` along the side for the `k`-th
of `n` edges, ordered by the other endpoint's position along that axis).
Requeued as **B14**, at the top of the backlog, with the patch on disk so it is
an extension rather than a rebuild.

---

## B14 — distribute the edges that share a side along that side _(wake 17)_ — REVERTED

**Hypothesis.** B13 proved the package (elbow routing + geometry-derived side
anchors) wins `deep-nesting` and loses `hexagonal`, and named the remaining
defect precisely: `usecases` has seven outgoing edges, all of which pick the
same facing side and therefore all stack on that side's single midpoint. Fix
that one thing - group every terminal that landed on the same shape *and* the
same side, order the group by the other endpoint's position along the side's
free axis, and slide the `k`-th of `n` to `k / (n + 1)` along the side instead
of `0.5` - and the pair should stop losing.

**What was built.** `docs/patches/b13-elbow-side-anchors.patch` applied
unchanged as the base (it restores `kind: "elbow"` and the per-terminal facing
side pick), then one change on top: `emitEdge` can no longer decide an anchor
on its own, because the group is not visible from a single edge. A `computeAnchors`
pre-pass walks the IR, collects every edge, picks each terminal's side with the
patch's existing logic, buckets terminals by `shapeId|side`, sorts each bucket
by the other endpoint's centre along the free axis (`y` for left/right, `x` for
top/bottom, edge id as tie-break), and writes a `Map` keyed
`${edge.id}-start` / `-end`. The walk threads that map instead of the rect map
and `emitEdge` just looks its two terminals up. `sideAnchor()` split into
`pickSide()` (which side) + `anchorAt(side, t)` (where along it), because
grouping needs the side name and the old helper baked the coordinate in.
`n === 1` gives `t = 0.5`, i.e. byte-identical to B13 - confirmed by the four
B13 tests passing unchanged and the auth-flow snapshot not moving.

+337/-20 across five files. One test added: three edges leaving one shape's
right side, declared in the order `b, c, d` but with target centre-`y` order
`c < d < b`, asserting anchors `0.25 / 0.5 / 0.75` land on `e2 / e3 / e1` - it
fails under declaration-order placement, so it pins the ordering rule and not
just the spacing. `npm run check` green at 285 tests, verified directly.

**Objective gates: all pass, all uninformative for the fourth wake running.**
Layout is untouched, so all six geometry reports are byte-identical to the
champion by construction: same canvas, zero new overlaps, zero source-order
violations. Every gate is a tautology for an arrow hypothesis. All six PNGs
differ, so every file got a judge.

**Blind A/B.** Assignment randomised per file, staging verified against the
recorded assignment with `cmp` before launching. Judges never told which side
was the candidate, and told the render outranks the report.

| file | A was | B was | judge picked | winner |
|---|---|---|---|---|
| deep-nesting | candidate | champion | A | **candidate** |
| hexagonal | champion | candidate | A | **champion** |
| long-labels | champion | candidate | A | **champion** |
| wide-fanout | candidate | champion | B | **champion** |
| sequence | champion | candidate | TIE | tie |
| sparse-graph | candidate | champion | TIE | tie |

Judge reasoning, condensed:

- **deep-nesting** (candidate): the candidate's "offset elbow routes keep all
  eight edges individually traceable despite some clutter", while the champion
  "collapses four collinear edges into one indistinguishable vertical line
  (hiding Metrics→Config entirely) and drives a long diagonal straight through
  the Router and Config boxes".
- **hexagonal** (champion): the champion's "straight arrows fan out legibly
  while [the candidate's] elbow routes run vertical segments straight through
  boxes (CLI, ListOrders, UsersRepo, Payments, Notifications) and pile up
  overlapping segments around the core".
- **long-labels** (champion): both share the same overprinted note text, but the
  champion's "arrows are clean vertical connectors while [the candidate] adds
  elbow segments that cut horizontally through the auth, inventory and payments
  boxes, piercing their label text".
- **wide-fanout** (champion): the candidate's "18 hub fan-out arrows collapse
  into a dense black tangle that overprints and pierces the first several Worker
  boxes (and again below Scheduler)", where the champion "routes every edge as a
  clean short segment between neighbors, leaving all labels legible".
- **sequence**, **sparse-graph** (ties): no visible difference - a 14-step
  single column and a grid of equal boxes have one edge per side each, so
  `n === 1` everywhere and the candidate is B13 is the champion.

**Verdict: REVERTED.** 1 candidate / 3 champion / 2 ties. Reverted by restoring
the five files from `HEAD` (`git show HEAD:<path> > <path>`; the guardrail hook
auto-denies `git checkout --`). Tree back to 281 tests, re-verified green.
Champion doc unchanged.

**What was actually learned — distribution is a regression, not the missing
piece, and B13 remains the high-water mark.** B13 scored 1-1; B14 scored 1-3 on
the same corpus with the same routing. Distribution did not repair `hexagonal`
and it actively *lost* `long-labels` and `wide-fanout`, both of which B13 had
tied.

The mechanism of the regression is visible in the judges' own words and it is
the opposite of what the hypothesis assumed. Stacking `n` edges on one anchor
makes them **share** a trunk: `n` orthogonal runs that overlap into what reads
as one line. Distributing them turns that single shared trunk into `n` distinct
parallel trunks, each of which now has to cross the diagram on its own path.
When the targets sit in a narrow column - `wide-fanout` is literally one column
26 boxes tall, `long-labels` one column of 12 - every one of those new trunks
runs down *through* the column. B14 therefore multiplied the number of
box-piercing runs by `n` in exactly the two files where `n` was largest. That is
why `wide-fanout`'s hub, with 18 outgoing edges, went from an unremarkable tie
to "a dense black tangle".

So the two anchor policies fail in mirror images, the same way B3 and B4a did:
one anchor per side is illegible where the fan is wide and the layout is roomy
(`hexagonal`); `n` anchors per side is illegible where the fan is wide and the
layout is a corridor (`wide-fanout`, `long-labels`). Both are consequences of a
router that has no idea the boxes exist. **The next thing to test is not another
anchor rule.** Either the router must avoid obstacles, or the candidate must
stop competing on the files whose layout leaves it nowhere to route.

Two follow-ups requeued, in that order:

- **B15** - elbow + side anchors gated to edges that actually have room:
  keep `kind: "elbow"` and the B13 side anchor only for a terminal pair whose
  centre-to-centre run does not pass through a third shape's rect, and leave
  every other edge as today's arc from a centre. `deep-nesting` is the file
  where the pair wins and it is also the file with room; `wide-fanout` and
  `long-labels` are corridors where no orthogonal route exists at all. A
  per-edge gate should keep the win and drop all three losses.
- **B16** - distribution *bounded by the shared span* rather than by the whole
  side: spread the `k`-th of `n` over only the portion of the side that faces
  the targets' actual extent, so a fan whose targets span 40px does not get
  spread over a 600px side. This is the smaller-change version of B14 and it is
  only worth trying if B15 shows the routing is salvageable at all.

---

## B15 — elbow + side anchors gated per edge to the runs with room _(wake 18)_ — REVERTED

**Hypothesis.** Across B13 and B14 the elbow+side-anchor pair won `deep-nesting`
twice and never won anything else. `deep-nesting` is the corpus file with long
cross-frame edges *and* open space beside the boxes; the three files the pair
loses (`hexagonal`, `long-labels`, `wide-fanout`) are corridors where every
orthogonal route the router picks runs through a box, because the router does
not know the boxes exist. So gate the pair per edge: a terminal pair keeps
`kind: "elbow"` and its side anchors only if the centre-to-centre run between
the two endpoints does not pass through a third shape's rect; every other edge
falls back to today's champion behaviour, `kind: "arc"` from a centre anchor.
Keep the one win, drop the three losses, without building an obstacle-avoiding
router.

**What was built.** `docs/patches/b13-elbow-side-anchors.patch` applied
unchanged as the base, then the gate on top. `arrowShape(input, kind)` takes the
kind as an argument instead of hardcoding it, so `kind` is per-edge for the
first time. `collectRects` fills an `obstacleIds: Set<string>` alongside the
rect map, containing **box and note ids only** - frames are deliberately not
obstacles, since a cross-frame edge would always be blocked by its own ancestor
frame and the hypothesis would be untestable. `segmentIntersectsRect` is the
standard slab method with strict comparisons, so a segment that only grazes a
rect boundary does not count as blocking. `isRouteBlocked` walks the obstacle
set excluding the edge's own two endpoints. `emitEdge` starts every edge at
`arc` + centre anchors and only flips to `elbow` + the B13 side-anchor pick when
the straight run is clear.

+195/-0 net in `emit.ts`, +5/-2 in `builders.ts`, one test added pinning both
branches of the gate (a scene where a third box sits on the line, asserting arc
+ centre anchors, and one where nothing does, asserting elbow + side anchors).
The auth-flow snapshot did not move: both its edges have clear runs, so they
stay elbow exactly as under B13. `npm run check` green at 285 tests, run and
read directly.

**How much the gate actually gated.** Counted from the emitted scene:

| file | elbow | arc | total |
|---|---|---|---|
| deep-nesting | 2 | 22 | 24 |
| hexagonal | 18 | 48 | 66 |
| long-labels | 4 | 20 | 24 |
| sequence | 13 | 26 | 39 |
| sparse-graph | 8 | 16 | 24 |
| wide-fanout | 2 | 73 | 75 |

**Objective gates: all pass, all uninformative for the fifth wake running.**
Layout is untouched, so all six geometry reports are byte-identical to the
champion by construction: same canvas, zero new overlaps, zero source-order
violations. All six PNGs differ, so every file got a judge.

**Blind A/B.** Assignment randomised per file from `/dev/urandom`, staged and
verified against the recorded assignment with `cmp` before launching. Judges
never told which side was the candidate, and told the render outranks the
report.

| file | A was | B was | judge picked | winner |
|---|---|---|---|---|
| deep-nesting | candidate | champion | B | **champion** |
| hexagonal | champion | candidate | A | **champion** |
| wide-fanout | candidate | champion | A | **candidate** |
| long-labels | champion | candidate | TIE | tie |
| sequence | champion | candidate | TIE | tie |
| sparse-graph | candidate | champion | TIE | tie |

Judge reasoning, condensed:

- **deep-nesting** (champion): the two renders are otherwise identical, but the
  champion "draws visible arrowheads on the Parser→Normalizer→Serializer row
  edges so their direction is traceable", while under the candidate "those two
  connectors collapse into tiny directionless stubs between the boxes".
- **hexagonal** (champion): the candidate's "elbow routes run vertical segments
  through the ListOrders and CreateSession boxes and stack overlapping segments
  near Use cases without removing the long diagonal crossings", where the
  champion's "straight arrows all stay off box interiors and remain traceable".
- **wide-fanout** (candidate): pixel-identical except at the two hub-to-first-child
  edges, where the candidate "draws a visible arrowhead at the target while [the
  champion] collapses it to a tiny dot", in "an otherwise equally cluttered
  vertical stack whose overlapping fanout arrows run straight through every box
  in both versions".
- **long-labels**, **sparse-graph**, **sequence** (ties): no visible difference
  beyond sub-arrowhead antialiasing; the shared defects (overprinted note text
  in `long-labels`) are identical on both sides.

**Verdict: REVERTED.** 1 candidate / 2 champion / 3 ties. Reverted by restoring
the five files from `HEAD` (`git show HEAD:<path> > <path>`; the guardrail hook
auto-denies `git checkout --`). Tree back to 281 tests, re-verified green.
Champion doc unchanged.

**What was actually learned — two things, and the second one kills the whole
line of attack.**

*One: a straight-line clearance test is the wrong predicate for an orthogonal
router.* `hexagonal` kept 18 of its 66 edges on elbow and the judge still saw
vertical segments cutting through `ListOrders` and `CreateSession`. That is not
a bug in the gate; it is the gate answering a different question than the one
that matters. The gate tests the straight centre-to-centre segment. The router
then draws an **L**. Clearing the diagonal says nothing about whether either leg
of the L clears - in a grid-ish layout the diagonal threads between two boxes
precisely when the axis-aligned legs run through them. Any future gate has to
test the path that will actually be drawn, not the chord between its endpoints.

*Two: the `deep-nesting` win was never about routing.* The gate left only 2 of
24 edges on elbow there, and the file flipped from a candidate win (B13, B14) to
a champion win - decided by the judge on arrowheads, not on routes. This is the
mirror of the `wide-fanout` result in the same wake, where the candidate won for
the *same* reason with the sign reversed. Both files came down to two short
hub-to-neighbour edges and to whether tldraw drew a visible arrowhead or a dot
at their target. With centre anchors (`isPrecise: false`) tldraw clips the curve
at the box boundary and has room for a head; with a precise side anchor the
arrow terminates exactly on the side midpoint, and over a short gap the head
degenerates. Which side that favours depends on the gap size, i.e. on nothing
the hypothesis controls.

So B13's one repeated win is not evidence that elbow routing helps
`deep-nesting`. It is evidence that on that corpus the **only** visible
difference elbow+side-anchors makes, once the box-piercing routes are gated
away, is a renderer artefact at short edges. Five hypotheses (B3, B4a, B13, B14,
B15) have now been spent on terminal binding and routing style, producing one
win that turns out to be an arrowhead. **The remaining backlog entry in this
line, B16, is struck: its gate was "only worth trying if B15 shows the routing
is salvageable at all", and B15 shows it is not.**

Requeued, in order:

- **B17** (tooling, not an A/B) - a fifth objective gate that counts, from the
  emitted scene plus the layout rects, how many arrow paths cross a
  non-endpoint shape's rect. Five arrow wakes have now been judged on four
  gates that are structurally blind to arrows, and this metric would have
  rejected B4a, B14 and the `hexagonal` half of B15 before spending six judge
  calls each.
- **B18** - short-edge arrowhead floor: keep centre anchors (`isPrecise: false`)
  for any edge whose endpoints are closer than a small multiple of the arrowhead
  size, because a precise anchor over a short gap renders as a directionless
  stub. This is the defect that decided both `deep-nesting` and `wide-fanout`
  here, and it is worth fixing on its own terms whatever happens to routing.

---

## B17 — a fifth objective gate that can see arrows _(wake 19)_ — **BUILT**

Not an A/B. No hypothesis was judged this wake and the champion is unchanged.

**Problem.** Five arrow hypotheses (B3, B4a, B13, B14, B15) were each put in
front of six blind judges after passing four objective gates that *cannot fail*
for an arrow change: an arrow moves no shape, so overlap, source order, canvas
area and `npm run check` all come back byte-identical by construction. Every
arrow wake spent its whole gate step learning nothing, and wake 18 established
that a chord-based clearance test is the wrong predicate anyway - the gate tests
the centre-to-centre chord while the router draws an L.

**Built.** `layoutReport` now calls `emit(doc)` and derives arrow paths from the
**emitted scene**, not from the IR edge list:

- endpoints come from the arrow's two `binding` records, resolved back to the
  absolute layout rect through `toId`; the point is the rect centre unless
  `props.isPrecise` is true, in which case it is `props.normalizedAnchor`
  applied to the rect. A candidate that changes anchors moves the metric.
- `arrowPath(p, q, kind)` is exported and pure. Non-elbow kinds trace one
  straight segment. `kind: "elbow"` traces a three-leg orthogonal route split on
  the wider axis at the midpoint - a model of tldraw's mid-split router, not the
  router itself, and marked as such in the source.
- the metric counts `(arrow, shape)` pairs where any leg of the traced path
  passes through a non-endpoint shape's rect, deflated 0.5px per side so
  touching does not count. Exact Liang-Barsky clip, not sampled.
- **frames are excluded** on purpose: `edges crossing a frame boundary they
  don't belong to` already counts those, and including them would make the two
  gates redundant rather than independent.

Reported as `arrow paths crossing a non-endpoint shape: N`, immediately after
the frame-boundary line.

**Champion baseline** (wake-12 revision, `kind: "arc"`, centre anchors):

| corpus file | crossings |
| --- | --- |
| deep-nesting | 10 |
| hexagonal | 5 |
| long-labels | 6 |
| sequence | 0 |
| sparse-graph | 0 |
| wide-fanout | **186** |

Two things fall out of the baseline immediately. `sequence` and `sparse-graph`
are clean, so any arrow hypothesis that puts a line through a box on those files
is now rejectable without spending a judge. And `wide-fanout`'s 186 is the
numeric form of the defect three separate judges have named unprompted since
wake 16: a 26-box vertical corridor whose hub edges pierce every box in the
column. That file's problem was never the arrows.

**Gate direction.** A candidate is rejected if the count rises on *any* corpus
file. It is not a reward signal - lowering it is evidence for the judge to weigh,
not a win on its own.

**Verified.** `npm run check` green, 285 tests. The elbow branch is covered by
direct `arrowPath` unit tests only; nothing in the corpus emits `kind: "elbow"`
today, so the first hypothesis that flips it back is also the first real
exercise of that branch.

---

## B6 — container gap as a function of edge density _(wake 20)_ — **REVERTED**

**Hypothesis.** Spacing should not be a constant 40. A container whose subtree
is densely wired needs more room between its children than a container of
unrelated boxes, so derive the gap from edge density when the author has not
set one explicitly.

**The change.** `src/domain/layout/stack.ts`, +47/-5, plus 4 unit tests.
`hybridLayout` collects every edge in the document once and threads the list
down through `layoutContainer` → `sizeElement` → `sizeFrame`. A new
`resolveGap(explicitGap, children, allEdges)` replaces both
`container.gap ?? DEFAULT_GAP` sites:

- an explicit `gap` still wins, untouched;
- otherwise `density = edgesInside / max(1, directChildCount)`, where
  `edgesInside` counts edges declared **anywhere in the document** whose `from`
  *and* `to` both land inside this container's subtree — corpus files declare
  most edges at the doc root while the boxes they connect sit several frames
  deep, so counting only locally-declared edges would have made the whole
  hypothesis invisible;
- `gap = round(40 * (1 + min(density, 1)))`, i.e. 40 with no internal edges,
  80 once a container has at least as many internal edges as direct children.

Nothing else moved: `DEFAULT_GAP`, `defaults.ts`, `elk-layout.ts`, the IR types
and `StubLayout` are all untouched, and the derived value reaches ELK for free
because `AutoPlaceRequest.gap` is filled from the same variable.

**Objective gates — all five passed.**

| corpus file | canvas champion → candidate | area ratio | overlaps | source-order | arrow crossings |
| --- | --- | --- | --- | --- | --- |
| deep-nesting | 560x776 → 560x776 | 1.00 | 0 → 0 | 0 → 0 | 10 → 10 |
| hexagonal | 1198x636 → 1198x636 | 1.00 | 0 → 0 | 0 → 0 | 5 → 5 |
| long-labels | 948x1200 → 948x1497 | 1.25 | 0 → 0 | 0 → 0 | 6 → 6 |
| sequence | 282x1360 → 282x1841 | 1.35 | 0 → 0 | 0 → 0 | 0 → 0 |
| sparse-graph | 680x460 → 680x460 | 1.00 | 0 → 0 | 0 → 0 | 0 → 0 |
| wide-fanout | 138x2560 → 138x3510 | 1.37 | 0 → 0 | 0 → 0 | 186 → 186 |

`npm run check` green, 289 tests. Three files land between 1.25x and 1.37x
area, under the 1.5x ceiling but not by much — a cap above 1x on the density
term would have failed the gate outright.

**Verdict: 1 candidate / 3 champion / 2 structural ties → REVERTED.**

`deep-nesting` and `hexagonal` produced **byte-identical** renders and reports,
so no judge was spent on them. Both files set an explicit `gap` on every frame
and have a single top-level child, so `resolveGap` never reaches its derived
branch. That is worth noting for its own sake: two of six corpus files are
structurally blind to any hypothesis about *default* spacing.

| file | A/B assignment | winner | judge's reasoning |
| --- | --- | --- | --- |
| long-labels | A=champion, B=candidate | **candidate** | "Both layouts garble the two notes into overlapping text, but B's extra vertical spacing keeps the collision confined below the reporting box while A's note text smears across both the audit and reporting boxes." |
| sequence | A=champion, B=candidate | champion | "A's tighter 100px spacing keeps the 14-step column more compact and scannable, while B stretches the same content over 35% more height with no legibility gain." |
| sparse-graph | A=champion, B=candidate | champion | "Identical structure and cleanliness, but A's shorter arrows keep connected pairs tighter, so proximity grouping better matches the actual edges than B's stretched-out arrow gaps." |
| wide-fanout | A=candidate, B=champion | champion | "Both renders collapse to the same single vertical chain with identical structure and crossing counts, but B packs it with tighter, even spacing (fill 0.55 vs 0.40), so labels render slightly larger and the diagram wastes less blank canvas with no legibility cost." |

**What this actually measured — the heuristic has the sign right and the
granularity wrong.**

The one win is the tell. `long-labels` improved not because its edges needed
room but because two tldraw stickies were overflowing their reserved boxes, and
more vertical slack gave the overflow somewhere harmless to go. That is B9's
defect being masked, not B6's hypothesis being confirmed. The three losses are
all the same complaint in different words: **more space, nothing bought.**

The mechanism the sparse-graph judge named unprompted is the real finding, and
it generalises past this hypothesis. Gap is a **container-level** knob, so
raising it moves *every* sibling pair apart uniformly — including the pairs with
no edge between them. Density is measured per container but spent per gap, so a
container that is dense *on average* pushes apart the children that are not
connected at all. In `sparse-graph` this inverted the diagram's own grouping
signal: connected pairs ended up further apart than unconnected neighbours, so
proximity stopped encoding connectivity and started contradicting it.

That is the general lesson for the backlog: **a per-container scalar cannot
express a per-pair property.** Any future spacing hypothesis motivated by edges
has to act on the pair (a minimum separation between two specific children, or
a per-edge routing allowance), not on the container's gap. B6's variants — a
different cap, a different curve, density measured over direct children only —
are all the same shape and all inherit the same defect; do not spend a wake
tuning the constant.

`wide-fanout` is now the fourth consecutive hypothesis to lose on it, and for
the fourth different reason. Its 186 crossings come from a 26-box vertical
corridor; nothing that adjusts spacing, anchors, or routing style has moved it,
because the defect is the corridor's *shape*. B7 is the only backlog entry
aimed there.

**Tool fix, kept and committed separately.** `tools/screenshot.mts` waited on
`[data-shape-id]` with playwright's default `state: "visible"`. A perfectly
vertical arrow has a zero-width bounding box, which that check never passes, so
the candidate `sequence` render timed out twice while the champion's had
happened to resolve a box first. Changed to `state: "attached"`; the existing
zoom-to-fit plus 500ms settle already covers paint. This affects *whether* a
capture happens, never what is captured, so both sides of the `sequence`
comparison remain the same tool's output.

---

## B7 — aspect-ratio targeting for the doc root — **REJECTED AT GATE 5**

_(wake 21)_

**Hypothesis (backlog, verbatim).** "Aspect-ratio targeting for the doc root:
currently defaulting to `col` makes tall skinny documents (1198 × 2940). Try
wrapping top-level children into a grid that targets ~16:9."

**What was built.** +61/-13 in `src/domain/layout/stack.ts`, +4 unit tests.
`TARGET_ASPECT = 16 / 9`; a pure `gridExtent(els, cols, gap)` mirroring
`gridPositions`' column/row-max arithmetic; an exported
`bestGridCols(els, gap, target?)` that scans `cols` from 1 to `n` and picks the
minimum of `|log((w / h) / target)|`, ties keeping the smaller `cols`.
`layoutContainer` gained a `mayAutoGrid` flag - true only for the doc root, and
only when the author set neither `layout` nor `cols` - and now reports the mode
and column count it actually used. `hybridLayout` writes those back onto the
positioned doc, so `layout: "grid"` is what `tools/layout-report.mts` reads.
That last part is load-bearing rather than cosmetic: the report picks its
source-order rule from `doc.layout ?? "col"`, and a row-major grid is a
violation of the col rule on every wrap. Frames, `auto`, `free`, explicit `row`
/ `col`, and explicit `cols` are all untouched.

**Objective gates — four passed, the fifth failed.**

| corpus file | canvas champion → candidate | area ratio | overlaps | source-order | arrow crossings |
| --- | --- | --- | --- | --- | --- |
| deep-nesting | 560x776 → 560x776 | 1.00 | 0 → 0 | 0 → 0 | 10 → 10 |
| hexagonal | 1198x636 → 1198x636 | 1.00 | 0 → 0 | 0 → 0 | 5 → 5 |
| long-labels | 948x1200 → 1927x580 | 0.98 | 0 → 0 | 0 → 0 | 6 → **1** |
| sequence | 282x1360 → 881x460 | 1.06 | 0 → 0 | 0 → 0 | 0 → **3** ❌ |
| sparse-graph | 680x460 → 680x460 | 1.00 | 0 → 0 | 0 → 0 | 0 → 0 |
| wide-fanout | 138x2560 → 983x460 | 1.28 | 0 → 0 | 0 → 0 | 186 → **36** |

`npm run check` green (36 files / 289 tests). No overlap appeared, no
source-order violation appeared, and the worst area ratio was 1.28x against the
1.5x ceiling. **Gate 5 rejects it: `sequence` goes from 0 arrow paths crossing a
non-endpoint shape to 3.** Per the protocol that is a rejection without a judge,
so no fable call was spent and there are no per-file verdicts.

**Why `sequence` breaks, and it is the mechanism, not the tuning.** `sequence`
is a chain: `s1 → s2 → … → s14`, one edge per adjacent pair. Wrapping a chain
into a row-major grid leaves every row boundary spanned by an edge that runs
from the *right* end of one row back to the *left* end of the next - a diagonal
across the full canvas width, at row-pitch height, passing through whatever sits
in the middle columns. Three columns means four such wrap-backs, and the render
shows all four as long diagonals slicing the middle column. No choice of `cols`
removes them; it only changes how many there are and how far each one travels.
The grid wrap is **topology-blind**: it optimises the bounding box and is
indifferent to which children the edges connect. Gate 5 exists to catch exactly
that, and this is the first time it has fired.

**What the renders say about the other two files, recorded because it does not
survive in the metrics.** PNGs were captured for `sequence` and `wide-fanout`
after the gate failed - not for judgement, but because the `wide-fanout` number
looks like a landslide and is not one. 186 → 36 crossings is real, and the
render still shows the `Dispatcher` hub firing eighteen straight chords across a
6x5 raster, most of them cutting through two or three boxes on the way. The grid
converts a vertical corridor into a raster; the fan is still drawn as eighteen
chords either way. `wide-fanout` is now the **fifth** consecutive hypothesis to
fail on it, and B7's evidence sharpens the diagnosis the previous four left
vague: the defect is not the corridor's shape, it is that eighteen edges from
one source get eighteen independent straight lines regardless of where the
targets are. That is a *routing* problem, and the terminal-binding line (B3,
B4a, B13, B14, B15) already established that anchors alone cannot fix routing.

**What survives.** Two successors, both aimed at the topology-blindness rather
than at the aspect target, which was never the part that failed:

- **B20** - gate the wrap on topology: skip it when the container's children
  form a chain, apply it when they form a fan or an unconnected set.
- **B21** - serpentine row direction, which turns every wrap-back edge into a
  short vertical hop. Needs a tooling change first (`sourceOrderViolations`
  must learn that a serpentine grid's odd rows run right-to-left), so it is two
  units of work, not one.

The `bestGridCols` scoring function itself is not implicated by anything
measured here. If B20 or B21 revives the wrap, reuse it as written.
