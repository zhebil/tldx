# Layout baseline

Taken at commit `148e306` ("layout: containers pick one box size, from measured
glyph widths (T0)"), on branch `ralph/jsx-layout`. This is the first baseline
measured against correct box geometry - everything in `docs/layout-champion.md`
and `docs/layout-hypotheses.md` predates the box-sizing fix (`2484ffa`) and the
container box-sizing work (`148e306`), and describes geometry that no longer
exists.

Regenerate with:

```bash
for f in tests/corpus/*.tldsl.jsx; do
  n=$(basename "$f" .tldsl.jsx)
  npx tsx tools/screenshot.mts "$f" "docs/renders/$n.png"
  npx tsx tools/layout-report.mts "$f"
done
npx tsx tools/arrow-truth.mts tests/corpus/*.tldsl.jsx
npx tsx tools/crossing-classify.mts tests/corpus/*.tldsl.jsx
```

Both tools are deterministic: two consecutive `arrow-truth` runs over the whole
corpus produced byte-identical output, vertices included.

## Per-file

`crossings` is `arrow paths crossing a non-endpoint shape` from
`tools/arrow-truth.mts` - one count per (arrow, crossed shape) pair. `canvas`
and `shapes` come from `tools/layout-report.mts`; `shapes` counts every
positioned element, of which `frames` are containers holding other elements.
`png` is the exported image at `pixelRatio` 2 with 32px padding.

| file | canvas | shapes | frames | arrows | crossings | png |
|---|---|---|---|---|---|---|
| deep-nesting | 594 x 790 | 13 | 4 | 8 | 9 | 1316 x 1708 |
| hexagonal | 1354 x 650 | 27 | 6 | 22 | 6 | 2836 x 1428 |
| long-labels | 2064 x 1066 | 12 | 0 | 8 | 5 | 4256 x 2260 |
| multi-region | 900 x 1222 | 21 | 5 | 14 | 6 | 1928 x 2572 |
| release-pipeline | 1350 x 978 | 17 | 0 | 20 | 5 | 2828 x 2084 |
| sequence | 361 x 1388 | 14 | 0 | 13 | 0 | 850 x 2904 |
| sparse-graph | 707 x 472 | 24 | 0 | 8 | 0 | 1542 x 1072 |
| wide-fanout | 1148 x 870 | 26 | 0 | 25 | 29 | 2424 x 1868 |
| **total** | | **154** | **15** | **118** | **60** | |

## Notes on the shape of the problem

- **60 crossings over 118 arrows.** Half of them (29) are in `wide-fanout`
  alone, where `Dispatcher` fans out to eighteen workers laid out in four rows;
  every chord from the dispatcher to a lower row passes through the rows above.
- `sequence` and `sparse-graph` are clean at zero. Both are single-axis layouts
  with only adjacent edges, so there is nothing for an arrow to skip over.
- The remaining five files sit at 5-9 each, a mix of same-axis skips inside one
  container and edges that leave their frame.
- **The renders are readable.** Labels no longer wrap mid-word anywhere in the
  corpus: `Gateway`, `Normalizer`, `Serializer`, `Dispatcher` and `Worker 18`
  all sit on one line inside their box. The remaining visual damage is arrows,
  not text.

The per-file numbers above are what T3 through T5 must beat, and no file may
gain a crossing.

## Crossing classification (T2)

`npx tsx tools/crossing-classify.mts tests/corpus/*.tldsl.jsx` buckets every
`(arrow, crossed shape)` pair from the table above. It joins `arrow-truth`'s
rendered geometry to the positioned IR's container tree (ids match: tldraw
shapes are `shape:<irId>`), and reuses `arrow-truth`'s exported `crossingPairs`
so the two tools cannot drift on what counts as a crossing.

Buckets, applied in this precedence order, first match wins:

- **same-axis skip** - all three of source, target and crossed shape share a
  parent container, the three are collinear along one axis, and the crossed
  shape's centre on that axis lies strictly between the endpoints'.
- **cross-container** - the endpoints have different parents.
- **fan** - the source's out-degree within its own container is >= 4.
- **other** - none of the above.

The axis is derived **geometrically** (all three y-ranges overlap => horizontal
axis; all three x-ranges overlap => vertical), not from the container's declared
`row` / `col` / `grid` mode. That was a free choice; it was taken because it
gives the right answer for one row of a `grid` too, which matters - `wide-fanout`
is a `grid` and holds half the corpus's crossings.

| file | same-axis skip | cross-container | fan | other | total |
|---|---|---|---|---|---|
| deep-nesting | 0 | 9 | 0 | 0 | 9 |
| hexagonal | 0 | 6 | 0 | 0 | 6 |
| long-labels | 3 | 0 | 0 | 2 | 5 |
| multi-region | 6 | 0 | 0 | 0 | 6 |
| release-pipeline | 5 | 0 | 0 | 0 | 5 |
| sequence | 0 | 0 | 0 | 0 | 0 |
| sparse-graph | 0 | 0 | 0 | 0 | 0 |
| wide-fanout | 19 | 0 | 10 | 0 | 29 |
| **total** | **33** | **15** | **10** | **2** | **60** |

`33 + 15 + 10 + 2 = 60`, so every crossing in the T1 baseline is classified and
the buckets sum to the total. **Same-axis skip is the largest bucket at 33 of
60**, so T3 through T5 rest on a real majority and the plan does not need
revisiting.

Three annotations the tool also prints. They overlap the buckets and are **not**
added into the sum:

- **crossed shape is an ancestor frame of an endpoint: 0.** The open question
  from T1 - whether an edge leaving its own frame should be charged for crossing
  that frame - does not arise anywhere in this corpus. No decision needed.
- **same-axis skips whose source is also a fan: 19, all in `wide-fanout`.**
  Every fan-sourced skip in the corpus independently qualifies as same-axis, so
  T3's bend and T6's fan placement will fight over the same 19 edges. Measure
  T3's effect on the other seven files if you want it isolated.
- **non-skip crossings that are skip-shaped anyway: 6, all in `deep-nesting`.**
  These are collinear-and-between - visually identical to a same-axis skip, a
  straight vertical run through a stacked neighbour - but bucketed
  `cross-container` because the endpoints straddle a frame boundary. Worth
  knowing before T3: if T3 triggers strictly on the `same-axis skip` bucket it
  will not touch them, even though the same bend would fix them.

### What this means for the buckets

