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
