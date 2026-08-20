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