- **`wide-fanout` (29) is not one problem.** 19 of its crossings are skips
  inside one grid row or one grid column (`hub -> leaf-5` clipping leaves 1-4 on
  the way); the other 10 are genuine diagonal fan chords from `hub` down two
  rows, where the crossed shape is in a different row entirely and no bend along
  an axis will help. T3 addresses the 19. T6 addresses the 10.
- **`deep-nesting` (9) and `hexagonal` (6) are entirely cross-container**, so
  T3-T5 as written will not move them at all. That is 25% of the corpus's
  crossings untouched by all of Phase 1.
- **`other` is only 2**, both in `long-labels` (`router -> orders` clipping
  `inventory` and `rate-limiter` on a diagonal). The four buckets are close to
  exhaustive for this corpus.

## Renders

One PNG per corpus file in `docs/renders/`, named after the fixture.

---

## After T3 (bend on same-axis skip edges)

Same corpus, same layout - only the arrows moved. Shape geometry (canvas,
shapes, frames, arrows) is byte-identical to the table above; `crossings` and
the exported `png` size are the only columns that changed, the latter because
the export crops to content and a bowed arrow can reach past the boxes.

| file | crossings (T1) | crossings (T3) | png |
|---|---|---|---|
| deep-nesting | 9 | 9 | 1316 x 1708 |
| hexagonal | 6 | 6 | 2836 x 1428 |
| long-labels | 5 | 5 | 4256 x 2283 |
| multi-region | 6 | **2** | 1928 x 2572 |
| release-pipeline | 5 | **0** | 2851 x 2107 |
| sequence | 0 | 0 | 850 x 2904 |
| sparse-graph | 0 | 0 | 1542 x 1072 |
| wide-fanout | 29 | **16** | 2486 x 1940 |
| **total** | **60** | **38** | |

Bucket split at T3, from `tools/crossing-classify.mts`:
**same-axis skip 11 (was 33), cross-container 15 (was 15), fan 10 (was 10),
other 2 (was 2).** The change is confined to the bucket it targeted; nothing
else moved, and no file gained a crossing.

The eleven surviving skips are all the same residue: the arc bows clear over
the middle of the span but still clips the box immediately beside an endpoint,
because both terminals still attach at shape centres so the first and last
stretch of the path runs along the axis. `wide-fanout`'s `e-leaf-5` crossing
`leaf-1` and `leaf-4` but not `leaf-2` or `leaf-3` is the signature. That is
exactly what T4 (side anchors) is specified to remove.

Two files are unchanged by construction rather than by failure:
`deep-nesting` (9) and `hexagonal` (6) are 100% cross-container, which T3 does
not touch. `multi-region`'s remaining 2 are the middle region, where the
required bow (~135px) exceeds the 40px gap to the neighbouring region frame on
both sides, so the edge stays straight rather than plough into a neighbour.

---

## After T4 (side anchors together with bend)

Same corpus, same layout - only the arrows moved again. Shape geometry is still
byte-identical to the T1 table; `crossings` and the exported `png` size are the
only columns that changed.

| file | crossings (T1) | crossings (T3) | crossings (T4) | png |
|---|---|---|---|---|
| deep-nesting | 9 | 9 | 9 | 1316 x 1708 |
| hexagonal | 6 | 6 | 6 | 2836 x 1428 |
| long-labels | 5 | 5 | **2** | 4256 x 2283 |
| multi-region | 6 | 2 | **0** | 1928 x 2572 |
| release-pipeline | 5 | 0 | 0 | 2851 x 2108 |
| sequence | 0 | 0 | 0 | 850 x 2904 |
| sparse-graph | 0 | 0 | 0 | 1542 x 1072 |
| wide-fanout | 29 | 16 | **10** | 2453 x 1905 |
| **total** | **60** | **38** | **27** | |

Bucket split at T4, from `tools/crossing-classify.mts`:
**same-axis skip 0 (was 11), cross-container 15 (was 15), fan 10 (was 10),
other 2 (was 2).** The bucket Phase 1 was written to eliminate is now empty.
Everything that remains is a bucket T3/T4 never claimed to touch.

### The `isExact` trap, found by looking at the render

The first pass of T4 measured 27 as well, but four of `multi-region`'s six skip
edges were **not drawn at all**. With `isPrecise: true` and an anchor that sits
exactly on the shape outline, tldraw's arc-vs-outline clipping in
`curved-arrow.ts` is degenerate: for one of the two bend signs it trimmed the
whole arc away and `MIN_ARROW_LENGTH` left a 10px stub. `arrow-truth` reported
`euw1-api-to-cache` as `(340,325) -> (337.1,334.6)` - a crossing count of zero
bought by deleting the arrow. Setting `isExact: true` on both terminals of a
routed edge skips that clipping entirely (`straight-arrow.ts:209-223`,
`curved-arrow.ts:107,185`); the terminal stays exactly on the anchor, which is
already on the outline, so nothing is lost visually. Total crossings were
unchanged at 27 after the fix, and two more arrows in `wide-fanout`
(`Dispatcher -> Worker 12`, `Dispatcher -> Worker 18`) came back from the same
collapse. A path-length sweep over the whole corpus now finds no arrow shorter
than 15px.

The remaining 27 are two groups: `deep-nesting` (9) and `hexagonal` (6) are
100% cross-container, and `wide-fanout`'s 10 are all fan edges out of
`Dispatcher`, which is T6's placement problem, not a routing one.

---

## After T5 (lanes for parallel skips)

New metric, new check in `arrow-truth`: a **crowded pair** is two arrow paths
that come within 8px of each other over more than a third of either path's
length - the number that catches two arcs rendering as one thick stroke with
two arrowheads. Crossings are unchanged at 27 in every file; only the sag of
already-bowed edges moved.

| file | crossings | crowded pairs (T4) | crowded pairs (T5) |
|---|---|---|---|
| deep-nesting | 9 | 4 | 4 |
| hexagonal | 6 | 0 | 0 |
| long-labels | 2 | 0 | 0 |
| multi-region | 0 | 3 | **0** |
| release-pipeline | 0 | 1 | **0** |
| sequence | 0 | 0 | 0 |
| sparse-graph | 0 | 0 | 0 |
| wide-fanout | 10 | 12 | **2** |
| **total** | **27** | **20** | **6** |

Every crowded pair that involved a *routed* edge is gone. `wide-fanout`'s four
`Dispatcher -> Worker 2..5` arcs, which shared a source anchor and all sagged
~12-13px, now sit in four visibly separate lanes; the same for
`Scheduler -> Task 2..4`, `multi-region`'s stacked column skips, and
`release-pipeline` row 1.

