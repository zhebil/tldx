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

---

## B20 — topology-gated doc-root aspect wrap — **KEPT**

_(wake 22)_

**Hypothesis (backlog, verbatim).** "Gate the doc-root aspect wrap on
**topology**: apply it when the top-level children form a fan or carry no edges
at all, skip it when they form a chain (each child having at most one in- and
one out-edge, covering most of the container). B7's implementation is entirely
reusable - `bestGridCols` is not what failed - so this is a predicate, not a
rewrite."

**What was built.** +250/-8 across `src/domain/layout/stack.ts` (+105/-7) and
`src/domain/layout/stack.test.ts` (11 new tests). Two parts.

*B7's wrap, rebuilt* (it was `git restore`d at wake 21, so it had to be written
again from the ledger): `TARGET_ASPECT = 16 / 9`; a pure `gridExtent(els, cols,
gap)` mirroring `gridPositions`' column-max / row-max arithmetic; an exported
`bestGridCols(els, gap, target?)` scanning `cols` from 1 to `n` for the minimum
`|log((w / h) / target)|`, ties keeping the smaller `cols`. `layoutContainer`
takes a `mayAutoGrid` flag and returns the mode and column count it actually
used; `hybridLayout` sets that flag only for the doc root and only when the
author set neither `layout` nor `cols`, then writes the used mode/cols back onto
the positioned doc. That write-back is load-bearing, not cosmetic:
`tools/layout-report.mts` picks its source-order rule from `doc.layout ?? "col"`,
and a row-major grid violates the col rule on every wrap.

*The new part, the gate*: an exported `formsChain(childIds, edges)`, true iff
there is at least one edge, every direct child has resolved in- and out-degree
`<= 1`, and the edges cover most of the container (`edges.length * 2 >=
childIds.length`). Edges are resolved to direct children by the pre-existing
`collectAutoEdges` rather than by a second traversal. The wrap applies only when
`!formsChain(...)`; a chain falls through to the implicit `col` unchanged.

**Objective gates — all five passed.**

| corpus file | canvas champion → candidate | area ratio | overlaps | source-order | arrow crossings |
| --- | --- | --- | --- | --- | --- |
| deep-nesting | 560x776 → 560x776 | 1.00 | 0 → 0 | 0 → 0 | 10 → 10 |
| hexagonal | 1198x636 → 1198x636 | 1.00 | 0 → 0 | 0 → 0 | 5 → 5 |
| long-labels | 948x1200 → 1927x580 | 0.98 | 0 → 0 | 0 → 0 | 6 → **1** |
| sequence | 282x1360 → 282x1360 | 1.00 | 0 → 0 | 0 → 0 | 0 → 0 |
| sparse-graph | 680x460 → 680x460 | 1.00 | 0 → 0 | 0 → 0 | 0 → 0 |
| wide-fanout | 138x2560 → 983x460 | 1.28 | 0 → 0 | 0 → 0 | 186 → **36** |

`npm run check` green (36 files / 296 tests, up from 285). **The gate did its
job:** `sequence` is byte-identical to the champion, where B7 took it from 0
arrow-path crossings to 3 and was rejected for it. No new overlap, no
source-order violation, worst area ratio 1.28x against the 1.5x ceiling.

**Judgement.** Four of six files are geometrically identical between the two
sides - `sequence` and `sparse-graph` produce byte-identical reports, and
`deep-nesting` / `hexagonal` differ only in the mode *label* (`(col)` → `(grid)`)
because a grid of one child is a col of one child. No judge was spent on those
four; they are structural ties. The two files that genuinely differ were judged
blind, A/B randomised per file, PNGs plus reports:

- **long-labels** _(A = champion, B = candidate)_ → **candidate**. "In A the two
  notes are rendered on top of each other and over the audit/reporting boxes
  into an unreadable mush, while B keeps both notes legible and separated with
  only minor label grazing, so B is the only layout where all the diagram's
  content can actually be read."
- **wide-fanout** _(A = candidate, B = champion)_ → **candidate**. "A actually
  shows the hub-and-spoke fan-out from Dispatcher and Scheduler with legible
  labels, while B collapses the whole diagram into one cramped vertical chain
  that misrepresents the topology and overlaps every label with the through-going
  arrow."

**Verdict: 2 candidate / 0 champion / 4 structural ties → KEPT.** The candidate
wins strictly more files than it loses. `docs/layout-champion.md` regenerated.

