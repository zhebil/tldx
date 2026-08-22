# tldsl plan

Phase 10 (drain the defect ledger) is below; **Phase 11 is at the bottom of
this file** and is where current work is ordered.

# Phase 10: drain the defect ledger

The ordered worklist for the layout loop. **This file is the only state that
survives between sessions.**

Phases 1-9 are done. Their history (Discovered work, Questions for the human)
lived in `docs/plan-archive-phase1-9.md`, deleted as finished work now
recoverable from git history (`git log -- docs/plan-archive-phase1-9.md`) -
the two load-bearing items are repeated below so they are not lost.

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

- [x] **T43. A note takes a side that is free and a width that is readable.**
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
  **Done in `340b75f`.** Two mechanisms: `NOTE_MEASURE_PX = 260` gives a note its
  own readable measure instead of the `BOX_ASPECT_TARGET` meant for shape labels
  sharing a row width, and `pushClear` in `attach.ts` slides a candidate along
  its side past whatever still blocks it rather than rejecting the whole side at
  the first 24px collision. All four files go to **0** overlapping pairs, kernel
  included - it had three nobody had noticed. Merge conflict with T45 resolved as
  `el.maxW ?? NOTE_MEASURE_PX`: an author's explicit cap beats the default.
  **This was the biggest single win of the phase.** Nine of `event-driven`'s
  eleven crossings were edges crossing the misplaced note, so moving it took the
  corpus from 26 crossings to **10**, and crowded pairs to 0.

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