The six that remain are **not lanes-shaped**. All six are pairs of *straight*
arrows that are collinear because of where the boxes are, so there is no bend
to lane in the first place:

- `wide-fanout` 2: `hub -> leaf-7` / `hub -> leaf-14` and `hub -> leaf-8` /
  `hub -> leaf-16`. `leaf-7` sits exactly on the ray from `hub` to `leaf-14`,
  so one arrow is a prefix of the other. Both are fan edges out of
  `Dispatcher` - T6's placement problem, and fixing the placement removes the
  crowding and the crossing together.
- `deep-nesting` 4: the vertical chain at x=297 (`l1-gateway -> l2-router`,
  `l2-metrics -> l1-config`, `l3-validator -> l1-config`,
  `l2-router -> l3-handler`). Every one of these is cross-container, so
  `computeEdgeRoutes` declines it at the `from.parentId !== to.parentId` gate
  and it renders as a bare vertical segment.

Both groups are the same six arrows that still register as crossings, so
whatever fixes those buckets fixes this residue too.

## After T6 - fan-out placement

`npx tsx tools/crossing-classify.mts tests/corpus/*.tldsl.jsx`

| file | crossings (T5) | crossings (T6) | crowded pairs (T5) | crowded pairs (T6) |
|---|---|---|---|---|
| deep-nesting | 9 | 9 | 4 | 4 |
| hexagonal | 6 | 6 | 0 | 0 |
| long-labels | 2 | 2 | 0 | 0 |
| multi-region | 0 | 0 | 0 | 0 |
| release-pipeline | 0 | 0 | 0 | 0 |
| sequence | 0 | 0 | 0 | 0 |
| sparse-graph | 0 | 0 | 0 | 0 |
| wide-fanout | 10 | **0** | 2 | **0** |
| **total** | **27** | **17** | **6** | **4** |

The `fan` bucket is empty for the first time. `wide-fanout` went 10 -> 0
crossings and 2 -> 0 crowded pairs; no other file moved on either metric, and
only `docs/renders/wide-fanout.png` changed on disk.

The mechanism is placement, not new routing. A container laid out by the
doc-root auto-grid now collapses each fan - a source with >= 4 distinct targets
whose only edge is back to that source - into one block, and the block is a
single unwrapped **row** with the source at its head. Every fan edge therefore
shares a y-range with its source, `deriveAxis` resolves to horizontal, and
T3's bow, T4's side anchors and T5's lanes all fire on edges they previously
declined. Not one line of `routing.ts` changed.

The column form was tried first and measured **worse: 10 -> 32**. Source on the
left, targets stacked in a column beside it, source vertically centred: the
chord from the centred source to a target near either end of a 2000px column is
steep, so it enters the column's x-band far from its target and travels inside
it, slicing every rectangle on the way. "No target sits on the ray to another
target" was true and irrelevant - it constrains the *endpoints*, not the band
the chord passes through. Placement cannot make a diagonal chord safe; putting
the endpoints on a shared axis and letting the existing bow handle it can.

`wide-fanout`'s canvas is now **3722 x 204** (was 2453 x 1905), fill ratio
0.335. One unwrapped row of 19 boxes is what buys the zero. The arcs are not in
that box - the rendered PNG is far taller, and the 17 nested arcs converge into
a solid wedge of ink for the first ~15% of their length near `Dispatcher`.
`crowdedPairs` scores that 0 because the arcs diverge well before the
one-third-of-length threshold, so the metric is not lying, but the eye still
sees a blob. Both the aspect and the wedge are in Discovered work.

## After T6b - cross-container routing (criterion NOT met)

`npx tsx tools/crossing-classify.mts tests/corpus/*.tldsl.jsx`

| file | crossings (T6) | crossings (T6b) | crowded pairs (T6) | crowded pairs (T6b) |
|---|---|---|---|---|
| deep-nesting | 9 | **3** | 4 | **0** |
| hexagonal | 6 | 6 | 0 | 0 |
| long-labels | 2 | 2 | 0 | 0 |
| multi-region | 0 | 0 | 0 | 0 |
| release-pipeline | 0 | 0 | 0 | 0 |
| sequence | 0 | 0 | 0 | 0 |
| sparse-graph | 0 | 0 | 0 | 0 |
| wide-fanout | 0 | 0 | 0 | 0 |
| **total** | **17** | **11** | **4** | **0** |

Buckets: same-axis skip 0, cross-container **15 -> 9**, fan 0, other 2.
Arrow counts per file are unchanged and no rendered path is under 15px, so
nothing was bought by deleting an arrow. Only `docs/renders/deep-nesting.png`
changed on disk.

**The corpus now has zero crowded pairs**, which is the first time T5's
criterion has held everywhere - see T5 in `docs/plan.md`.

The change is the two gates T6b names, widened together in
`src/domain/layout/routing.ts`: the `from.parentId !== to.parentId` bail in
`computeCandidate`, and the `s.parentId === from.parentId` predicate building
`crossed`. `RouteCandidate.parentId` became the **lowest common ancestor** of
the two endpoints' parents, since a cross-container edge has no single parent
and that field is only a lane-grouping key. Nothing else moved: `deriveAxis`,
the `others`/`gap` scan and the overshoot viability test already ranged over
all shapes.

`deep-nesting`'s vertical chain was four bare collinear segments stacked into
one stroke, piercing Config, Router, Metrics, Handler and Validator with four
arrowheads on a single line. It is now four separate arcs, none of which
touches a box.

**Why the criterion (cross-container <= 5) was not met.** All nine survivors
are genuinely diagonal: neither the x-ranges nor the y-ranges of their
endpoints overlap, so `deriveAxis` returns `null`. `hexagonal`'s six
(`usecases -> p-notifications`, `usecases -> p-clock`, `usecases ->
p-orders-repo`, `http -> p-create-session`) and `deep-nesting`'s three
(`l3-handler -> l4-parser`, `l4-serializer -> l1-gateway` twice) are all of
this kind. Widening `deriveAxis` to fall back to the dominant axis
(`|dx| > |dy|`) was built and measured: **an exact no-op on all eight files**,
byte-identical route maps and byte-identical PNGs. The fallback is reachable
only when both perpendicular bands are disjoint, and `isCrossing` then requires
an obstacle tall (or wide) enough to bridge that gap; no box in this corpus is.
It was reverted. Bowing these edges needs a genuinely different routing
strategy, which T6b's own text rules out.

