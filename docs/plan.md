# tldsl plan - Phase 10: drain the defect ledger

The ordered worklist for the layout loop. **This file is the only state that
survives between sessions.**

Phases 1-9 are done and archived in `docs/plan-archive-phase1-9.md` - along with
their Discovered work and their Questions for the human, both of which are
parked, not lost. Do not read the archive unless a task sends you there.

## Where this phase starts

Phase 9 authored seven real diagrams and logged what broke:
`docs/diagram-defects.md` holds **21 entries, 6 fixed, 3 half fixed, 13 open**.
Every entry has a severity, a repro under `examples/repro/`, and a written
account of what was attempted and what happened.

That ledger is this phase's input, and the thing worth noticing about it is
*how* it was built: every single entry was found by rendering a PNG and looking
at it. Not one was caught by `tldsl check`. That is why T41 comes first.

**This phase authors nothing.** No new example diagrams, no new repros except
where a task says so. It fixes what is already written down.

## The rule that makes this phase work

**A task is done when the ledger says so.** Closing an entry means three things,
all of them:

1. The repro under `examples/repro/` renders correctly - look at the PNG.
2. The real diagram the entry was found in renders better, and you looked at
   that too.
3. The entry's `- **Status:**` line becomes `fixed in <sha> (T<n>)` followed by
   what changed and what number moved. If only part of it is fixed, say which
   part and leave the rest open, the way T35 and T38 did.

An entry you decide not to fix is a legitimate outcome - write the reason into
the Status line and tick the task. A silently-still-open entry is not.

**Keep this file small.** It replaced a 4,052-line predecessor that nobody could
read. Two or three sentences under a ticked task, one line per Discovered work
entry. If a task needs an essay, it belongs in the ledger or in
`docs/decisions.md`.

## Standing decisions from the human

- **A crossing is not automatically a defect.** Crossing counts are a proxy for
  legibility, not the goal. Treat them as a direction of travel, not a contract.
  **Do not distort a layout to reach a number.** The pixels decide.

- **Frame title collisions are acceptable. Do not spend a task on them.** tldraw
  draws frame titles itself, outside the geometry the layout controls, and their
  size changes with zoom. Do not open follow-up work on title overlap, and do
  not count it as a regression. (D17's complaint about frame-name *size* is in
  scope; overlap is not.)

- **Questions do not stop the loop.** Take the reasonable default, write the
  question into `## Questions for the human`, and continue. See the loop prompt.

## Tasks

- [x] **T41. Make `check` see the diagram, not just the IR.** *(D15)*
  `check` validates the IR and says nothing about the picture. It printed
  nothing at all on a diagram where a note covered three of the four topic
  boxes. Meanwhile `tools/layout-report.mts` already computes
  `overlapping shape pairs` from the scene JSON and got it right.
  Fold the **scene-JSON-computable** occlusion checks into `tldsl check` as
  warnings: shape covering shape, label covering a shape it does not belong to.
  Not the arrow counters - those need a browser render and `check` must stay
  fast enough to run in a hook.
  Warnings, not errors: a diagram with a deliberate overlap must still compile,
  and the exit code must not change.
  **Acceptance:** `check examples/repro/d15-check-silent-on-occlusion.tldsl.jsx`
  names the covered shapes; `check examples/event-driven.tldsl.jsx` reports its
  four overlapping pairs; all twelve corpus files that are clean on every
  counter stay silent; `npm run check` green.
  **Done in `380823a`.** `domain/layout/occlusion.ts` computes two warnings from
  the positioned IR - `layout/shape-overlap` and `layout/label-overlap` - and
  `layout-report.mts` now imports its geometry from there instead of keeping a
  duplicate. All four acceptance clauses verified independently: twelve clean
  files silent, `event-driven` reports exactly its four pairs, exit code still 0.
  Renders are byte-identical to `docs/renders/`, so the `EdgeRoute.labelBox` it
  added really is non-behavioural.