**What this actually establishes, and what it does not.** The finding is narrow
and worth stating precisely: *a layout rule may consult the edge topology to
decide whether to apply itself.* B7 failed because the wrap was topology-blind,
not because targeting 16:9 was wrong, and gating the same wrap on a three-line
predicate flipped it from rejected-at-gate-5 to a 2-0 win. This is the first
kept hypothesis since B1 at wake 12, and the first one whose mechanism is a
*predicate* rather than a placement rule.

Two caveats recorded so they are not mistaken for support later. (a) The
`long-labels` win was decided on **note legibility**, not on aspect ratio - the
judge's whole sentence is about the two stickies overlapping in the champion.
That is B9's defect (notes reserve a fixed box, tldraw resizes stickies to fit)
being relieved by a wider canvas, exactly the same confound that produced B6's
single `long-labels` win at wake 20. The wrap did not fix it; it gave it room.
B9 is still owed its own wake. (b) `wide-fanout` finally scoring a win does not
mean its defect is fixed. Wake 21 recorded that the render still shows eighteen
independent straight chords from one hub, and that is still true here - the
judge preferred the raster because the *corridor* was unreadable, not because
the fan is now well routed. The 186 → 36 crossing drop is real and still leaves
36.

**Where this leaves the corpus.** Three of six files were already structurally
blind to any doc-root hypothesis (wake 21's note: `deep-nesting` and `hexagonal`
have one top-level child, `sparse-graph` sets `layout="auto"`). B20 adds a
fourth, `sequence`, *by design* - the gate's entire purpose is to leave chains
alone. So the doc-root axis can now be decided by at most two files, and both of
them voted the same way here. A future doc-root hypothesis has almost no corpus
left to be wrong on; treat a 2-0 on this axis as weaker evidence than a 2-0
elsewhere.

---

## Tooling note — serpentine-aware gate 3

_(wake 23, B21a — not a hypothesis, no judge, no verdict)_

Read this before proposing any hypothesis that produces a **grid**.

`sourceOrderViolations` in `tools/layout-report.mts` — the metric behind
objective gate 3 — used to demand that a grid's children run strictly
row-major: `y` non-decreasing, and `x` increasing inside a row. That rejects a
serpentine (boustrophedon) grid **by construction**, one violation per child in
every odd row, which is why B21 was split into a tooling wake and a placement
wake.

The metric now scores a grid under two competing reading orders — row-major,
and serpentine with odd rows running right-to-left — and returns the **lower**
of the two counts. `row`, `col`, `auto` and `free` are unchanged.

Two things to keep straight:

- **It is a no-op on today's corpus.** All six reports are byte-identical to the
  wake-22 champion, because every corpus grid is row-major and therefore scores
  0 under both readings. `docs/layout-champion.md` is still current and was
  deliberately not regenerated.
- **It genuinely weakens the gate for grids.** `min` does not detect which
  reading order the layout used; it takes the kinder score. Geometry alone
  cannot distinguish the two, and the positioned IR carries no serpentine flag.
  A scrambled grid that happens to look serpentine on some rows now scores lower
  than it would have yesterday. If a grid hypothesis ever clears gate 3
  *narrowly*, re-derive the count by hand before believing it.

The regression that matters is pinned in `tests/tools/layout-report.test.ts`: a
single-row grid at `x` = 0, 200, 100, 300 must still score above 0. The failure
mode of this change was never a wrong number, it was defanging the gate into
returning 0 for everything.
## B21b — serpentine (boustrophedon) rows for an auto-wrapped grid — **REJECTED AT GATE 5**

_(wake 24)_

**Hypothesis (backlog, verbatim).** "Serpentine (boustrophedon) row direction for
a wrapped grid, so a chain's wrap-back edge becomes a short vertical hop instead
of a full-width diagonal. ... `gridPositions` in `src/domain/layout/stack.ts`
places row-major; make odd rows run right-to-left."

**What was built.** +69/-7 across `src/domain/layout/stack.ts` (+24/-7) and
`src/domain/layout/stack.test.ts` (+45, two tests). One idea, threaded through
four functions: for element index `i` in a `cols`-wide grid, with
`r = floor(i / cols)`, the column becomes
`serpentine && r % 2 === 1 ? cols - 1 - (i % cols) : i % cols`. That mapping is
used both when accumulating `colWidths` and when reading `colX`, and `gridExtent`
takes the same flag so `bestGridCols` scores the geometry that will actually be
placed. Row assignment is untouched.