## After T7 - notes as geo shapes, and `on` attachment

| file | canvas before | canvas after | area | crossings before | crossings after |
|---|---|---|---|---|---|
| long-labels | 2064 x 1066 | **1538 x 848** | **-41%** | 2 | **0** |
| multi-region | 900 x 1222 | **900 x 832** | **-32%** | 0 | 0 |
| release-pipeline | 1350 x 978 | **1350 x 888** | **-9%** | 0 | 0 |

Corpus total **11 -> 9 crossings**, crowded pairs 0 -> 0, overlapping shape
pairs 0 everywhere. The five other files are byte-identical; only
`docs/renders/{long-labels,multi-region,release-pipeline}.png` changed.
Buckets: same-axis skip 0, cross-container 9, fan 0, other 0 - `long-labels`'s
two `other` crossings went with its note columns.

**Shape.** `<Note>` now emits a `geo` rectangle (`color: "yellow"`,
`fill: "semi"`) sized by T0's box path - `fitBoxWidth` / `boxHeightForWidth` -
instead of a tldraw sticky. A sticky is hardcoded 200px wide and can only grow
downward, which turned `note-payments` into a 200 x 662 column of five-word
lines. In a `col`/`grid` a geo note *receives* the container's shared box width
so it lines up with its siblings, but never votes on that width and never
takes the shared height: `release-pipeline` is a grid of 62px-tall boxes, and
letting a note vote on the shared height would have made every box in the file
~300px tall.

`<Sticky>` is a new component that keeps the old path, so hypothesis B9
(reserve the height tldraw will actually draw, via `growY`) is alive for
`<Sticky>` and dead for `<Note>`.

**Attachment.** `<Note on="target-id">` places the note beside what it
annotates. `src/domain/layout/attach.ts` runs at the end of `hybridLayout`:
the note is excluded from its container's flow (the same exclusion hard-pinned
children get), then placed 24px off the target on the first of
right/below/left/above that overlaps nothing, and **re-parented to the document
root** with absolute coordinates - tldraw frames clip their children, so a note
parented to a frame and placed beside that frame would be invisible. An `on`
naming an edge resolves to a 1x1 rect at the midpoint of the two endpoint
centres, ignoring the arc bow T3-T5 add.

Measured on `tests/e2e/fixtures/attached-notes.tldsl.jsx` (a new fixture, not
in the corpus - no corpus file uses `on`): both node-attached notes sit exactly
24px from their target and overlap nothing, canvas 1054 x 428, 0 overlapping
pairs. The unattached-note criterion (within 120px of the shape preceding it in
source order) holds across the corpus with no new code: 40px in `long-labels`
and `release-pipeline`, 96px in `multi-region`.

---

## After T8 - frame chrome reserved where it is actually drawn

| file | canvas before | canvas after | area | png before | png after |
|---|---|---|---|---|---|
| deep-nesting | 594 x 790 | **594 x 752** | **-4.8%** | 1316 x 1708 | 1316 x 1632 |
| hexagonal | 1354 x 650 | **1354 x 616** | **-5.2%** | 2836 x 1428 | 2836 x 1360 |
| multi-region | 900 x 832 | **900 x 766** | **-7.9%** | 1928 x 1792 | 1928 x 1660 |

The other five corpus files are byte-identical, canvas and render both.
Crossings are unchanged at **9** (deep-nesting 3, hexagonal 6; buckets
same-axis skip 0, cross-container 9, fan 0, other 0), crowded pairs 0,
overlapping shape pairs 0 everywhere.

**The measurement.** tldraw draws a frame's name heading entirely outside the
frame, above its top edge. `FrameHeading.js` positions the DOM node with
`bottom: 100%`; `FrameShapeUtil.toSvg` draws the heading rect at
`y = labelBounds.y - 6` with `height = labelBounds.height`, and
`getFrameHeadingSize` returns `Box(0, -opts.height, w, opts.height)` with
`getFrameHeadingOpts` fixing `height: 24`. The heading therefore occupies
y in [-30, -6] relative to the frame's own top edge and **zero pixels inside
it**. `sizeFrame` was adding `FRAME_TITLE_PX = 32` to every frame's top padding
to clear chrome that is not there, which is why every leaf-only frame in
`hexagonal` had a 48px top margin against a 16px bottom one.

**The change.** `FRAME_TITLE_PX` 32 -> 30 (the measured extent), and `sizeFrame`
reserves it only when the frame has a frame child - a *nested* frame's heading
is the one heading that does intrude into a parent's padding. A frame whose
children are all boxes or notes now gets `padTop = pad`, symmetric with its
other three sides.

**Why only three files moved.** Five of the eight corpus files contain no
`<Frame>` at all (`long-labels`, `release-pipeline`, `sequence`,
`sparse-graph`, `wide-fanout`), so no frame-chrome change can move their
geometry. T8's acceptance asked for four; three is the arithmetic ceiling and
all three were taken. See `docs/plan.md` `## Questions for the human`.

---

## After T12 - arrow labels, and the clearance they need

`<Edge label="publishes">` now reaches tldraw's arrow `text` prop, together
with `labelColor`, `font` and `size` (T10 and T11 both skipped `<Edge>`
explicitly *because* the label was dead). `tools/arrow-truth.mts` gained the
acceptance metric, printed as a third summary line per file:

```
arrow labels overlapping a non-endpoint shape: N
```

It reads the label's rectangle off `editor.getShapeGeometry(arrow).children[1]`
- `ArrowShapeUtil.getGeometry` folds the label rect into the shape's public
`Group2d` - maps its corners through `getShapePageTransform`, and counts one
row per (labeled arrow, overlapped shape) pair where the shape is neither
endpoint. `getArrowLabelPosition` itself is **not exported** from the `tldraw`
package, so the geometry group is the only public route to that box.

| file | crossings | crowded pairs | label overlaps |
|---|---|---|---|
| deep-nesting | 3 | 0 | 0 |
| hexagonal | 6 | 0 | 0 |
| long-labels | 0 | 0 | 0 |
| multi-region | 0 | 0 | 0 |
| release-pipeline | 0 | 0 | 0 |
| sequence | 0 | 0 | 0 |
| sparse-graph | 0 | 0 | 0 |
| wide-fanout | 0 | 0 | 0 |
| **total** | **9** | **0** | **0** |