- [x] **T45. `maxW` and multiline labels: make the prop tables true.** *(D16,
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
  **Done in `acc79b3` and `4182e55`.** `maxW` implemented rather than documented
  away, after tracing the geometry: a `<Note>` emits as a real geo box sized like
  a `<Box>`, so a wrap cap is meaningful; a `<Sticky>` emits via tldraw's
  `noteShape`, which hardcodes 200px. The new `ir/literal-newline-in-label`
  warning fires on the string-attribute form and stays quiet on `label={"a\nb"}`.
  The skill gained four lines, not a reference manual.

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

- [x] **T48. Per-axis gap, and a tier that fills its parent.** *(D4, D10)*
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
  **Done in `8866180`.** `rowGap` / `colGap` each override `gap` on their own
  axis; `align` gains `stretch` on `row`/`col`, growing every flowed child to the
  container's cross-axis extent, with an explicit `w`/`h` opting out.
  **The acceptance as written was self-contradictory** - it asked the repros to
  *render* the fix while the rules forbade editing any diagram, and a repro for a
  missing prop can only demonstrate it by adopting it. The agent flagged that
  rather than quietly editing or quietly failing. Both repros and
  `web-architecture` now adopt the levers; `web-architecture`'s four tiers are
  1609px each, left edges aligned, and it reads as bands at last.
  **The trade, recorded:** stretching those tiers took `web-architecture` from 1
  crossing to 0, and from 0 to 1 label-over-shape and 0 to 1 label-over-label.
  Wider bands mean longer edges. Kept, because ragged bands were the defect.

- [x] **T49. The two notation gaps C4 exposed.** *(D17, D18)*
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
  **Both struck in `fba5983`, no code changed, and the citations check out.**
  `TLFrameShapeProps` is exactly `{ w, h, name, color }` - `dash` does not exist
  on tldraw's frame shape, and the heading is drawn by `FrameShapeUtil` with
  `fontSize: 12` hardcoded in `frameHelpers.ts:62`, reachable by no prop. `person`
  and `cylinder` are absent from the 20-value `GeoShapeGeoStyle` enum, which
  `styles.ts` already mirrors verbatim. Accepting `dash` on a frame would have
  been a silent no-op - the same trap T45 left with `maxW` on `<Sticky>` - and
  compositing a cylinder from primitives breaks the 1 IR element : 1 tldraw shape
  assumption that `emit`, `overlay`, `absorb` and viewer selection all rest on.
  I verified all three schema claims myself.

- [ ] **T51. The export crop cuts arrow labels off.**
  Found twice independently: `tcp-states` renders `passive open / -` as
  `ive open / -`, and a human benchmarking `layout="free"` hit the same thing on
  `recv FIN,ACK / ACK`, which renders as `IN,ACK / ACK`. The export bounds are
  computed from shape geometry, and an arrow *label* sits outside the arrow's own
  bounds, so anything hanging off the left or top of the content box is sliced.
  Cheapest correct fix is probably to union the label boxes into the export
  bounds - `EdgeRoute.labelBox` exists now, T41 added it - rather than inflating
  `padding`, which papers over it and wastes space on every other diagram.
  **Acceptance:** `tcp-states` renders `passive open / -` in full; the same holds
  for a free-layout file with a label hanging off the left edge; no other render
  gains whitespace.

- [ ] **T52. Two edges sharing a corridor overprint their labels.**
  T38 fixed a label sliding off *its own* shape and T37 fixed the midpoint stamp,
  but two different edges running the same corridor still stamp labels on top of
  each other. On the free-layout benchmark, `active open / SYN` and
  `close / timeout` collide at the top left. `arrow-truth` counts this as
  *arrow labels overlapping another label*, currently **3** across the corpus.
  T41's `layout/label-overlap` warning already reports it, so the measurement
  exists; this is the resolution half.
  **Acceptance:** label-over-label falls and no file rises; the benchmark file's
  top-left pair reads.

- [ ] **T53. Use ELK's routes where ELK actually runs, or stop asking for them.**
  `placeAuto` sets `"elk.edgeRouting": "ORTHOGONAL"`, ELK computes the routes,
  and the adapter reads only `result.children` - `result.edges[].sections` is
  dropped. It is not merely an adapter oversight: `AutoPlaceResult` has no field
  to carry a route, so the discard is baked into the domain/adapter contract, and
  the ORTHOGONAL option is paying for computation nobody reads.
  **Two constraints, both checked against the schema, that bound this task.**
  ELK runs *only* for `layout="auto"` - `placeAuto` is called inside
  `if (mode === "auto")` in `stack.ts` - so this cannot help `row`/`col`/`free`
  diagrams, which is why it is not urgent. And a tldraw arrow is
  `kind: "arc" | "elbow"`; the elbow is orthogonal but carries a single
  `elbowMidPoint` scalar, so a 2-bend ELK section maps onto it and a 4-bend one
  does not. Do not try to pour an arbitrary polyline into an arrow.
  So the honest options are: map the simple sections onto elbow arrows and leave
  the rest to `detourAroundObstacles`, or drop the ORTHOGONAL option and stop
  paying for it. Either is a result; decide from the render.
  **Acceptance:** either `tcp-states` and `d8-auto-edges-cross-nodes` improve on
  the counters with no file rising, or the option is removed and the ledger says
  why.

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
- **`maxW` on a `<Sticky>` is now accepted and silently does nothing** - tldraw
  fixes sticky width at 200px. The skill says so, but a no-op prop is a trap, and
  T44's `tag` on the AST now makes it possible to warn on that tag specifically.
- A flowed (non-`on`) `<Note maxW>` inside a `col`/`grid` is still overridden to
  the container's shared width by `applyContainerBoxSizing`. T45 left it to T43.
- **The overlay footgun bit the measurements, not just the renders.** Two stale
  `*.overlay.json` files sat in `examples/` from before the phase began, and
  because `render = apply(overlay, compile(jsx))` they silently altered
  `c4-container` and `tcp-lifecycle` in every `arrow-truth` run. Three
  intermediate counter readings this phase were wrong because of it - one by 4
  crossings. **Delete every sidecar before measuring, not after.** A real fix
  belongs in `render`: do not write an index-only overlay at all.
- **`align="stretch"` has no main-axis twin.** A stretched tier is full width but
  its children stay packed at the start, so `web-architecture`'s bands carry a
  lot of dead space on the right. There is no `justify` lever.
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

- **T49 - tldsl cannot draw C4, and the fix is a layer, not a prop.** D17 and D18
  are both blocked by tldraw itself: a frame has no `dash` and no font-size lever,
  and `person`/`cylinder` are not in the geo enum. The only real routes are a
  custom `ShapeUtil` registered in *both* `viewer/` and `infra/render`, plus a
  widened `contracts/scene-json.ts` - or accepting that C4's notation is out of
  scope and saying so in the skill.
  **Default taken:** struck both, with the schema citations in the ledger.
  **What the default costs:** a C4 diagram renders with its emphasis inverted -
  dashed external systems around a hairline boundary - and actors and datastores
  that look identical.

Parked from Phases 1-9 (history in git, see above). Two are load-bearing
rather than cosmetic and are repeated here so they are not lost:

- **T22 shipped `absorb` as deterministic, not model-driven.** A departure from
  the agreed round-trip design.
- **T25's overlay hook reports canvas changes nobody made.**

New questions from this phase go below, in the shape the loop prompt gives.

---

# Phase 11: the layout is the product

Phase 10 drained the ledger by rendering PNGs and looking at them. Phase 11's
input is different and better: **three independent field reports** from agents
who built real diagrams and wrote down what fought back. A TCP state machine
benchmarked four ways, an absorb/round-trip audit of 25 canvas edits, and a
15-diagram session across three rounds.

They agree on the headline. **Node placement is solved.** Nested `<Group>` with
zero coordinates matched a hand-pinned layout on the first pass and carried ten
diagrams without a single hand-written number. Everything still broken is edges,
labels, and the round-trip.

They also agree on why it matters. The whole pitch is that layout, edge
attachment and label placement are automatic - against a tool where the model
writes 51 hand-computed elements, tldsl writes five `gap` values. Every defect
below erodes exactly that advantage, which is why they outrank features.

## What changed about how we know things

Phase 10 trusted the ledger. Phase 11 starts by not trusting it: **three entries
marked fixed reproduce on any diagram that is not their own repro.**

| report | ledger entry | ledger claims |
|---|---|---|
| labels over shapes | D11 | "fixed in T37" |
| edge label wrap | D9 | wrap half "fixed in T38" |
| chords through boxes | D21 | "mostly fixed in T42" |

The repros are one-shape-pair toys. A fix passes its repro and fails a real
diagram. **A ledger entry closes against the corpus, not against its own
fixture** - that is the rule change for this phase.

## The constraint that shapes the edge work

Checked in `@tldraw/tlschema`, not assumed. `TLArrowShapeProps` is two endpoints
plus **exactly one scalar**: `bend` for an arc, `elbowMidPoint` for an elbow.
There is no points array.

**True waypoints are unrenderable on a tldraw arrow.** `TLLineShape` has
`points`, but a line has no arrowhead, no binding and no label. So the routing
work is *choose the best single bend*, not *emit a polyline* - and B8's
"use ELK's routes" is bounded by the same fact before anyone starts it.

## Two findings that shrank their own tasks

- **`check` already detects label-over-shape.** `computeOcclusionDiagnostics`
  (T41) emits `layout/label-overlap` naming the edge, the covered shape and the
  source line. Verified live. The placer just never asks. B2 is wiring, not
  detection.
- **`text` and `highlight` are already registered** in `builders.ts`'s schema
  versions. `<Text>` and a marker shape are additive - a builder, an emit
  branch, a lower branch. No schema widening, no custom `ShapeUtil`.

## The one that should worry us most

**A1: labels clip silently.** A nine-line label rendered five. Hit three times in
one session. It is the only known failure mode where `check` passes and the
diagram is wrong - every other defect in every report announced itself. An agent
following the skill's own advice ships missing content confidently.

The measurement code already exists in `defaults.ts`. It needs a comparison and
a diagnostic code. **A1 and G5 ship together** so the doc stops saying `check` is
sufficient on the same day the diagnostic lands.

## Tasks

All 35 are filed in bd, tagged `[A1]`-`[H1]`. bd is the source of truth for
status; this section is the source of truth for *order and parallelism*.

Phase 10's open tasks are carried in, not dropped: **T51 → B3**, **T52 → B1**,
**T53 → B7 + B8**. T50's regression gate becomes the phase-end gate below.

### Wave 1 - parallel, no shared files

| cluster | issues | files it owns |
|---|---|---|
| clipping | A1, A2 | `domain/layout/defaults.ts`, `domain/layout/occlusion.ts` |
| reciprocal labels | B1 | `domain/layout/routing.ts` |
| export bounds | B3 | `infra/render/export-image.ts` |
| CLI honesty | E1, E2, F1 | `cli/render.ts`, `infra/serve-registry/` |
| overlay safety | F2 | `domain/overlay/`, `app/absorb.ts` |
| docs | G2, G3, G4, G5, G6, G7 | `skills/` |

`routing.ts` is the contended file - **B1, B2, B5 and B6 must run serially**, in
that order. Nothing else in wave 1 touches it.

`cli/render.ts` is contended by E1, E2 and F1 - one agent takes all three.

### Wave 2

- **B2** - wire the placer to the diagnostic that already fires (after B1).
- **C1, C2** - `<Text>`, and decide what `<Note>` should be. One agent: both
  touch `builders.ts`, `emit.ts`, `lower.ts`.
- **C5** - container opt-out from height equalisation (`stack.ts`).
- **E3, E4, E5** - browser tab reuse, `tldsl measure`, stale `dist/`.
- **F5** - the round-trip design doc. Blocks F4 and F6; start it early because
  it is thinking, not typing.
- **A3** - the numeric-prop repro. **Repro first**: the reported root cause is
  unconfirmed and the likelier explanation is a component not forwarding the
  prop, which is a different bug with a different fix.

### Wave 3

- **B5** - obstacle-aware routing, single best bend. The largest piece of work
  in the phase.
- **B4** - edge label wrap budget. Re-scoped: it does *not* break mid-word, I
  rendered it. The defect is wrap width.
- **B9** - edge side anchoring. Independent of B5; ships on its own.
- **C4** - proportional non-rect geo.
- **F4** - absorb handles moves (after F5).

### Wave 4

- **B6** - router picks arc vs elbow (after B5).
- **B7, B8** - finish or retire ELK. **Last on purpose**: grouping makes
  `<Graph>` unnecessary for anything with readable structure, and B5 is what
  makes B8 possible at all. Doing ELK first is the intuitive call and the wrong
  one.
- **C3, D1, D2, D3** - marker shape, compact edge syntax, matrix swimlanes,
  `justify`.
- **G1** - restructure the skill into a referenced multi-file guide. Last so it
  documents what shipped, not what was planned.
- **H1** - pin the four undocumented capabilities with tests.

### Phase-end gate (was T50)

Every example and every repro through `check` and `render`. Counters re-measured
**with every `*.overlay.json` deleted first** - stale sidecars made three
readings wrong in Phase 10. Every PNG looked at. Every ledger entry either
`fixed in <sha>` or carrying a written reason.

Current clean baseline: **13 crossings / 1 crowded / 4 label-over-shape /
4 label-over-label**, down from 43 / 2 / 7 / 7 at Phase 10's start.

## Standing decisions added this phase

- **Fix routing before shipping hand-geometry.** `bend` and waypoints on
  `<Edge>` would let absorb capture curvature, but they also invite hand-drawn
  geometry into a DSL whose pitch is that you do not do geometry by hand. Four
  of five recorded curvature edits were spacing fixes - auto-routing's job. Fix
  B5 first; ship the escape hatch second, as an escape hatch. (F6 is
  deliberately blocked on B5 for this reason, not for a technical one.)

- **`<Group>` is the recommended authoring mode.** Confirmed under load: ten
  diagrams, zero coordinates. `<Graph>`/`layout="auto"` is a last resort and the
  skill now says so. This is why the ELK work ranks last.

- **A field report's root cause is a hypothesis.** Two of the three reports
  named a cause that did not survive checking - the mid-word wrap that wraps at
  token boundaries, and the numeric prop whose likelier explanation is a
  component that never forwarded it. Reproduce before implementing.