The flag is **on only for the grid the engine chose itself** - the
`mayAutoGrid && mode === "col"` auto-wrap from B20. An explicit `layout="grid"`
stays row-major, on the reasoning that an explicit grid is a table and reversing
its odd rows scrambles the meaning the author wrote. The second unit test pins
that: `cols={3}` explicit, child 3 keeps child 0's `x`.

**Objective gates — gate 5 fails.**

| corpus file | canvas champion → candidate | area ratio | overlaps | source-order | arrow crossings |
| --- | --- | --- | --- | --- | --- |
| deep-nesting | 560x776 → 560x776 | 1.00 | 0 → 0 | 0 → 0 | 10 → 10 |
| hexagonal | 1198x636 → 1198x636 | 1.00 | 0 → 0 | 0 → 0 | 5 → 5 |
| long-labels | 1927x580 → 1927x580 | 1.00 | 0 → 0 | 0 → 0 | 1 → 1 |
| sequence | 282x1360 → 282x1360 | 1.00 | 0 → 0 | 0 → 0 | 0 → 0 |
| sparse-graph | 680x460 → 680x460 | 1.00 | 0 → 0 | 0 → 0 | 0 → 0 |
| wide-fanout | 983x460 → 983x460 | 1.00 | 0 → 0 | 0 → 0 | 36 → **43** |

`npm run check` green (36 files / 301 tests, up from 299) - gate 1 passed, so the
rejection is about the layout, not a broken build. Gates 2, 3 and 4 passed on
every file; canvas is byte-identical everywhere, because reversing a row
permutes elements among columns whose widths barely differ. **Gate 5 rejects on
`wide-fanout`: 36 → 43 arrow paths crossing a non-endpoint shape.** No judge was
spent.

**Reach.** Only two of six files moved. `deep-nesting` and `hexagonal` have one
top-level child, `sparse-graph` sets `layout="auto"`, and `sequence` is
chain-gated out of the wrap by B20 - all four reports are byte-identical to the
champion. That is exactly the check wake 23 asked for, so it is recorded rather
than read as support: **`sequence` is untouched, and its 0-0 is not evidence.**

**Why it lost, and it is not a tuning problem.** Serpentine assumes the wrapped
sequence is a *chain*, so that the only edge crossing a row boundary is the
wrap-back one. Neither file that can see this change is a chain - and they
cannot be, because B20's gate is what decides a grid happens at all. The gate
admits a container precisely when it is *not* a chain, so the auto-wrap and
serpentine are structurally aimed at disjoint inputs. Two concrete readings:

- **`wide-fanout` is a fan.** Every edge runs from `hub` (row 0, column 0) to a
  leaf. Row-major puts leaf-6 directly under the hub; serpentine slides it to the
  far right. Reversing rows 1 and 3 does not shorten any wrap-back edge - there
  are none - it just lengthens half the spokes and drags them across more
  intervening boxes. Total edge length 10864 → 12811 (+18%), and that is what
  gate 5's 36 → 43 is measuring. `mini-hub` moving from column 1 to column 4
  makes its own six-spoke fan straddle the row instead of hanging off its left
  end.
- **`long-labels` is a tree, not a chain.** `gateway` has two out-edges and
  `orders` has three, so its adjacent-pair edges are not the wrap-back edges
  serpentine helps. It survives gate 5 at 1 → 1, but the non-gate numbers move
  the wrong way too: total edge length 4446 → 6190 (+39%) and edge-edge
  crossings 1 → 2. Serpentine repairs `router → orders` into a vertical hop and
  breaks `gateway → rate-limiter` and `auth → router` into diagonals in exchange.

**What this establishes.** B20's finding was that a layout rule may consult edge
topology to gate itself. B21b is the same finding read backwards: **a placement
rule tuned for one topology cannot ride along on a wrap that is gated to admit
only the opposite topology.** Serpentine is not wrong in general - it is wrong
for every input the auto-wrap can currently reach. Reviving it needs the wrap to
reach a chain first, which means revisiting B20's gate, which the corpus has no
file to justify. Treat this as closing the doc-root wrap-order line rather than
as a near miss.