- [x] **T42. Keep ELK's routed geometry instead of discarding it.** *(D21, D8's
  routing half, D14's distant half)*
  The largest open mechanism and the only remaining `wrong`-severity one. Every
  edge whose endpoints sit in different containers is drawn as a straight chord
  and nothing else is consulted: `notify -> commit` in `cicd-pipeline` is an
  1,100px line that enters the `cd` frame through its bottom border, passes
  through `Staging smoke tests`, and exits through the top. The adapter asks ELK
  to lay out the graph and then throws away the polyline it routed.
  D21's own correction is the design constraint: **length is what breaks, not
  direction.** The 159px backwards edge is fine; the long chord is not. A fix
  that routes everything orthogonally will make the short cases worse.
  **Acceptance:** `notify -> commit` no longer passes through a non-endpoint
  shape; `d21-backward-edge-is-a-chord` and `d8-auto-edges-cross-nodes` route
  around their obstacles; across the 23 measured files the crossing total falls
  and **no file rises**; `rollback -> deploy-prod` is still a short clean hop.
  **Done in `ab61acf`, and the task's premise was wrong.** ELK is not in the
  path for these diagrams at all - `placeAuto` runs only for `layout="auto"`,
  and `cicd-pipeline` is a deterministic `col` of `row` frames - and a tldraw
  arrow is `arc | elbow` with two bindings, so there is no polyline to preserve
  even where ELK does run. `elkjs`'s `.d.ts` and tldraw's arrow schema were both
  read before building. What shipped instead is a domain-level `detourAroundObstacles`
  pass triggered by *the chord already running through something*, not by length
  or direction, which is what D21's correction asked for. Crossings 43 -> 29,
  label-over-shape 7 -> 5, label-over-label 7 -> 6, no file rises; verified
  independently on the merged tree. `fail` and `rejected` in `cicd-pipeline`
  were deliberately left as chords: clearing that row needs a sagitta 2-4x the
  chord, which reads worse. That is placement, not routing.

- [ ] **T43. A note takes a side that is free and a width that is readable.**
  *(D3)*
  An attached note is parked to the right of its anchor at whatever width the
  container gives it. In `tcp-lifecycle` that hides the server's `CLOSED` state;
  in `event-driven` a one-sentence note renders 549px wide and erases three of
  four topics. The diagram silently omits content, which is why this is `wrong`
  and not `ugly`.
  Two halves, and the entry says both are needed: a **placement rule** that
  picks a side with room rather than always right, and a **default measure** so
  a sentence does not inherit its column's width. `w=` already works and is not
  the fix - it is a hand-tuned coordinate that rotates the overlap from
  horizontal to vertical.
  **Acceptance:** `d3-note-covers-shape` and `event-driven` drop to 0
  overlapping shape pairs; the `tcp-lifecycle` render shows the server reaching
  `CLOSED`; T41's new warning fires on neither.

- [x] **T44. A diagnostic names the component the author wrote.** *(D12, half of
  D16)*
  All eight container aliases report themselves as `<frame>` and both note kinds
  as `<note>`, so the error names an element that does not appear in the file.
  This is what failed T39's blind re-test: a clean seven-tier `<Layers>` stack
  rejected on line 6, naming `<frame>`.
  **Acceptance:** `d12-group-requires-id` errors say `<Group>`;
  `d16-note-maxw-rejected` says `<Sticky>` for a `<Sticky>`; every alias is
  covered by a test, not just the two in the repros.
  **Done in `ee8ec31`.** An optional `tag` on `AstFrame`/`AstNote` records the
  alias the runtime component was, and `displayTag` resolves it for the message;
  the IR `kind` still drives the allowlist and the synthetic-id hash, so nothing
  structural moved. All eight aliases plus both note kinds are pinned by a
  table-driven test. `<box>` became `<Box>` in the bargain - same principle,
  name what the author typed.