**All eight corpus files compile to byte-identical scene JSON**, verified twice
(before/after via `git stash`, each dump asserted non-empty first - sizes ranged
24,988 to 66,254 bytes - then `diff -rq`). No corpus fixture carries an edge
label, so `docs/renders/` and the tables above are untouched; crossings are
unchanged at 9.

### The clearance mechanism, and the number that drove it

The first render of the new fixture `tests/e2e/fixtures/edge-labels.tldsl.jsx`
was unreadable: every label was force-wrapped into two or three narrow lines
sitting on top of the boxes. The cause is exact, in
`node_modules/tldraw/src/lib/shapes/arrow/arrowLabel.ts` (~82-95): for a
non-elbow arrow whose body is wider than tall, tldraw sets

```
width = max(min(w, margin), min(bodyBounds.width - margin, w))   // margin = 64
```

so a label renders at its natural width `w` only when the arrow body is at
least `w + 64` long. Between two adjacent boxes the body length *is* the
container's gap, and the gap was 24px against a ~130px label.

`labelClearanceGap` in `domain/layout/stack.ts` therefore raises a container's
gap to the widest clearance any qualifying labeled edge needs - one uniform gap
per container, the same shape as T0's one-box-size-per-container rule:

- horizontal main axis (`row`, and `grid` within a row): `arrowLabelWidth(label) + 64`
- vertical main axis (`col`): `arrowLabelLineHeight() + 2 * 4.25`

Only edges between two **consecutive** flowed siblings qualify. `auto` (ELK owns
its own spacing) and `free` (hard-pinned) are exempt.

**Arrow labels use a third font-size table.** `ARROW_LABEL_FONT_SIZES`
(`s:18 m:20 l:24 xl:28`) is not T11's `LABEL_FONT_SIZES` (`s:18 m:22 l:26 xl:32`)
and not `FONT_SIZES`. `arrowLabelWidth` reuses T11's measured per-glyph `ADVANCE`
tables with the arrow scale factor, which is exact given T11's linearity result.
`glyph-metrics.test.ts` pins that the two widths differ at size `m` so the
tables cannot be silently merged.

**Edges are declared at `<Doc>` level, and that broke the first attempt.** Every
fixture in this repo writes `<Edge>` as a sibling of the frames it connects, not
inside them. Scoping clearance to edges found in a container's own subtree made
the mechanism a 6px no-op. It now collects the document's labeled edges once at
the layout entry point and resolves each one to the pair of *direct children* of
each container that contain its endpoints.

**The number.** On the new fixture, label overlaps went **2 -> 1** and the render
went from three stacked label fragments per edge to legible one- and two-line
labels with their own clearance; canvas 757 x 234. The one survivor is
`e-ingest-publish over validate`: a bent skip edge whose label rides the arc's
apex and clips the top few pixels of the box it skips. Cross-container diagonal
edges (`on failure`, `writes`, `retries`) are still squished - their bodies are
wider than tall, so the 64px rule applies to them too, but the gap that would
clear them is horizontal space a `col` container's gap cannot provide. See
`docs/plan.md` `## Questions for the human`.

## After T13 - three realistic diagrams

Three fixtures added to `tests/corpus/`. They are **not gates**: the eight
stress fixtures above stay the files to measure, and no `src/` file changed, so
every number in every table above is untouched. These are the files to look at
when asking "is this good".

| file | canvas | shapes | frames | arrows | crossings | label overlaps | png |
|---|---|---|---|---|---|---|---|
| checkout-services | 869 x 640 | 16 | 4 | 10 | 1 | 0 | 1865 x 1408 |
| request-lifecycle | 934 x 642 | 12 | 2 | 8 | 0 | 0 | 1996 x 1412 |
| order-states | 532 x 1644 | 12 | 1 | 12 | 3 | 1 | 1192 x 3416 |

**T35 (`729f3bd`) moved `order-states` and nothing else in the corpus.** The
shared-pair fan separated `retry` / `declined` between *Awaiting payment* and
*On hold*, which had been one stroke with two overprinted labels: `arrow pairs
crowding each other` went **1 -> 0**, while `crossings` (3) and `label overlaps`
(1) held. `docs/renders/order-states.png` is re-rendered; canvas, shape and
arrow counts are unchanged, so the row above still stands. Every other corpus
file's route map is byte-identical.

`overlapping shape pairs` is 0 on all three. `checkout-services` is a four-tier
service architecture (Edge / Core / Data / Payments) with coloured traffic;
`request-lifecycle` is one `col` chain with two short-circuit branches;
`order-states` is a ten-state machine with two cycles on `layout="auto"`.

### What the renders showed that the reports did not

**The label-clearance rule is exact to the pixel, and a tie loses.** In a `row`,
the label that *sets* the gap renders squished while every other label in the
same row renders fine. `arrowLabelWidth("assets") = 70.27`, so the clearance is
`134.27`, so the gap is `134.27` - and tldraw still wrapped `assets` into
`asset`/`s`, while `quote` (62.67, riding the same 136px gap) rendered on one
line. The mechanism works; it just has no slack. Worked around fixture-side with
an explicit `gap="152"`, because widening `ARROW_LABEL_MARGIN` means editing the
two `stack.test.ts` cases that hardcode `+ 64` and that is T12's surface, not
T13's.

**`auto` is exempt from the clearance rule, and it shows.** ELK is handed node
sizes and `elk.spacing.nodeNode`, never a label size. At the default gap the
state machine came back as two crammed rows with seven wrapped labels. Two
fixture-side knobs fixed it without touching the engine: `gap="96"` (which does
reach ELK, as `nodeNode` and `nodeNodeBetweenLayers = gap * 1.5`) and
`direction="DOWN"`. Vertical arrows give a label the full horizontal room it
wants, so `DOWN` squished **zero** labels where `RIGHT` squished seven. Canvas
went 1467 x 542 (aspect 2.71) to 532 x 1644 (aspect 0.32).

**The cycle back-edge is the one visible defect, exactly where T13 predicted.**
`awaiting payment -> paid` runs straight up through `Shipped` and `Delivered`,
and its `captured` label lands on `Shipped` - the single label overlap in the
three files. A back-edge is a same-axis skip that runs backwards, and nothing in
Phase 1 routes inside an `auto` container.

**`fill="solid"` plus `labelColor="white"` is unreadable.** tldraw's solid geo
fill is a pale tint of the shape colour, not the colour itself, so white label
text on it is near-invisible. Dropped from all three fixtures; worth knowing
before any future fixture reaches for a "highlighted" box.