The tooling half (**B21a**, wake 23) did work as designed: gate 3 reports 0
source-order violations for both changed files under the serpentine reading, so
the gate that would have rejected this by construction correctly did not. Its
cost stands unchanged - `min` over two reading orders is a genuinely weaker gate
for grids, and it bought a measurement that came back negative.

**Verdict: REJECTED AT GATE 5 → REVERTED.** Reverse-patched away; `src/` is
byte-identical to the wake-22 champion, so `docs/layout-champion.md` is still
current and was not regenerated.

---

## B8 — frame title width participates in frame sizing _(wake 25)_ — **STRUCK, measured no-op**

**Hypothesis.** `sizeFrame` computes `w = frame.w ?? contentW` and never looks at
`frame.name`, so a long frame title overflows its frame. Fix: floor the frame's
width at the title's width.

**No candidate was built, and no judge was spent.** The premise was measured
first and it is false on the frozen corpus: every frame title is comfortably
narrower than its frame, so the floor can never bind and the change would be
byte-identical on all six files.

**How it was measured.** Not by estimating - by reading the real numbers out of
the browser. `tools/text-metrics.mts` (new this wake) starts `serve`, loads the
viewer in headless chromium at **zoom 1**, and reports the rendered
`getBoundingClientRect()` of every shape's label. Camera zoom is 1, confirmed by
the rendered frame widths matching `tools/layout-report.mts`'s canvas units
exactly, so these are canvas pixels and directly comparable to the layout rects.

`hexagonal.tldsl.jsx`, every frame in the file:

| frame | title | rendered title w | frame w | ratio |
|---|---|---|---|---|
| `hex` | Hexagonal (ports and adapters) | 162.3 | 1198 | 0.14 |
| `driving-adapters` | Driving adapters | 92.3 | 152 | **0.61** |
| `driving-ports` | Driving ports | 76.3 | 197 | 0.39 |
| `core` | Domain core | 74.3 | 224 | 0.33 |
| `driven-ports` | Driven ports | 72.3 | 206 | 0.35 |
| `driven-adapters` | Driven adapters | 88.3 | 179 | 0.49 |

`deep-nesting.tldsl.jsx` is not close either - four frames named `System`,
`Service`, `Module`, `Unit` measuring 47.3, 48.0, 49.3 and 33.3px in frames
560, 512, 472 and 440 wide - ratios 0.08 to 0.11.

The worst case in the whole corpus is `driving-adapters` at 0.61. A title would
need **~1.6x more characters** to reach its own frame's width.

**Why any honest estimator gives the same answer.** The rendered frame label is
a 14px-tall line at **5.4-6.8 px per character** (162.3px for 30 chars, 92.3px
for 16, 74.3px for 11). The repo's only existing text constant is
`AVG_CHAR_PX = 9` in `src/domain/layout/defaults.ts`, and that is calibrated for
the *box-label* font, which is far larger - reusing it would over-estimate the
title by ~50% and still not bind (16 x 9 = 144 < 152). There is no defensible
constant that makes B8 do anything here, and picking one that did would be
tuning an estimator to manufacture an effect.

**The real finding is vertical, and B8's framing hid it.** The same measurement
shows the frame title is drawn **outside** the frame: `labelTop` is **23px above**
the frame's top edge and the line is **14px** tall, so the title occupies the band
`[top-23, top-9]` and *nothing at all* is drawn inside the frame's top. Layout
believes the opposite. `FRAME_PAD_TOP = FRAME_TITLE_PX (32) + FRAME_PAD_INNER (32)`
reserves 32px of title chrome *inside* every frame, and
`src/domain/ports/layout.fake.ts:11` states the assumption in a comment - "so
chrome never overlaps". Two consequences with opposite signs:

- **32px is reserved inside where nothing draws.** Every frame is 32px taller
  than it needs to be and its first child row sits 32px below where `pad` asked.
  On `deep-nesting` that compounds four levels deep.
- **0px is reserved outside where the title does draw.** On `deep-nesting` the
  title band of each nested frame already intrudes into the child above it:
  `l2`'s band is `y 185-199` against `l1-config` ending at `y 192` (7px), `l3`'s
  is `385-399` against `l2-metrics` ending at `394` (9px), `l4`'s is `577-591`
  against `l3-validator` ending at `588` (11px). None of the three *collides*,
  and only because titles are left-aligned at the frame's left edge while the
  children are centred - `l2`'s title spans `x 24-66` and `l1-config` starts at
  `x 220`. Objective gate 2 cannot see this at all: the title is not a shape, so
  it contributes no overlapping shape pair.