- [ ] **T45. `maxW` and multiline labels: make the prop tables true.** *(D16,
  D19)*
  Two documented things that do not work. `maxW` is documented on
  `<Note>`/`<Sticky>` and rejected by `check` (the allowed set has `w`
  instead). A `label="a\nb"` attribute passes `check` clean and renders the
  literal characters `\` and `n`, and the form that works - `label={"a\nb"}` -
  appears nowhere in the skill.
  Prefer implementing `maxW` over documenting `w`, because `maxW` is the name
  already in the skill and the one an author reaches for; if that turns out
  wrong, fix the skill instead and say why.
  Warn on a label containing a literal backslash-n. Document the expression form
  in `skills/tldsl/SKILL.md` - a C4 box needs three lines and the author
  currently finds that out by experiment.
  **Acceptance:** both repros compile in their documented form; the skill shows
  the multiline form; `check` warns on the literal one.

- [x] **T46. An unnamed container is unnamed.** *(D2)*
  A `<Row>` / `<Col>` / `<Grid>` / `<Graph>` with no `name` draws a border and captions
  itself with the literal word "Frame", so `tcp-lifecycle` carried three
  captions its author never wrote and `tcp-states` still ships one. `<Group>` is
  the workaround for the first three; `<Graph>` has none.
  Do not invent a placeholder for a container whose author declined to name it.
  **Acceptance:** `d2-unnamed-frame-caption` renders with no captions and no
  borders; `tcp-states` loses its stray "Frame"; a *named* frame is unchanged.
  **Done in `b52ee44`.** One predicate, `drawsChrome(frame) = !group && name !== undefined`,
  replaces the `group !== true` test at both places that decide chrome - `emit`
  (no frame shape) and `stack`'s `hasFrameChild` (no reserved title clearance,
  which is what would otherwise have left a gap where the caption was). Being a
  property of the frame rather than of the component, it covers `<Graph>`, which
  had no chrome-free alternative at all. Three existing tests were built on
  unnamed non-group frames - the bug baked into the fixtures - and got names so
  they keep testing what they meant to.

- [x] **T47. `maxW` holds on every geo, not just rectangles.** *(D20)*
  The same label with the same `maxW="200"` renders 188x152 as a rectangle and
  492x320 as a diamond - 2.5x its cap - and drags every sibling in its row to
  320px tall. Not the inscribed-rectangle factor: a diamond alone in a column
  honours the cap, so the width survives until the box is a row child.
  **Acceptance:** `d20-maxw-ignored-on-diamond` renders both shapes at their
  cap; `cicd-pipeline`'s `Commit` box stops being a 310px-tall box holding four
  words.
  **Done in `a8803df`, after two rejected attempts.** Three separate bugs stacked:
  `estimatedBoxSize` never re-checked `geoScale`'s inflated width against the cap
  (the root cause); capping by shrinking the whole box undid the inflation that
  kept the label *inside* the outline, so text rendered outside the diamond; and
  a row's shared height voted with the already-inflated `h`, so one capped
  diamond dragged `Commit` to 465px - worse than the 310px this task exists to
  fix. Final shape: cap the width, grow height until the outline-fit predicate
  holds, and vote for the row's shared height with *natural* content height.
  `Commit` 159x182, `quality-gate` 200x465 with its label contained. The tighter
  boxes also moved the arrow counters: 29 -> 26 crossings, crowded 2 -> 1.
  **Both rejections were caught by looking at the render, not the report** - each
  attempt's numbers were defensible and each render was wrong.

- [ ] **T48. Per-axis gap, and a tier that fills its parent.** *(D4, D10)*
  Two missing levers on containers, both worked around today by restructuring
  the diagram. `<Grid>` has one `gap` for both axes, so a ladder wanting 200px
  between columns and 16px between rows rendered 7,193px tall - `rowGap` and
  `colGap` are both rejected. And sibling frames in a column are each sized to
  their own contents, so `web-architecture`'s four tiers come out 540, 520,
  1569 and 616px wide inside one boundary; `align="stretch"` is rejected.
  A layered diagram is read by its horizontal bands, and ragged bands destroy
  that reading.
  **Acceptance:** `d4-single-axis-gap` sets its two axes independently;
  `d10-tiers-not-stretched` renders four tiers of equal width;
  `web-architecture` re-renders with aligned bands.

- [ ] **T49. The two notation gaps C4 exposed.** *(D17, D18)*
  A `<Frame>` takes `color` and nothing else, so a C4 system boundary cannot be
  dashed - and since a `<Box dash="dashed">` *is* allowed, the shipped render
  has boldly dashed external systems around a hairline boundary, C4's emphasis
  exactly inverted. Separately `geo` is tldraw's set verbatim: it has `heart`
  and `star` and neither `person` nor `cylinder`, so an actor and a database
  render as the same ellipse.
  The frame-*name* size complaint in D17 is in scope; frame-title **overlap** is
  not - see Standing decisions.
  **Acceptance:** both repros render the notation they describe; `c4-container`
  re-renders with a dashed boundary and distinguishable actors and datastore.

- [ ] **T50. Regression gate.**
  Same shape as T40. Every diagram file in the repo through `tldsl check` and
  `tldsl render`; the four counters re-measured against T40's numbers; every
  PNG looked at. Then walk `docs/diagram-defects.md` end to end: **every entry
  must be either `fixed in <sha>` or carry a written reason it is still open.**
  Anything found here that no entry covers goes into the ledger as a new entry -
  it does not get fixed in this task.
  **Acceptance:** all 44 files compile and render; no counter rose; the ledger
  has no entry whose status is a bare `open`.

## Discovered work

One line per entry. Anything you notice and do not act on. Never promote your
own entry into the task list; the human does that.

- Three defects T40 saw and did not log: arrow labels clipped by the export crop
  (`tcp-states` renders `passive open / -` as `ive open / -`), frame captions
  that nothing routes around, and notes taking their column's width rather than
  a readable measure (the last is T43).
- Four corpus renders (`c4-context`, `checkout-services`, `request-lifecycle`,
  `swimlanes-release`) had drifted from their committed PNGs before T35 and were
  never regenerated.
- `docs/baseline.md` is 933 lines of append-only history and is heading the same
  way `docs/plan.md` did.
- T41's `layout/shape-overlap` message picks its direction arbitrarily - it says
  the topic box covers the note when the render shows the reverse - and inlines
  the note's whole text, so a one-sentence note makes a 140-character warning.
- **`tldsl render` writes a `*.tldsl.overlay.json` next to every diagram it
  renders**, from z-index noise plus a few `parentId`/`y` deltas. Since
  `render = apply(overlay, compile(jsx))`, a stale one silently changes a later
  render - a live footgun for anyone measuring the corpus. Found by T42, which
  deleted them before every measurement to keep its numbers clean.
- T42's detour may swing an arc **outside its own container** to clear an
  obstacle: `Serializer -> Gateway` in `deep-nesting` now leaves the `System`
  frame entirely. It reads as an obvious return edge and beats cutting through
  `Router` and `Validator`, but nothing stops it leaving in a way that reads
  wrong on some other diagram.
- T42 found `computeCandidate` picks its side by *available gap* rather than
  *required sag*, which is why `t-payments -> dlq` bows 144px left out of the
  frame when ~60px right would have cleared `notifications`. This is D14's
  distant half.
- T41 relaxed the corpus tests from `diagnostics === []` to
  `hasErrors() === false`, correctly (order-states has a genuine warning), but
  nothing now fails if a change adds spurious warnings to a corpus file.

## Questions for the human

Parked from Phases 1-9, unread, in `docs/plan-archive-phase1-9.md`. Two are
load-bearing rather than cosmetic and are repeated here so they are not lost:

- **T22 shipped `absorb` as deterministic, not model-driven.** A departure from
  the agreed round-trip design.
- **T25's overlay hook reports canvas changes nobody made.**

New questions from this phase go below, in the shape the loop prompt gives.
