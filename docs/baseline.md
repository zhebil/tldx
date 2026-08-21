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
