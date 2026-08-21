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