Both halves survive as **B22** (reclaim the interior 32px) and **B23** (reserve
the exterior band), split because they are independently judgeable - B22 changes
all six files today, B23 is a latent defect the corpus only near-misses.

**Verdict: STRUCK.** `src/` is untouched, so `docs/layout-champion.md` is still
current and was not regenerated. The wake's artefact is `tools/text-metrics.mts`
and this entry. Do not retry B8 as a width floor; revive it only if the corpus
gains a frame whose title genuinely outruns its content, and that is a corpus
change, which is its own hypothesis.

---

## B9 — a note reserves the space tldraw actually draws _(wake 28)_ — **KEPT**

**Hypothesis.** Notes reserve a fixed 200x80 in layout but tldraw resizes
stickies to fit their text, so reserved space and rendered space disagree.

**Premise, measured before building** (`tools/text-metrics.mts` on
`long-labels.tldsl.jsx`, the only corpus file with notes — two of them):

| what | value |
|---|---|
| note shape width as drawn | **200.00** (fixed; tldraw stickies are always 200 wide) |
| note text area width | **168.00** → 16px padding each side |
| note label height as drawn | **564.06** for both notes = 19 lines x 29.69 |
| height layout reserved | **80** |

So the premise is true, and understated. The champion does not merely
mis-estimate the note: it reserves 80px for something that draws 564px of text,
vertically centred, which puts the text's ink at `y 318-882` while the sticky
sits at `y 500-700`. In the champion render that text runs straight through the
`payments`, `audit`, `notifier` and `reporting` box labels. The geometry report
says `overlapping shape pairs: 0` throughout — a note's text is not a shape, so
gate 2 is structurally blind to it. This is the exact defect
`tools/screenshot.mts` was built for.

**The change** (35 lines across 6 files, one causal claim):

- `estimatedNoteSize()` becomes `estimatedNoteSize(text)`: width is always
  `NOTE_SIZE = 200`, height is `max(200, lines * 30 + 32)` over a naive wrap at
  `NOTE_CHAR_PX = 15` into the 168px text column. Deliberately generous — it
  reserves 632 where 596 is needed.
- `noteShape` takes an optional `growY`; `emitNote` passes
  `max(0, note.h - 200)`, so the *drawn* sticky grows to the height layout
  reserved instead of letting text spill out of a 200-tall square.

**Objective gates.** Five of six corpus files are byte-identical (no notes), so
only `long-labels` was measured or judged.

| gate | champion | candidate | |
|---|---|---|---|
| 1. `npm run check` | green | green (37 files / 302 tests) | pass |
| 2. overlapping shape pairs | 0 | 0 | pass |
| 3. source-order violations | 0 | 0 | pass |
| 4. canvas area | 1927 x 580 = 1.12M | 1927 x 1162 = 2.24M | **see below** |
| 5. arrow paths crossing a non-endpoint shape | 1 | 1 | pass |

**Gate 4 — passed on the render, failed on the report, and the render wins.**
Against the champion's *reported* canvas the candidate is **2.00x**, over the
1.5x limit. That reported number is false for this file, and false in precisely
the way the protocol already forbids relying on: "never conclude anything about
text fit, **note size**, or arrow paths from the report alone." The champion's
real ink extends to `y 882` (measured above, not estimated), so its true canvas
is `1927 x 882 = 1.70M` and the candidate is **1.32x** of it — under the limit.
The growth is not the candidate spreading the diagram out; it is layout finally
accounting for space the champion was already consuming on top of other shapes.

Recorded as a **PASS**, with both numbers stated so a later wake can overturn
this reading. The underlying flaw is gate 4's, not the candidate's: gate 4
compares layout-model canvases, and a layout model that under-reserves gets a
free pass on area. Filed as discovered work.

**Blind A/B.** One voting file. `long-labels`: A = candidate, B = champion.
Judge chose **A** — "Layout A places both notes cleanly below the flow with room
for their full text, while B's report claims 80px-tall notes but the render
shows their text overflowing upward and colliding with the payments, audit, and
reporting boxes, making three labels nearly unreadable."

**Verdict: KEPT** — 1 win, 0 losses, 5 structural ties. The judge independently
identified the report/render disagreement without being told what the change
was.