## After T16 - composite primitives

Four fixtures added to `tests/corpus/`, one per primitive. Like T13's three,
they are **not gates**: no `src/domain/` file changed (the four primitives are
pure `src/runtime/` wrappers over `<Frame>`), so every number in every table
above is untouched.

| file | canvas | shapes | frames | arrows | crossings | overlapping pairs | png |
|---|---|---|---|---|---|---|---|
| pipeline-build | 1165 x 102 | 7 | 1 | 5 | 0 | 0 | 2458 x 332 |
| layers-stack | 691 x 456 | 11 | 4 | 5 | 0 | 0 | 1510 x 1040 |
| swimlanes-release | 563 x 440 | 13 | 4 | 8 | 0 | 0 | 1254 x 1008 |
| graph-topology | 935 x 373 | 9 | 2 | 11 | 0 | 0 | 1998 x 874 |

`crossing-classify` on the four: `same-axis skip=0 cross-container=0 fan=0
other=0 total=0` for every one. That is the T16 acceptance criterion, and it
holds not by tuning but by construction - `<Pipeline>` only ever emits
adjacent-pair edges, and `<Layers>` / `<Swimlanes>` put every tier or lane in
its own container so a tier-to-tier edge can never be a same-axis skip.

**Zero total crossings, not just zero skips.** Even the cross-container bucket
is empty on all four, which is more than the criterion asked for. Worth
noting that `graph-topology` carries 11 arrows over 8 peers on `layout="auto"`
and still crosses nothing - ELK does well when the primitive stops the author
from imposing an order that isn't there.

One fixture needed a fixture-side fix found only by looking at the render: in
`layers-stack` the near-vertical `API gateway -> Postgres` edge clipped the
"Data tier" frame-name chip when Postgres was the leftmost box in that tier.
Swapping the tier's box order (Redis first) cleared it. No tool reported this -
`arrow-truth` counts arrows crossing *shapes*, and a frame's name chip is drawn
by tldraw outside the geometry the layout controls.

## After T16b (userland component library, first multi-file diagram)

One fixture added to `tests/corpus/`: `c4-context.tldsl.jsx`, which imports
`Person` / `System` / `Container` / `Boundary` from `tests/corpus/lib/c4.jsx` -
a vocabulary written in userland over `Box` and `Frame`, not shipped by the
library. Like T13's and T16's additions it is **not a gate**: no `src/domain/`
file changed, so every number in every table above is untouched. The only
`src/` change in T16b is `mappedSpan`'s span file (diagnostics, not geometry).

| file | canvas | shapes | frames | arrows | crossings | overlapping pairs | png |
|---|---|---|---|---|---|---|---|
| c4-context | 1105 x 460 | 6 | 1 | 4 | 0 | 0 | 2337 x 1048 |

`crossing-classify`: `same-axis skip=0 cross-container=0 fan=0 other=0 total=0`.

Three arrow labels were shortened while rendering this fixture, and the reason
is a defect rather than taste: tldraw wrapped `reads/writes`, then
`HTTPS/JSON`, then `persists` mid-word, each time in a corridor that
`text-metrics.mts` reported as wide enough for it. The corridor the layout
reserves for a horizontal arrow label is roughly one glyph narrower than what
tldraw needs, and because the corridor is sized *from* the label, shortening
the label does not escape the shortfall. Recorded under Discovered work; the
final labels (`calls`, `reads`, `charges card`) all render on one line.

## After T17 - serpentine rows in the auto-chosen grid

`src/domain/layout/stack.ts` (+21/-6): in the grid the engine picks itself
(`mayAutoGrid && mode === "col"`, the B20 auto-wrap), odd rows run
right-to-left. An explicit `layout="grid"` stays row-major. This is the re-test
of B21b, which was rejected in wake 24 on a crossing gate measured against
boxes 40% too narrow.

Whole-corpus diff of `canvas` and `total edge length`, before vs after, over all
sixteen fixtures: **one line moved.**

| file | canvas | total edge length | crossings |
|---|---|---|---|
| release-pipeline | 1350 x 888 (same) | 9558 -> **7762** (-19%) | 5 -> 5 |
| long-labels | 1538 x 848 (same) | 4877 -> 4877 | 0 -> 0 |
| every other fixture | unchanged | unchanged | unchanged |

`crossing-classify` over the whole corpus is byte-identical before and after:
`same-axis skip=3, cross-container=10, fan=0, other=0, total=13`. Overlapping
shape pairs stay 0 everywhere. `npm run check` green, 44 files / 534 tests (two
new unit tests in `stack.test.ts`).

**Only two of five grid files can see the change, and only one of them moves a
number.** `deep-nesting` and `hexagonal` have a single top-level child;
`wide-fanout` is now one row of 3722 x 204 after T6's fan collapse, and a
one-row grid has no odd row to mirror. `long-labels` does get mirrored rows -
`router` moves from x=0 to x=1052 - but its columns are all 486 wide and its
edges are symmetric about the row, so the length total lands on exactly the same
number.

**The gate number did not move: 13 crossings before, 13 after.** T17 asked to
keep it only if crossings drop. They did not, and they could not: the three
same-axis skips left in the corpus are inside `order-states`, which is
`layout="auto"` (ELK, not the grid), and the ten cross-container crossings are
in `deep-nesting` and `hexagonal`, neither of which reaches the auto-wrap. The
crossing budget serpentine was aimed at was already spent by T3-T6b.

**What moved is visible in the pixels, and it is a real improvement on
`release-pipeline`.** Before, the two row-boundary edges (`Security scan ->
Integration tests` and `Build image -> Push to registry`) ran the full width of
the canvas as long diagonals, and `Manual approval -> Canary 5%` did the same
into row 2. After, row 1 reads right-to-left, so those two become short hops
between adjacent columns and `Manual approval -> Canary 5%` becomes a straight
vertical drop. `long-labels` is a wash: `auth -> router` swaps a down-left
diagonal for a down-right one of identical length, and its rows now read
backwards, which for a diagram whose boxes are full sentences is arguably worse
prose order even though no metric notices.

## T36 - `layout="auto"` gets its edges (D7)

`collectAutoEdges(children)` walked only the container's own subtree, so an
`<Edge>` declared as a *sibling* of the `<Graph>` - which is how every
`layout="auto"` fixture in the repo is written - never reached ELK. With zero
edges, `elk.algorithm: layered` has nothing to layer and falls through to
component packing, which ignores `elk.spacing.nodeNode` (it uses
`componentComponent`, default 20) and ignores `elk.direction`. One cause, all
three of D7's symptoms. The doc-wide edge list that already threads down for
label clearance is now the input to `resolveEdgeOwners` in the auto branch, and
`elk.spacing.componentComponent` is set to the requested gap so a genuinely
disconnected graph honours it too.

Repro `examples/repro/d7-auto-ignores-graph.tldsl.jsx` (`a -> b -> c -> d`,
`gap="400"`, `direction="RIGHT"`): 2x2 block at 324 x 208 with 20px between
boxes, now a straight horizontal chain at 2344 x 126 with 600px between layers.
The same file at `gap="40" direction="DOWN"` is a vertical chain at 184 x 492
with 60px between layers - the two now differ, which is the acceptance D7 asked
for.

| file | canvas | crossings | crowded pairs | label overlaps |
|---|---|---|---|---|
| examples/tcp-states | 473 x 429 -> **817 x 1543** | 13 -> **5** | 5 -> **1** | 31 -> **4** |
| sparse-graph | 707 x 472 -> 671 x 572 | 0 -> 0 | 0 -> 0 | 0 -> 0 |
| graph-topology | unchanged | 0 | 0 | 0 |
| order-states | unchanged | 3 | 0 | 1 |

`tcp-states` is the diagram D7 was filed against and it stops being a pile: the
eleven states now read top-down as a real layered state machine, `LISTEN` and
`SYN_SENT` on the entry layer and `CLOSED` on the exit layer. `sparse-graph`
moved because its 24 disconnected nodes now separate at the requested gap rather
than ELK's 20px default - it repacks 5-wide to 4-wide and grows 100px taller,
with every counter still at zero. `graph-topology` and `order-states` render
byte-identically: both already declare their edges inside the auto container.

Still wrong in `tcp-states`, and owned by T37/T38, not fixed here: three labels
overprint each other on `FIN_WAIT_1` (D13), and `passive open / -` is clipped at
the canvas edge because nothing reserves room for a label outside the node box
(D8).

## T37 - an edge label slides off what it lands on (D13, D11, D8's label half)

Placement was unconditional: `labelPosition: 0.5`, hardcoded in `arrowShape`,
so every label sat at its arrow's midpoint regardless of what was already
there. `computeEdgeRoutes` now ends in a `placeLabels` pass. Each labelled edge
gets a measured label box (`arrowLabelWidth`/`arrowLabelLineHeight`, the same
metrics `labelClearanceGap` uses, plus tldraw's `ARROW_LABEL_PADDING`), and the
pass scores seven positions along the arrow - `0.5, 0.38, 0.62, 0.28, 0.72,
0.2, 0.8`, nearest-to-midpoint first - against the non-endpoint boxes and notes
and against *every other label*. First zero-score position wins; if none is
clear, the lowest-scoring one does, which for a short arrow with a wide label
is the midpoint it already had. The arrow body is the centre-to-centre chord
clipped at each endpoint's rectangle, and a bowed arrow's arc is approximated
by the parabola `bend * 4t(1-t)` on the perpendicular - an estimate, used only
for scoring. tldraw clamps `labelPosition` into a range that keeps the label
off the terminals (`getClampedPosition` in `arrowLabel.js`), so a slide it
cannot honour degrades to today's behaviour rather than pushing a label onto an
arrowhead.

Every label is a blocker for every other **from the start**: all labels are
seeded at their own midpoints before any is moved. The first cut only counted
labels already placed, which let an early edge move off a shape and land on a
later edge's default spot - `order-states` and `web-architecture` each traded
one shape overlap for one new label collision that way. Seeding removes the
trade: no file in the corpus or examples gets worse on either counter.

`tools/arrow-truth.mts` gained the metric D13 needed, since labels colliding
with *each other* were invisible to every tool in the repo:

```
arrow labels overlapping another label: N
```

| file | label over shape | label over label |
|---|---|---|
| `repro/d13-fan-labels-collide` | 0 -> 0 | 2 -> **0** |
| `repro/d11-edge-label-over-shape` | 2 -> **0** | 0 -> 0 |
| `repro/d8-auto-edges-cross-nodes` | 2 -> **1** | 0 -> 0 |
| examples/event-driven | 1 -> **0** | 12 -> **4** |
| examples/c4-container | 3 -> **1** | 4 -> **2** |
| examples/tcp-states | 4 -> **2** | 2 -> **0** |
| examples/web-architecture | 1 -> 1 | 1 -> 1 |
| tests/corpus/order-states | 1 -> 1 | 1 -> 1 |
| **corpus + examples total** | **12 -> 6** | **20 -> 7** |

The two rows that hold at 1/1 both moved and both read better. In
`web-architecture` `origin pull` has come off `app-3`, which was unreadable and
now reads - but `origin pull` now stacks a line above `charge`, and `enqueue`
has come off `streaming replication` onto the top edge of the `Postgres
primary` ellipse. Every one of those four strings is legible either way; the
counters cannot tell "stacked, both readable" from "overprinted". In
`order-states`
`retry` and `declined` are staggered rather than run together, still close
enough to count. Looking at the renders is the check that matters here: the
`d13` repro was one glyph run reading `publishOrderPlacsubscribelishPaymentCaptured`
and is now four separate labels, and `event-driven`'s bus reads label by label
for the first time.

`order-states` is the only corpus render that moved - one arrow in sixteen
files takes a non-default `labelPosition` (`s-awaiting-hold` at 0.72) - and its
PNG is re-rendered. Everything else in `tests/corpus/` compiles to the same
scene, so the rest of `docs/renders/` is untouched.

Not addressed, and still open: D9's clearance half (a row reserves a span ~50px
short for an adjacent-pair label, and nothing at all for a skip edge) is a
sizing question, not a placement one; D8's routing half is D21's. Sliding along
the arrow cannot help when the whole arrow is inside a shape's span, which is
what `tcp-states`' remaining two overlaps and `c4-container`'s `Mobile App`
pile are.

## T38 - an arrow label is measured in the font it is drawn in (D6, D9)

Group 4 of the triage, and the two entries turned out to be two unrelated
mechanisms that happened to produce the same complaint - the render showing a
string the author never wrote.