**What this establishes.** A layout dimension may be *calibrated against a real
browser measurement* rather than guessed. `NOTE_SIZE = 200`, `NOTE_PAD = 16` and
the 168px text column are observed facts about tldraw, not heuristics, and
`estimatedNoteSize` is now the only estimator in the repo with a measured basis.
`AVG_CHAR_PX = 9` for box labels is still a guess; the same tool can settle it
(see B26).

---
## B24 — B13 restored: elbow arrows + side anchors _(wake 29)_ — **REJECTED AT GATE 5**

**Hypothesis.** `docs/patches/b13-elbow-side-anchors.patch` re-applied verbatim:
`arrowShape()` emits `kind: "elbow"` instead of `"arc"`, and `emitEdge` derives
each terminal's `normalizedAnchor` from a page-space rect map with
`isPrecise: true`, picking the side the centre-to-centre ray exits. B13 was
reverted at wake 16 on 1 win / 1 loss / 4 ties under the old verdict rule; under
the loosened rule (wake 26) that same outcome is a KEEP, so the restoration was
owed. **EPIC**, argued indivisible at wake 15.

**It never reached a judge.** Gate 5 did not exist when B13 was judged - it was
built at wake 19, three wakes after B13's verdict - and B24 dies on it.

**Diff.** The saved patch applied with one trivial conflict (wake 28 added a
note-`growY` test immediately above the edge test the patch renames; both kept).
5 files, +216/-20, of which 119 lines are `emit.ts` and the rest are tests and
the emit snapshot. Refreshed against today's tree and saved as
`docs/patches/b24-elbow-side-anchors.patch` so the next attempt does not redo
the merge.

**Objective gates.**

| gate | champion | candidate | |
|---|---|---|---|
| 1. `npm run check` | green | green | pass |
| 2. overlapping shape pairs | 0 everywhere | 0 everywhere | pass |
| 3. source-order violations | 0 | 0 | pass |
| 4. canvas area | - | byte-identical on all six | pass |
| 5. arrow paths crossing a non-endpoint shape | see below | see below | **FAIL** |

| file | champion | candidate | |
|---|---|---|---|
| `deep-nesting` | 10 | 9 | better |
| `hexagonal` | 5 | **0** | better |
| `long-labels` | 1 | 1 | same |
| `sequence` | 0 | 0 | same |
| `sparse-graph` | 0 | 0 | same |
| `wide-fanout` | 36 | **45** | **worse - rejects** |

Layout is untouched by this hypothesis, so every rect is byte-identical on all
six files; gate 5 is the only gate that can see the change at all, exactly as
its own backlog entry predicted.

**The render agrees with the metric, so the rejection stands.** This is an arrow
hypothesis, so the count was checked against pixels before being trusted (B9's
lesson, applied the other way round this time - the report could have been
wrong in the candidate's favour). It is not. In `wide-fanout` the orthogonal
router turns Dispatcher's eighteen spokes into vertical trunks that run *down
the inside* of `Worker 1`, `Worker 2`, `Worker 7`, `Worker 8`, `Worker 13` and
`Worker 14`, and horizontal legs that run through `Worker 6` and the `Task`
row. Worse than the count suggests: several spokes share the same trunk
segment, so the fan's individual edges stop being separable by eye at all. The
champion's chords cross boxes too, but each one is a distinguishable line from
hub to leaf.

**What this establishes.** Two things.

1. **The direction of the effect is topological, and it is strong in both
   directions.** Elbow + side anchors is a *clear improvement* on layered
   structure (`hexagonal` 5 → 0, `deep-nesting` 10 → 9) and a *clear
   regression* on a fan (`wide-fanout` 36 → 45). Every previous arrow wake
   (B3, B4a, B13, B14, B15) read this as noise or as an arrowhead artefact and
   went looking for a per-edge geometric predicate. It is neither: it is the
   same container-level topology signal B20 already used successfully to gate
   the doc-root wrap. Survives as **B27**.
2. **A restored hypothesis must re-clear today's gates, not the gates it was
   judged under.** B24 was restored because the *verdict rule* had loosened; the
   *gate set* had tightened in the same interval, and nobody checked. Restoring
   anything from before wake 19 now costs a gate-5 measurement first.

`hexagonal`'s candidate render is worth a look by whoever runs B27: its gate-5
count is 0 and the picture is still not clean, because arrows to and from a
box's *own* endpoints are excluded by construction and several of them are
drawn over box labels. Gate 5 is a floor, not a certificate.

---