**D6 - the vanishing spaces are an export race, not a font bug.** A `<Box>`
label leaves `editor.toImage` as HTML inside a `<foreignObject>`; the browser
lays it out and the spaces are whatever the font says. An arrow label leaves as
a `<text>` whose `<tspan>`s each carry an absolute `x`, and `SvgTextLabel`
computes those by calling `editor.textMeasure.measureTextSpans` on a hidden DOM
node **at export time**. `exportImage` fired `toImage` the moment the first
shape was attached, which is before `tldraw_draw` has loaded, so the spans were
measured in the fallback `sans-serif` and then drawn in `tldraw_draw`, which
the exported SVG embeds:

| | `one` | space | `two` | `three` | total |
|---|---|---|---|---|---|
| measured (`sans-serif` fallback) | 33.37 | 5.56 | 31.12 | 45.59 | 121.19 |
| drawn (`tldraw_draw`, embedded) | 37.20 | 6.86 | 41.64 | 57.40 | 149.96 |

Every word is placed on a slot ~11% narrower than the glyphs that go in it, so
each word overruns into the next and the gaps close. The exported SVG for the
`d6` repro carried `x="39.789"`, `x="73.148"`, `x="78.711"` - the fallback
advances exactly. It explains the two things the "draw font eats spaces" story
never could: `font="sans"` only *reduced* the loss because `tldraw_sans` is
closer to the fallback than `tldraw_draw` is, and the loss is uneven within one
label because the error accumulates per word rather than per space. The fix is
two awaits in `src/infra/render/export-image.ts`:

```ts
await editor.fonts.loadRequiredFontsForCurrentPage();
await document.fonts.ready;
```

after which the same export carries `x="25.031"`, `x="62.219"`, `x="69.078"` -
the real advances - and `examples/tcp-states` reads `recv SYN / SYN+ACK`
throughout instead of `recvSYN/SYN+ACK`.

**D9 - the clearance shortfall, measured instead of estimated.** tldraw squishes
a horizontal arrow's label to `max(min(w, 64), min(bodyWidth - 64, w))` and
re-measures the text at that width, so the label wraps unless the arrow *body*
is at least `w + 64` long. `labelClearanceGap` reserved exactly `w + 64` on the
**gap** - but the body is shorter than the gap, because `straight-arrow.ts`
pulls the end terminal back by `BOUND_ARROW_OFFSET` (10) plus half the arrow's
stroke and half the bound shape's (1.75 each at size `m`). In the repro
`dequeue` needs a 136.2px body and got 127.4; the ledger's "~50px short" was an
eyeball, the real shortfall is 8.8px of body. `ARROW_LABEL_MARGIN` is now
`64 + 13.5`.

Corpus + examples, `tools/arrow-truth.mts`:

| counter | before | after |
|---|---|---|
| arrow paths crossing a non-endpoint shape | 43 | 43 |
| arrow pairs crowding each other | 2 | 2 |
| arrow labels overlapping a non-endpoint shape | 7 | 7 |
| arrow labels overlapping another label | 8 | **7** |

The only counter that moved is `c4-container`'s label-label collisions, 2 -> 1;
no file got worse on any counter. That is the point - the margin bump is 13.5px
on gaps that already exist, and D6 is invisible to every counter in the repo
because it changes no geometry at all. It only shows up in the pixels. Four
corpus renders moved (`c4-context`, `checkout-services`, `order-states`,
`request-lifecycle`) and all sixteen were regenerated; three of those four were
already carrying pre-T35 drift.

Still open from this group: `labelClearanceGap` reserves nothing at all for an
edge that skips a sibling (`Math.abs(from - to) !== 1` bails), which is the
half of D9 T37 also declined. And the fix is per-render, not per-viewer: the
live viewer never had the space bug, because the DOM lays the label out itself.

## T40 - end state

The regression gate. Every diagram file in the repo was run through
`tldsl check` and `tldsl render`: 16 in `tests/corpus/`, 7 in `examples/`, 21
in `examples/repro/`. **All 44 compile and all 44 render**, both exit 0. The
sixteen fresh corpus PNGs are byte-identical to the committed `docs/renders/`,
so nothing has moved since T38 and no re-render was needed.

Corpus + examples, `tools/arrow-truth.mts`:

| counter | T38 | T40 |
|---|---|---|
| arrow paths crossing a non-endpoint shape | 43 | 43 |
| arrow pairs crowding each other | 2 | 2 |
| arrow labels overlapping a non-endpoint shape | 7 | 7 |
| arrow labels overlapping another label | 7 | 7 |

Unchanged on every counter, which is the result the gate is for: no wake
between T38 and here moved a number in either direction.

Per file, where anything is non-zero (`crossings / crowded / label-over-shape /
label-over-label`):

| file | c | w | ls | ll |
|---|---|---|---|---|
| corpus/checkout-services | 1 | 0 | 0 | 0 |
| corpus/deep-nesting | 3 | 0 | 0 | 0 |
| corpus/hexagonal | 6 | 0 | 0 | 0 |
| corpus/order-states | 3 | 0 | 1 | 1 |
| examples/c4-container | 3 | 0 | 1 | 1 |
| examples/cicd-pipeline | 6 | 1 | 1 | 0 |
| examples/event-driven | 11 | 0 | 0 | 4 |
| examples/kernel | 1 | 0 | 0 | 0 |
| examples/tcp-lifecycle | 3 | 0 | 1 | 0 |
| examples/tcp-states | 5 | 1 | 2 | 0 |
| examples/web-architecture | 1 | 0 | 1 | 1 |
| **total (23 files)** | **43** | **2** | **7** | **7** |

The other twelve - `c4-context`, `graph-topology`, `layers-stack`,
`long-labels`, `multi-region`, `pipeline-build`, `release-pipeline`,
`request-lifecycle`, `sequence`, `sparse-graph`, `swimlanes-release`,
`wide-fanout` - are zero on all four.

For the record on where the 43 sit: `event-driven` alone holds 11 of them, and
it plus `hexagonal` and `cicd-pipeline` hold 23 of 43. Compared with the T1
baseline's 60 crossings over the 8 files that existed then, the corpus has since
roughly tripled in size and the count fell, but the fall is not evenly spread -
the fan-shaped and cross-container files still carry nearly all of it.

Every one of the 44 PNGs was looked at. The visible damage is all in ledger
entries already open and deliberately unfixed (D3, D8, D11's remainder, D21,
D2's `Frame` caption); three defects seen that no ledger entry and no counter
covers went to the plan's *Discovered work* rather than being fixed here.
